const { randomUUID } = require('node:crypto');
const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require('@aws-sdk/client-bedrock-runtime');
const {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} = require('@aws-sdk/client-apigatewaymanagementapi');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const region = process.env.APP_REGION || process.env.AWS_REGION || 'us-east-1';
const modelId = process.env.BEDROCK_MODEL_ID;
const historyTable = process.env.CHAT_HISTORY_TABLE;

// Quantas mensagens anteriores carregamos do DynamoDB para contexto do Bedrock
const HISTORY_LIMIT = 20;

// TTL: 30 dias a partir de agora (segundos Unix)
const TTL_SECONDS = 60 * 60 * 24 * 30;

const bedrock = new BedrockRuntimeClient({ region });
const apiGateway = new ApiGatewayManagementApiClient({
  endpoint: process.env.WS_CALLBACK_URL,
});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

// ── DynamoDB helpers ──────────────────────────────────────────────────────────

/**
 * Carrega as últimas HISTORY_LIMIT mensagens da conversa, ordenadas do mais
 * antigo para o mais recente (ScanIndexForward = true).
 */
async function loadHistory(conversationId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: historyTable,
      KeyConditionExpression: 'conversationId = :cid',
      ExpressionAttributeValues: { ':cid': conversationId },
      ScanIndexForward: true,          // cronológico (SK timestamp ASC)
      Limit: HISTORY_LIMIT,
    }),
  );
  return (result.Items ?? []).map((item) => ({
    role: item.role,
    content: [{ text: item.content }],
  }));
}

/**
 * Persiste uma mensagem individual na tabela de histórico.
 */
async function saveMessage({ conversationId, messageId, role, content }) {
  await dynamo.send(
    new PutCommand({
      TableName: historyTable,
      Item: {
        conversationId,
        timestamp: new Date().toISOString(),
        messageId,
        role,
        content,
        ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
      },
    }),
  );
}

// ── WebSocket helper ──────────────────────────────────────────────────────────

async function postToConnection(connectionId, payload) {
  await apiGateway.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(payload)),
    }),
  );
}

// ── Request parsing ───────────────────────────────────────────────────────────

function readBody(event) {
  if (typeof event.body !== 'string') return event.body;
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
}

function parseRequest(event) {
  const body = readBody(event);

  if (!body || typeof body !== 'object') {
    throw new Error('Corpo da mensagem inválido.');
  }

  const conversationId = body?.conversationId;
  const content = typeof body?.content === 'string' ? body.content.trim() : '';

  if (typeof conversationId !== 'string' || !conversationId) {
    throw new Error('conversationId é obrigatório.');
  }
  if (!content || content.length > 4000) {
    throw new Error('A mensagem deve conter entre 1 e 4000 caracteres.');
  }

  return { conversationId, content };
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const connectionId = event.requestContext?.connectionId;
  if (!connectionId) {
    throw new Error('API Gateway não informou o ID da conexão WebSocket.');
  }

  // 1. Valida o payload recebido
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

  const { conversationId, content } = request;
  const userMessageId = randomUUID();

  // 2. Persiste a mensagem do usuário no DynamoDB
  try {
    await saveMessage({ conversationId, messageId: userMessageId, role: 'user', content });
  } catch (error) {
    console.error('Falha ao salvar mensagem do usuário:', error);
    // Não aborta — segue em frente sem o registro desta mensagem
  }

  // 3. Carrega o histórico completo (inclui a mensagem que acabou de ser salva)
  let history = [];
  try {
    history = await loadHistory(conversationId);
  } catch (error) {
    console.error('Falha ao carregar histórico:', error);
    // Fallback: usa só a mensagem atual
    history = [{ role: 'user', content: [{ text: content }] }];
  }

  // Garante que a mensagem atual está no histórico (caso o save acima tenha falhado)
  if (history.length === 0 || history[history.length - 1].role !== 'user') {
    history.push({ role: 'user', content: [{ text: content }] });
  }

  // 4. Invoca o Bedrock com o histórico completo
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
        messages: history,
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
      conversationId,
      error: 'Não foi possível gerar uma resposta agora. Tente novamente.',
    });
    return { statusCode: 200 };
  }

  // 5. Persiste a resposta do assistente no DynamoDB
  const assistantMessageId = randomUUID();
  try {
    await saveMessage({ conversationId, messageId: assistantMessageId, role: 'assistant', content: answer });
  } catch (error) {
    console.error('Falha ao salvar resposta do assistente:', error);
  }

  // 6. Envia a resposta ao cliente via WebSocket
  await postToConnection(connectionId, {
    type: 'chunk',
    conversationId,
    messageId: assistantMessageId,
    content: answer,
  });
  await postToConnection(connectionId, {
    type: 'done',
    conversationId,
  });

  return { statusCode: 200 };
};
