const { createPublicKey, createVerify } = require('node:crypto');

const issuer = process.env.COGNITO_ISSUER;
const clientId = process.env.COGNITO_CLIENT_ID;
const jwksUrl = `${issuer}/.well-known/jwks.json`;

let cachedKeys;
let cachedAt = 0;

function decodeJsonSegment(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

async function getSigningKey(kid, refresh = false) {
  if (!issuer || !clientId) {
    throw new Error('Configuração do Cognito ausente.');
  }

  if (
    refresh ||
    !cachedKeys ||
    Date.now() - cachedAt > 60 * 60 * 1000
  ) {
    const response = await fetch(jwksUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`Falha ao buscar as chaves Cognito: ${response.status}`);
    }
    const jwks = await response.json();
    if (!Array.isArray(jwks.keys)) {
      throw new Error('Resposta de chaves Cognito inválida.');
    }
    cachedKeys = jwks.keys;
    cachedAt = Date.now();
  }

  let key = cachedKeys.find((candidate) => candidate.kid === kid);
  if (!key) {
    if (!refresh) return getSigningKey(kid, true);
    throw new Error('Chave de assinatura Cognito não encontrada.');
  }
  if (key.kty !== 'RSA' || key.use !== 'sig' || key.alg !== 'RS256') {
    throw new Error('Chave de assinatura Cognito inválida.');
  }
  return createPublicKey({ key, format: 'jwk' });
}

async function verifyIdToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Token JWT inválido.');
  }

  const header = decodeJsonSegment(parts[0]);
  const payload = decodeJsonSegment(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('Algoritmo ou chave JWT inválidos.');
  }

  const publicKey = await getSigningKey(header.kid);
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (!verifier.verify(publicKey, Buffer.from(parts[2], 'base64url'))) {
    throw new Error('Assinatura do token inválida.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    payload.iss !== issuer ||
    payload.aud !== clientId ||
    payload.token_use !== 'id' ||
    typeof payload.exp !== 'number' ||
    payload.exp <= now ||
    typeof payload.sub !== 'string'
  ) {
    throw new Error('Token Cognito expirado ou destinado a outro aplicativo.');
  }

  return payload;
}

function getTokenFromEvent(event) {
  const headers = event.headers || {};
  const queryString = event.queryStringParameters || {};
  const headerToken = headers.Authorization || headers.authorization;

  if (headerToken) {
    return headerToken.replace(/^Bearer\s+/i, '').trim();
  }
  return queryString.token || null;
}

function generatePolicy(effect, resource, principalId, context = {}) {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    context,
  };
}

exports.handler = async (event) => {
  const methodArn = event.methodArn;
  try {
    const token = getTokenFromEvent(event);
    if (!token) {
      throw new Error('Token não informado.');
    }

    const payload = await verifyIdToken(token);
    return generatePolicy('Allow', methodArn, payload.sub, {
      userId: payload.sub,
      email: payload.email || '',
      userName: payload['cognito:username'] || '',
    });
  } catch (error) {
    console.error('Conexão WebSocket não autorizada:', error.message);
    return generatePolicy('Deny', methodArn, 'unknown');
  }
};
