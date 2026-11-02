'use strict';

/**
 * Lambda Processor — acionada pelo DynamoDB Stream da tabela chat-history.
 *
 * Estratégia de sumarização (sliding window):
 *   - Monitora inserções de mensagens do role "assistant"
 *   - Quando uma conversa atinge SUMMARY_THRESHOLD mensagens totais,
 *     sumariza as mensagens mais antigas (mantendo SUMMARY_KEEP_LAST recentes)
 *   - O resumo é gravado na tabela summaries com chave conversationId
 *   - A Lambda Message lê esse resumo e o injeta no system prompt do Bedrock,
 *     comprimindo o contexto sem perder informação relevante
 */

const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  GetCommand,
} = require('@aws-sdk/lib-dynamodb');

const region       = process.env.APP_REGION || process.env.AWS_REGION || 'us-east-1';
const haikuModelId = process.env.BEDROCK_MODEL_HAIKU;
const historyTable = process.env.CHAT_HISTORY_TABLE;
const summariesTable = process.env.SUMMARIES_TABLE;

// Dispara sumarização quando a conversa tiver este número de mensagens
const SUMMARY_THRESHOLD = parseInt(process.env.SUMMARY_THRESHOLD ?? '30', 10);

// Quantas mensagens recentes ficam FORA do resumo (sliding window tail)
const SUMMARY_KEEP_LAST = parseInt(process.env.SUMMARY_KEEP_LAST ?? '10', 10);

// TTL: 30 dias (alinhado com chat-history)
const TTL_SECONDS = 60 * 60 * 24 * 30;

const bedrock = new BedrockRuntimeClient({ region });
const dynamo  = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

// ── DynamoDB helpers ──────────────────────────────────────────────────────────

/**
 * Carrega TODAS as mensagens de uma conversa em ordem cronológica.
 * Usado para decidir se deve sumarizar e para montar o texto do resumo.
 */
async function loadAllMessages(conversationId) {
  const items = [];
  let lastKey;

  do {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: historyTable,
        KeyConditionExpression: 'conversationId = :cid',
        ExpressionAttributeValues: { ':cid': conversationId },
        ScanIndexForward: true,
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(result.Items ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

/**
 * Lê o resumo existente para a conversa, se houver.
 */
async function loadExistingSummary(conversationId) {
  const result = await dynamo.send(
    new GetCommand({
      TableName: summariesTable,
      Key: { conversationId },
    }),
  );
  return result.Item ?? null;
}

/**
 * Persiste o resumo gerado na tabela summaries.
 */
async function saveSummary({ conversationId, summary, summarizedUpTo, messageCount }) {
  await dynamo.send(
    new PutCommand({
      TableName: summariesTable,
      Item: {
        conversationId,
        summary,
        summarizedUpTo,   // timestamp ISO da última msg incluída no resumo
        messageCount,     // quantas mensagens foram resumidas
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
      },
    }),
  );
}

// ── Bedrock helper ────────────────────────────────────────────────────────────

/**
 * Invoca o Claude Haiku para sumarizar um bloco de mensagens.
 * Usa InvokeModelCommand (Messages API do Anthropic) diretamente.
 */
async function summarizeWithHaiku(messages, existingSummary) {
  const contextBlock = existingSummary
    ? `Resumo anterior da conversa:\n${existingSummary}\n\n`
    : '';

  const transcript = messages
    .map((m) => `${m.role === 'user' ? 'Cliente' : 'Assistente'}: ${m.content}`)
    .join('\n');

  const prompt = `${contextBlock}Abaixo está um trecho de conversa entre um cliente e um assistente virtual de uma pizzaria. Gere um resumo conciso (máximo 300 palavras) em português, capturando: intenção do cliente, itens discutidos, pedidos realizados e qualquer informação relevante para continuar a conversa.

Conversa:
${transcript}

Resumo:`;

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 400,
    temperature: 0.1,
    messages: [{ role: 'user', content: prompt }],
  });

  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId: haikuModelId,
      contentType: 'application/json',
      accept: 'application/json',
      body,
    }),
  );

  const parsed = JSON.parse(Buffer.from(response.body).toString('utf8'));
  return parsed.content?.[0]?.text?.trim() ?? '';
}

// ── Event parsing ─────────────────────────────────────────────────────────────

/**
 * Extrai os conversationIds únicos afetados nos registros do stream.
 * Filtra apenas INSERTs de mensagens do assistente para reduzir invocações.
 */
function extractConversationIds(records) {
  const ids = new Set();

  for (const record of records) {
    if (record.eventName !== 'INSERT') continue;

    const newImage = record.dynamodb?.NewImage;
    if (!newImage) continue;

    // Só dispara sumarização quando o assistente responde
    const role = newImage.role?.S;
    if (role !== 'assistant') continue;

    const conversationId = newImage.conversationId?.S;
    if (conversationId) ids.add(conversationId);
  }

  return [...ids];
}

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Processa uma conversa: decide se deve sumarizar e executa se necessário.
 */
async function processConversation(conversationId) {
  const allMessages = await loadAllMessages(conversationId);

  // Ainda não atingiu o threshold — não precisa sumarizar
  if (allMessages.length < SUMMARY_THRESHOLD) {
    return;
  }

  // Verifica se já temos um resumo e se ele está atualizado
  const existing = await loadExistingSummary(conversationId);
  const alreadySummarizedCount = existing?.messageCount ?? 0;
  const newMessageCount = allMessages.length;

  // Só resumariza se chegaram mensagens suficientes desde o último resumo
  // (evita chamadas desnecessárias ao Bedrock a cada mensagem)
  const MIN_NEW_MESSAGES_FOR_RESUMMARIZE = 10;
  if (newMessageCount - alreadySummarizedCount < MIN_NEW_MESSAGES_FOR_RESUMMARIZE) {
    return;
  }

  // Mensagens a sumarizar: todas exceto as SUMMARY_KEEP_LAST mais recentes
  const messagesToSummarize = allMessages.slice(0, allMessages.length - SUMMARY_KEEP_LAST);

  if (messagesToSummarize.length === 0) return;

  console.log(
    `Sumarizando conversa ${conversationId}: ` +
    `${messagesToSummarize.length} msgs antigas → resumo + ${SUMMARY_KEEP_LAST} recentes mantidas`
  );

  const summary = await summarizeWithHaiku(
    messagesToSummarize,
    existing?.summary ?? null,
  );

  if (!summary) {
    console.warn(`Bedrock retornou resumo vazio para conversa ${conversationId}`);
    return;
  }

  await saveSummary({
    conversationId,
    summary,
    summarizedUpTo: messagesToSummarize[messagesToSummarize.length - 1].timestamp,
    messageCount: messagesToSummarize.length,
  });

  console.log(`Resumo salvo para conversa ${conversationId} (${messagesToSummarize.length} msgs)`);
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const conversationIds = extractConversationIds(event.Records ?? []);

  if (conversationIds.length === 0) return;

  console.log(`Processando ${conversationIds.length} conversa(s): ${conversationIds.join(', ')}`);

  // Processa em paralelo (cada batch do stream pode ter múltiplas conversas)
  const results = await Promise.allSettled(
    conversationIds.map((id) => processConversation(id)),
  );

  // Loga erros sem relanças — o stream não deve travar por falha de sumarização
  for (const [i, result] of results.entries()) {
    if (result.status === 'rejected') {
      console.error(`Falha ao processar conversa ${conversationIds[i]}:`, result.reason);
    }
  }
};
