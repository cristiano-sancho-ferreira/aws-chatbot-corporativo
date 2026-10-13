const assert = require('node:assert/strict');
const { test } = require('node:test');

process.env.APP_REGION = 'us-east-1';
process.env.BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0';
process.env.WS_CALLBACK_URL = 'https://api.example.com/prod';

const bedrockRuntime = require('../websocket-message/node_modules/@aws-sdk/client-bedrock-runtime');
const apiGatewayManagement = require('../websocket-message/node_modules/@aws-sdk/client-apigatewaymanagementapi');

let bedrockRequest;
let postedMessages;

bedrockRuntime.BedrockRuntimeClient.prototype.send = async (command) => {
  bedrockRequest = command.input;
  return {
    output: {
      message: {
        content: [{ text: 'Olá! Como posso ajudar?' }],
      },
    },
  };
};

apiGatewayManagement.ApiGatewayManagementApiClient.prototype.send = async (
  command
) => {
  postedMessages.push(JSON.parse(command.input.Data.toString('utf8')));
};

const { handler } = require('../websocket-message/index');

test('invokes Bedrock with conversation history and posts the answer to the socket', async () => {
  postedMessages = [];
  const result = await handler({
    requestContext: { connectionId: 'connection-1' },
    body: JSON.stringify({
      action: 'sendMessage',
      conversationId: 'conversation-1',
      content: 'Tem promoção?',
      history: [
        { role: 'user', content: 'Oi' },
        { role: 'assistant', content: 'Olá!' },
      ],
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(
    bedrockRequest.messages.map((message) => ({
      role: message.role,
      content: message.content[0].text,
    })),
    [
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Olá!' },
      { role: 'user', content: 'Tem promoção?' },
    ]
  );
  assert.deepEqual(postedMessages[0], {
    type: 'chunk',
    conversationId: 'conversation-1',
    messageId: postedMessages[0].messageId,
    content: 'Olá! Como posso ajudar?',
  });
  assert.equal(postedMessages[1].type, 'done');
});

test('returns a visible error for a message that exceeds the size limit', async () => {
  postedMessages = [];
  const result = await handler({
    requestContext: { connectionId: 'connection-1' },
    body: JSON.stringify({
      conversationId: 'conversation-1',
      content: 'x'.repeat(4001),
    }),
  });

  assert.equal(result.statusCode, 400);
  assert.equal(postedMessages[0].type, 'error');
  assert.equal(postedMessages[0].conversationId, 'conversation-1');
});
