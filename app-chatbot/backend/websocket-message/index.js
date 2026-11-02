'use strict';

const { randomUUID } = require('node:crypto');
const {
  BedrockRuntimeClient,
  ConverseCommand,
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

const HISTORY_LIMIT  = 20;
const ORDERS_LIMIT   = 5;
const TTL_SECONDS    = 60 * 60 * 24 * 30; // 30 dias

const ORDER_QUERY_PATTERN =
  /\b(pedido|pedidos|compra|compras|pedi|último pedido|últimos pedidos|meu pedido|meus pedidos|status do pedido|minha compra|minhas compras|histórico)\b/i;

const bedrock    = new BedrockRuntimeClient({ region });
const apiGateway = new ApiGatewayManagementApiClient({ endpoint: process.env.WS_CALLBACK_URL });
const dynamo     = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

// ── Tool definitions para o Bedrock ──────────────────────────────────────────

const TOOLS = [
  {
    toolSpec: {
      name: 'registrar_pedido',
      description:
        'Registra um novo pedido de pizza no sistema quando o cliente confirmar explicitamente ' +
        'o que deseja pedir. Use esta ferramenta SOMENTE após o cliente confirmar os itens do pedido. ' +
        'Não use para consultas de pedidos anteriores.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['itens'],
          properties: {
            itens: {
              type: 'array',
              description: 'Lista de itens do pedido',
              items: {
                type: 'object',
                required: ['nome', 'quantidade'],
                properties: {
                  nome:        { type: 'string',  description: 'Nome do item (ex: Pizza Calabresa Grande)' },
                  quantidade:  { type: 'integer', description: 'Quantidade' },
                  preco_cents: { type: 'integer', description: 'Preço unitário em centavos (se conhecido)' },
                  observacao:  { type: 'string',  description: 'Observações do item (ex: sem cebola)' },
                },
              },
            },
            observacao_geral: {
              type: 'string',
              description: 'Observação geral do pedido (ex: endereço de entrega, forma de pagamento)',
            },
          },
        },
      },
    },
  },
];

// ── DynamoDB helpers ──────────────────────────────────────────────────────────

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

  return (result.Items ?? []).reverse().flatMap((item) => {
    // Tenta parsear como JSON array (mensagens com toolUse/toolResult salvas como JSON)
    let parsedContent;
    try {
      const candidate = JSON.parse(item.content);
      parsedContent = Array.isArray(candidate) ? candidate : null;
    } catch {
      parsedContent = null;
    }

    // Se tem blocos de tool use/result, descarta — o Bedrock rejeita esses blocos
    // no histórico a menos que toolConfig seja idêntico ao da chamada original.
    // O resumo gerado pelo Processor captura o conteúdo dessas trocas.
    if (parsedContent) {
      const hasToolBlocks = parsedContent.some((b) => b.toolUse || b.toolResult);
      if (hasToolBlocks) return []; // descarta do histórico
      return [{ role: item.role, content: parsedContent }];
    }

    return [{ role: item.role, content: [{ text: item.content }] }];
  });
}

async function loadSummary(conversationId) {
  if (!summariesTable) return null;
  try {
    const result = await dynamo.send(
      new GetCommand({ TableName: summariesTable, Key: { conversationId } }),
    );
    return result.Item?.summary ?? null;
  } catch (e) {
    console.error('Falha ao carregar resumo:', e);
    return null;
  }
}

async function saveMessage({ conversationId, messageId, role, content }) {
  await dynamo.send(
    new PutCommand({
      TableName: historyTable,
      Item: {
        conversationId,
        timestamp: new Date().toISOString(),
        messageId,
        role,
        // content pode ser string (texto simples) ou JSON (quando vem de toolUse/toolResult)
        content: typeof content === 'string' ? content : JSON.stringify(content),
        ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
      },
    }),
  );
}

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
  } catch (e) {
    console.error('Falha ao carregar pedidos:', e);
    return [];
  }
}

/** Grava o pedido confirmado pelo Bedrock na tabela orders. */
async function saveOrder({ userId, itens, observacaoGeral }) {
  if (!ordersTable || !userId) {
    return { sucesso: false, erro: 'Sistema de pedidos indisponível.' };
  }

  const orderId   = randomUUID();
  const createdAt = new Date().toISOString();

  // Normaliza itens para o formato padrão da tabela
  const itensMapped = itens.map((i) => ({
    name:  i.nome,
    qty:   i.quantidade,
    price: i.preco_cents ?? 0,
    ...(i.observacao ? { obs: i.observacao } : {}),
  }));

  const total = itensMapped.reduce((sum, i) => sum + (i.price * i.qty), 0);

  try {
    await dynamo.send(
      new PutCommand({
        TableName: ordersTable,
        Item: {
          userId,
          orderId,
          createdAt,
          status: 'pendente',
          items:  JSON.stringify(itensMapped),
          total,
          ...(observacaoGeral ? { observacao: observacaoGeral } : {}),
          ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
        },
      }),
    );
    return { sucesso: true, orderId, status: 'pendente', createdAt };
  } catch (e) {
    console.error('Falha ao salvar pedido:', e);
    return { sucesso: false, erro: 'Não foi possível registrar o pedido. Tente novamente.' };
  }
}

function formatOrdersForContext(orders) {
  if (!orders || orders.length === 0) return 'Nenhum pedido encontrado para este usuário.';
  return orders
    .map((order, index) => {
      let itemsText = '';
      try {
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items ?? []);
        itemsText = Array.isArray(items)
          ? items.map((i) =>
              `  - ${i.name ?? i}${i.qty ? ` (x${i.qty})` : ''}${i.price ? ` — R$ ${(i.price / 100).toFixed(2)}` : ''}`,
            ).join('\n')
          : String(items);
      } catch { itemsText = String(order.items ?? ''); }
      const total  = typeof order.total === 'number' ? `R$ ${(order.total / 100).toFixed(2)}` : (order.total ?? 'não informado');
      const date   = order.createdAt
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
  try { return JSON.parse(event.body); } catch { return null; }
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

// ── Tool execution ────────────────────────────────────────────────────────────

/**
 * Executa a tool solicitada pelo Bedrock e retorna o resultado no formato
 * esperado pelo ConverseCommand (toolResult block).
 */
async function executeTool(toolUseBlock, userId) {
  const { toolUseId, name, input } = toolUseBlock;
  console.log(`Tool chamada: ${name}`, JSON.stringify(input));

  let result;
  if (name === 'registrar_pedido') {
    result = await saveOrder({
      userId,
      itens:            input.itens ?? [],
      observacaoGeral:  input.observacao_geral ?? '',
    });
  } else {
    result = { erro: `Tool desconhecida: ${name}` };
  }

  return {
    role: 'user',
    content: [{
      toolResult: {
        toolUseId,
        content: [{ text: JSON.stringify(result) }],
        status: result.sucesso === false ? 'error' : 'success',
      },
    }],
  };
}

// ── Bedrock interaction ───────────────────────────────────────────────────────

/**
 * Primeira chamada ao Bedrock com ConverseCommand (suporta tool use).
 * Se o modelo decidir usar uma tool, executa e faz uma segunda chamada.
 * Retorna o histórico atualizado para o streaming final.
 */
async function runToolLoop(messages, systemPrompt, userId) {
  const params = {
    modelId,
    system: [{ text: systemPrompt }],
    messages,
    toolConfig: { tools: TOOLS },
    inferenceConfig: { maxTokens: 600, temperature: 0.2 },
  };

  const response = await bedrock.send(new ConverseCommand(params));
  const stopReason = response.stopReason;
  const assistantMessage = response.output?.message;

  // Sem tool use — retorna direto o texto
  if (stopReason !== 'tool_use') {
    const text = assistantMessage?.content
      ?.filter((b) => b.text)
      .map((b) => b.text)
      .join('') ?? '';
    return { usedTool: false, finalText: text, updatedMessages: messages };
  }

  // Modelo pediu para usar uma tool
  const toolUseBlock = assistantMessage?.content?.find((b) => b.toolUse);
  if (!toolUseBlock) {
    return { usedTool: false, finalText: '', updatedMessages: messages };
  }

  // Executa a tool passando o userId do usuário autenticado
  const toolResultMessage = await executeTool(toolUseBlock.toolUse, userId);

  // Monta o histórico com a resposta do assistente + resultado da tool
  const updatedMessages = [
    ...messages,
    assistantMessage,          // resposta do Bedrock com toolUse
    toolResultMessage,         // resultado da execução da tool
  ];

  return { usedTool: true, finalText: null, updatedMessages };
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

  // 2. Persiste mensagem + carrega histórico e resumo em paralelo
  const [, history, summary] = await Promise.all([
    saveMessage({ conversationId, messageId: userMessageId, role: 'user', content }).catch(
      (e) => console.error('Falha ao salvar msg do usuário:', e),
    ),
    loadHistory(conversationId).catch((e) => {
      console.error('Falha ao carregar histórico:', e);
      return [];
    }),
    loadSummary(conversationId),
  ]);

  // Garante que a mensagem atual está no histórico
  const workingHistory = [...history];
  if (workingHistory.length === 0 || workingHistory[workingHistory.length - 1].role !== 'user') {
    workingHistory.push({ role: 'user', content: [{ text: content }] });
  }

  // 3. Consulta pedidos anteriores se houver intenção
  let ordersContext = '';
  if (ORDER_QUERY_PATTERN.test(content) && userId) {
    const orders = await loadRecentOrders(userId);
    ordersContext = `\n\n--- PEDIDOS RECENTES DO USUÁRIO ---\n${formatOrdersForContext(orders)}\n--- FIM DOS PEDIDOS ---`;
    console.log(`Consulta de pedidos: userId=${userId}, ${orders.length} pedido(s).`);
  }

  // 4. Monta system prompt
  const summaryBlock = summary
    ? `\n\nRESUMO DA CONVERSA ATÉ AGORA:\n${summary}\n(Use este resumo como contexto para as mensagens recentes abaixo.)`
    : '';

  const systemPrompt =
    'Você é um assistente virtual de uma pizzaria. Responda em português, com clareza e cordialidade. ' +
    'Quando o cliente confirmar explicitamente os itens que deseja pedir, use a tool registrar_pedido para registrar o pedido no sistema. ' +
    'Não invente itens de cardápio, preços ou promoções; quando não tiver esses dados, explique que não tem acesso a eles.' +
    summaryBlock +
    (ordersContext
      ? '\n\nOs dados reais dos pedidos do usuário estão listados abaixo — use-os para responder com precisão.' + ordersContext
      : '');

  // 5. Rodada de tool use (ConverseCommand — suporta tools)
  const assistantMessageId = randomUUID();
  let finalMessages = workingHistory;
  let preComputedText = null;

  try {
    const { usedTool, finalText, updatedMessages } = await runToolLoop(
      workingHistory,
      systemPrompt,
      userId,
    );

    finalMessages = updatedMessages;

    if (!usedTool && finalText) {
      // Modelo respondeu diretamente sem tool — usa esse texto no streaming
      preComputedText = finalText;
    }
  } catch (error) {
    console.error('Falha na rodada de tool use:', error);
    await postToConnection(connectionId, {
      type: 'error',
      conversationId,
      error: 'Não foi possível processar sua mensagem. Tente novamente.',
    });
    return { statusCode: 200 };
  }

  // 6. Streaming da resposta final
  let fullAnswer = '';

  try {
    if (preComputedText) {
      // Já temos o texto (sem tool use) — envia direto como chunk único
      fullAnswer = preComputedText;
      await postToConnection(connectionId, {
        type: 'chunk',
        conversationId,
        messageId: assistantMessageId,
        content: fullAnswer,
      });
    } else {
      // Após tool use — segunda chamada com toolConfig para o Bedrock gerar resposta final
      // Usamos ConverseCommand (não stream) porque o histórico contém blocos toolUse/toolResult
      // que o ConverseStreamCommand pode rejeitar dependendo do modelo.
      const finalResponse = await bedrock.send(
        new ConverseCommand({
          modelId,
          system: [{ text: systemPrompt }],
          messages: finalMessages,
          toolConfig: { tools: TOOLS },
          inferenceConfig: { maxTokens: 500, temperature: 0.2 },
        }),
      );

      fullAnswer = finalResponse.output?.message?.content
        ?.filter((b) => b.text)
        .map((b) => b.text)
        .join('') ?? '';

      if (fullAnswer) {
        await postToConnection(connectionId, {
          type: 'chunk',
          conversationId,
          messageId: assistantMessageId,
          content: fullAnswer,
        });
      }
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

  // 7. Persiste resposta do assistente + sinaliza done
  await Promise.all([
    saveMessage({
      conversationId,
      messageId: assistantMessageId,
      role: 'assistant',
      content: fullAnswer,
    }).catch((e) => console.error('Falha ao salvar resposta:', e)),
    postToConnection(connectionId, { type: 'done', conversationId }),
  ]);

  return { statusCode: 200 };
};
