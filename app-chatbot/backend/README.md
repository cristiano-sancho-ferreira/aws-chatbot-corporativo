# Backend WebSocket

Esta pasta contém as funções Lambda usadas pelo API Gateway WebSocket.

## Funções

- `websocket-authorizer`: verifica a assinatura RS256 e os claims do ID token Cognito.
- `websocket-connect`: registra a conexão ativa no DynamoDB.
- `websocket-disconnect`: remove a conexão do DynamoDB ao fechar o socket.
- `websocket-message`: envia a mensagem e o histórico recente ao Amazon Bedrock
  Converse API e devolve a resposta pelo WebSocket.

## Resposta do modelo

A Lambda `websocket-message` usa por padrão `amazon.nova-lite-v1:0`. Confirme
que o modelo está disponível para a conta e região configuradas. O frontend
envia as últimas 10 mensagens para contexto; esse histórico não é persistido
após recarregar a página.
