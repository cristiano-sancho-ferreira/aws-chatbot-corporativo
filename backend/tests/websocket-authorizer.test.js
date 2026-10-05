const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { test } = require('node:test');

process.env.COGNITO_ISSUER = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test';
process.env.COGNITO_CLIENT_ID = 'client-test';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const keyId = 'test-key';

global.fetch = async () => ({
  ok: true,
  json: async () => ({
    keys: [
      {
        ...publicKey.export({ format: 'jwk' }),
        kid: keyId,
        use: 'sig',
        alg: 'RS256',
      },
    ],
  }),
});

const { handler } = require('../websocket-authorizer/index');

function createToken(claims) {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: keyId })
  ).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signedContent = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(signedContent), privateKey)
    .toString('base64url');
  return `${signedContent}.${signature}`;
}

function createEvent(token) {
  return {
    methodArn: 'arn:aws:execute-api:us-east-1:123456789012:api/prod/$connect',
    queryStringParameters: { token },
  };
}

function claims(overrides = {}) {
  return {
    sub: 'user-123',
    iss: process.env.COGNITO_ISSUER,
    aud: process.env.COGNITO_CLIENT_ID,
    token_use: 'id',
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  };
}

test('allows a signed, unexpired Cognito ID token for the configured app', async () => {
  const result = await handler(createEvent(createToken(claims())));
  assert.equal(result.policyDocument.Statement[0].Effect, 'Allow');
  assert.equal(result.principalId, 'user-123');
});

test('denies a token with a modified signature', async () => {
  const parts = createToken(claims()).split('.');
  parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
  const forgedToken = parts.join('.');
  const result = await handler(createEvent(forgedToken));
  assert.equal(result.policyDocument.Statement[0].Effect, 'Deny');
});

test('denies an expired token', async () => {
  const result = await handler(
    createEvent(createToken(claims({ exp: Math.floor(Date.now() / 1000) - 1 })))
  );
  assert.equal(result.policyDocument.Statement[0].Effect, 'Deny');
});
