const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const region = process.env.APP_REGION || process.env.AWS_REGION || 'us-east-1';
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const tableName = process.env.WS_CONNECTIONS_TABLE || 'chatbot-websocket-connections';

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const authorizer = event.requestContext.authorizer || {};

  const item = {
    connectionId,
    userId: authorizer.userId || 'anonymous',
    email: authorizer.email || '',
    connectedAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  };

  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
    }),
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, connectionId }),
  };
};
