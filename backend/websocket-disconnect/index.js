const AWS = require('aws-sdk');

const region = process.env.APP_REGION || process.env.AWS_REGION || 'us-east-1';
const dynamodb = new AWS.DynamoDB.DocumentClient({ region });
const tableName = process.env.WS_CONNECTIONS_TABLE || 'chatbot-websocket-connections';

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  await dynamodb
    .delete({
      TableName: tableName,
      Key: {
        connectionId,
      },
    })
    .promise();

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, connectionId, disconnected: true }),
  };
};
