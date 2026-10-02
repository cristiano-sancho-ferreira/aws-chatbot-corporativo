function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

function parseJwtPayload(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token ausente ou inválido');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Token JWT inválido');
  }

  const payload = JSON.parse(base64UrlDecode(parts[1]));
  return payload;
}

function getTokenFromEvent(event) {
  const headers = event.headers || {};
  const queryString = event.queryStringParameters || {};

  const headerToken =
    headers.Authorization ||
    headers.authorization ||
    headers['x-amazon-apigateway-authorizer'] ||
    headers['X-Amz-Security-Token'];

  if (headerToken) {
    return headerToken.replace(/^Bearer\s+/i, '').trim();
  }

  if (queryString.token) {
    return decodeURIComponent(queryString.token);
  }

  return null;
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
  const methodArn = event.methodArn || 'arn:aws:execute-api:*:*:*/*/$connect';

  try {
    const token = getTokenFromEvent(event);
    if (!token) {
      throw new Error('Token não informado');
    }

    const payload = parseJwtPayload(token);
    const userId = payload.sub || payload['cognito:username'] || payload.email || 'anonymous';

    return generatePolicy('Allow', methodArn, userId, {
      userId,
      email: payload.email || '',
      userName: payload['cognito:username'] || '',
      tokenValid: 'true',
    });
  } catch (error) {
    return generatePolicy('Deny', methodArn, 'unknown', {
      userId: 'unknown',
      reason: error.message || 'invalid_token',
      tokenValid: 'false',
    });
  }
};
