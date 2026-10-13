const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');

const region = process.env.APP_REGION || process.env.AWS_REGION || 'us-east-1';
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const tableName = process.env.WS_CONNECTIONS_TABLE || 'chatbot-websocket-connections';

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  await dynamodb.send(
    new DeleteCommand({
      TableName: tableName,
      Key: {
        connectionId,
      },
    }),
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, connectionId, disconnected: true }),
  };
};
