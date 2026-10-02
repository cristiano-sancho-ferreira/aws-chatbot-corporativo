const AWS = require('aws-sdk');

const region = process.env.APP_REGION || process.env.AWS_REGION || 'us-east-1';
const dynamodb = new AWS.DynamoDB.DocumentClient({ region });
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

  await dynamodb
    .put({
      TableName: tableName,
      Item: item,
    })
    .promise();

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, connectionId }),
  };
};
