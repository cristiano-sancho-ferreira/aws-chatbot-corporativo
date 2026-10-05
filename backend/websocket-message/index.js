const { randomUUID } = require('node:crypto');
const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require('@aws-sdk/client-bedrock-runtime');
const {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} = require('@aws-sdk/client-apigatewaymanagementapi');

const region = process.env.APP_REGION || process.env.AWS_REGION || 'us-east-1';
const modelId = process.env.BEDROCK_MODEL_ID;
const bedrock = new BedrockRuntimeClient({ region });
const apiGateway = new ApiGatewayManagementApiClient({
  endpoint: process.env.WS_CALLBACK_URL,
});

async function postToConnection(connectionId, payload) {
  await apiGateway.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(payload)),
    }),
  );
}

function parseRequest(event) {
  const body = readBody(event);
  const conversationId = body?.conversationId;
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  const history = Array.isArray(body?.history) ? body.history : [];

  if (!body || typeof body !== 'object') {
    throw new Error('Corpo da mensagem inválido.');
  }
  if (typeof conversationId !== 'string' || !conversationId) {
    throw new Error('conversationId é obrigatório.');
  }
  if (!content || content.length > 4000) {
    throw new Error('A mensagem deve conter entre 1 e 4000 caracteres.');
  }

  const validHistory = history
    .filter(
      (message) =>
        (message?.role === 'user' || message?.role === 'assistant') &&
        typeof message.content === 'string',
    )
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: [{ text: message.content.slice(0, 2000) }],
    }));

  return {
    conversationId,
    content,
    history: [...validHistory, { role: 'user', content: [{ text: content }] }],
  };
}

function readBody(event) {
  if (typeof event.body !== 'string') return event.body;
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  const connectionId = event.requestContext?.connectionId;
  if (!connectionId) {
    throw new Error('API Gateway não informou o ID da conexão WebSocket.');
  }

  let request;
  try {
    request = parseRequest(event);
  } catch (error) {
    const body = readBody(event);
    await postToConnection(connectionId, {
      type: 'error',
      conversationId: body?.conversationId ?? '',
      error: error.message,
    });
    return { statusCode: 400 };
  }

  let answer;
  try {
    const response = await bedrock.send(
      new ConverseCommand({
        modelId,
        system: [
          {
            text: 'Você é um assistente virtual de uma pizzaria. Responda em português, com clareza e cordialidade. Não invente itens de cardápio, preços, promoções ou status de pedidos; quando não tiver esses dados, explique que não tem acesso a eles.',
          },
        ],
        messages: request.history,
        inferenceConfig: {
          maxTokens: 500,
          temperature: 0.5,
        },
      }),
    );
    answer = response.output?.message?.content
      ?.filter((block) => typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
      .trim();
    if (!answer) {
      throw new Error('Bedrock retornou uma resposta vazia.');
    }
  } catch (error) {
    console.error('Falha ao invocar o modelo do Bedrock:', error);
    await postToConnection(connectionId, {
      type: 'error',
      conversationId: request.conversationId,
      error: 'Não foi possível gerar uma resposta agora. Tente novamente.',
    });
    return { statusCode: 200 };
  }

  await postToConnection(connectionId, {
    type: 'chunk',
    conversationId: request.conversationId,
    messageId: randomUUID(),
    content: answer,
  });
  await postToConnection(connectionId, {
    type: 'done',
    conversationId: request.conversationId,
  });

  return { statusCode: 200 };
};
