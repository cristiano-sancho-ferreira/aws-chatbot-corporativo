'use strict';

const { randomUUID } = require('node:crypto');
const {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} = require('@aws-sdk/client-bedrock-runtime');
const {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} = require('@aws-sdk/client-apigatewaymanagementapi');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
} = require('@aws-sdk/lib-dynamodb');

const region         = process.env.APP_REGION || process.env.AWS_REGION || 'us-east-1';
const modelId        = process.env.BEDROCK_MODEL_ID;
const historyTable   = process.env.CHAT_HISTORY_TABLE;
const ordersTable    = process.env.ORDERS_TABLE;
const summariesTable = process.env.SUMMARIES_TABLE;

// Sliding window: quantas mensagens recentes carregamos do DynamoDB
const HISTORY_LIMIT = 20;

// Quantos pedidos recentes incluímos no contexto
const ORDERS_LIMIT = 5;

// TTL: 30 dias
const TTL_SECONDS = 60 * 60 * 24 * 30;

// Palavras-chave que indicam intenção de consultar pedidos
const ORDER_INTENT_PATTERN =
  /\b(pedido|pedidos|compra|compras|pedi|último pedido|últimos pedidos|meu pedido|meus pedidos|status do pedido|minha compra|minhas compras|histórico)\b/i;

const bedrock = new BedrockRuntimeClient({ region });
const apiGateway = new ApiGatewayManagementApiClient({
  endpoint: process.env.WS_CALLBACK_URL,
});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

// ── DynamoDB helpers ──────────────────────────────────────────────────────────

/**
 * Carrega as últimas HISTORY_LIMIT mensagens em ordem cronológica.
 * ScanIndexForward=false (mais recentes primeiro) + reverse = sliding window correto.
 */
async function loadHistory(conversationId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: historyTable,
      KeyConditionExpression: 'conversationId = :cid',
      ExpressionAttributeValues: { ':cid': conversationId },
      ScanIndexForward: false,
      Limit: HISTORY_LIMIT,
    }),
  );
  return (result.Items ?? []).reverse().map((item) => ({
    role: item.role,
    content: [{ text: item.content }],
  }));
}

/**
 * Lê o resumo gerado pela Lambda Processor, se existir.
 * Retorna null quando a conversa ainda não foi sumarizada.
 */
async function loadSummary(conversationId) {
  if (!summariesTable) return null;
  try {
    const result = await dynamo.send(
      new GetCommand({
        TableName: summariesTable,
        Key: { conversationId },
      }),
    );
    return result.Item?.summary ?? null;
  } catch (error) {
    console.error('Falha ao carregar resumo:', error);
    return null;
  }
}

/** Persiste uma mensagem na tabela de histórico. */
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

/**
 * Carrega os últimos ORDERS_LIMIT pedidos do usuário via GSI order_by_date.
 */
async function loadRecentOrders(userId) {
  if (!ordersTable || !userId) return [];
  try {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: ordersTable,
        IndexName: 'order_by_date',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
        ScanIndexForward: false,
        Limit: ORDERS_LIMIT,
      }),
    );
    return result.Items ?? [];
  } catch (error) {
    console.error('Falha ao carregar pedidos:', error);
    return [];
  }
}

/** Formata pedidos em texto legível para o system prompt. */
function formatOrdersForContext(orders) {
  if (!orders || orders.length === 0) {
    return 'Nenhum pedido encontrado para este usuário.';
  }
  return orders
    .map((order, index) => {
      let itemsText = '';
      try {
        const items =
          typeof order.items === 'string' ? JSON.parse(order.items) : (order.items ?? []);
        itemsText = Array.isArray(items)
          ? items
              .map(
                (i) =>
                  `  - ${i.name ?? i}${i.qty ? ` (x${i.qty})` : ''}${
                    i.price ? ` — R$ ${(i.price / 100).toFixed(2)}` : ''
                  }`,
              )
              .join('\n')
          : String(items);
      } catch {
        itemsText = String(order.items ?? '');
      }
      const total =
        typeof order.total === 'number'
          ? `R$ ${(order.total / 100).toFixed(2)}`
          : (order.total ?? 'não informado');
      const date = order.createdAt
        ? new Date(order.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        : 'data desconhecida';
      return `Pedido ${index + 1}:\n  ID: ${order.orderId ?? 'N/A'}\n  Data: ${date}\n  Status: ${order.status ?? 'não informado'}\n  Itens:\n${itemsText}\n  Total: ${total}`;
    })
    .join('\n\n');
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
  if (!body || typeof body !== 'object') throw new Error('Corpo da mensagem inválido.');
  const conversationId = body?.conversationId;
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (typeof conversationId !== 'string' || !conversationId)
    throw new Error('conversationId é obrigatório.');
  if (!content || content.length > 4000)
    throw new Error('A mensagem deve conter entre 1 e 4000 caracteres.');
  return { conversationId, content };
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const connectionId = event.requestContext?.connectionId;
  if (!connectionId) throw new Error('API Gateway não informou o ID da conexão WebSocket.');

  const userId = event.requestContext?.authorizer?.userId ?? null;

  // 1. Valida payload
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

  // 2. Persiste mensagem do usuário + carrega histórico e resumo em paralelo
  const [, history, summary] = await Promise.all([
    saveMessage({ conversationId, messageId: userMessageId, role: 'user', content }).catch(
      (e) => console.error('Falha ao salvar msg do usuário:', e),
    ),
    loadHistory(conversationId).catch((e) => {
      console.error('Falha ao carregar histórico:', e);
      return [{ role: 'user', content: [{ text: content }] }];
    }),
    loadSummary(conversationId),
  ]);

  // Garante que a mensagem atual está no histórico
  const workingHistory = history.length > 0 ? history : [];
  if (
    workingHistory.length === 0 ||
    workingHistory[workingHistory.length - 1].role !== 'user'
  ) {
    workingHistory.push({ role: 'user', content: [{ text: content }] });
  }

  // 3. Detecta intenção de pedidos e carrega dados se necessário
  let ordersContext = '';
  if (ORDER_INTENT_PATTERN.test(content) && userId) {
    const orders = await loadRecentOrders(userId);
    ordersContext =
      `\n\n--- PEDIDOS RECENTES DO USUÁRIO ---\n${formatOrdersForContext(orders)}\n--- FIM DOS PEDIDOS ---`;
    console.log(`Intenção de pedido: userId=${userId}, ${orders.length} pedido(s).`);
  }

  // 4. Monta system prompt com resumo (se existir) + contexto de pedidos
  const summaryBlock = summary
    ? `\n\nRESUMO DA CONVERSA ATÉ AGORA:\n${summary}\n(Use este resumo como contexto para as mensagens recentes abaixo.)`
    : '';

  const systemPrompt =
    'Você é um assistente virtual de uma pizzaria. Responda em português, com clareza e cordialidade. ' +
    'Não invente itens de cardápio, preços, promoções ou status de pedidos; quando não tiver esses dados, explique que não tem acesso a eles.' +
    summaryBlock +
    (ordersContext
      ? '\n\nOs dados reais dos pedidos do usuário estão listados abaixo — use-os para responder com precisão.' +
        ordersContext
      : '');

  // 5. Invoca Bedrock com streaming (ConverseStreamCommand)
  const assistantMessageId = randomUUID();
  let fullAnswer = '';

  try {
    const streamResponse = await bedrock.send(
      new ConverseStreamCommand({
        modelId,
        system: [{ text: systemPrompt }],
        messages: workingHistory,
        inferenceConfig: {
          maxTokens: 500,
          temperature: 0.2,
        },
      }),
    );

    // Itera os eventos do stream — o SDK entrega objetos com uma única chave
    // representando o tipo do evento (contentBlockDelta, messageStop, etc.)
    for await (const event of streamResponse.stream) {
      // Texto incremental do modelo
      if (event.contentBlockDelta?.delta?.text) {
        const text = event.contentBlockDelta.delta.text;
        fullAnswer += text;
        await postToConnection(connectionId, {
          type: 'chunk',
          conversationId,
          messageId: assistantMessageId,
          content: text,
        });
      }
      // Fim do stream
      if (event.messageStop) break;
    }

    if (!fullAnswer) throw new Error('Bedrock retornou resposta vazia.');
  } catch (error) {
    console.error('Falha no streaming do Bedrock:', error);
    await postToConnection(connectionId, {
      type: 'error',
      conversationId,
      error: 'Não foi possível gerar uma resposta agora. Tente novamente.',
    });
    return { statusCode: 200 };
  }

  // 6. Persiste resposta completa do assistente + sinaliza done em paralelo
  await Promise.all([
    saveMessage({
      conversationId,
      messageId: assistantMessageId,
      role: 'assistant',
      content: fullAnswer,
    }).catch((e) => console.error('Falha ao salvar resposta do assistente:', e)),
    postToConnection(connectionId, { type: 'done', conversationId }),
  ]);

  return { statusCode: 200 };
};
