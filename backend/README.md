# Backend WebSocket

Esta pasta contém os exemplos de Lambda para o fluxo do API Gateway WebSocket.

## Funções incluídas

- websocket-authorizer: valida o token do Cognito antes de permitir a conexão
- websocket-connect: registra a conexão ativa no DynamoDB
- websocket-disconnect: remove a conexão do DynamoDB quando o cliente fecha o socket

## Estrutura

```text
backend/
├── README.md
├── websocket-authorizer/
│   └── index.js
├── websocket-connect/
│   └── index.js
└── websocket-disconnect/
    └── index.js
```

## Observação

Este exemplo foi implementado de forma simples para demonstrar a arquitetura. Em produção, o autorizer deve validar a assinatura do JWT do Cognito e verificar o issuer, audience e o pool correto antes de permitir a conexão.
