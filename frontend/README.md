# Chat da Pizzaria — Frontend (React + TypeScript)

Frontend de chatbot com login, feito para ser hospedado como site estático em
**S3 + CloudFront**, conversando com o backend do diagrama:
`API Gateway (WebSockets) → Lambda (Persist) → DynamoDB → Lambda (Processor) → Bedrock AgentCore`,
com autenticação via **Cognito User Pool** validada pela `Lambda (Authorizer)`.

## Estrutura

```
src/
  auth/            # Cognito (login, sessão) via amazon-cognito-identity-js
  hooks/
    useChatSocket.ts  # conexão WebSocket + streaming de respostas
  components/
    LoginScreen.tsx
    Sidebar.tsx
    ChatWindow.tsx
    MessageBubble.tsx
    MessageInput.tsx
  config.ts        # lê variáveis de ambiente (VITE_*)
  types.ts
```

## 1. Configurar variáveis de ambiente

Copie `.env.example` para `.env` e preencha com os valores reais do seu
Cognito User Pool e do endpoint do API Gateway WebSocket:

```
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_COGNITO_REGION=us-east-1
VITE_WS_URL=wss://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod
VITE_ASSISTANT_NAME=Assistente da Mama Pizzaria
```

Essas variáveis são injetadas **em build-time**. Se precisar trocar o backend
por ambiente (dev/prod), gere builds separados com `.env.production` /
`.env.staging` ou use `vite build --mode staging`.

## 2. Rodar localmente

```bash
npm install
npm run dev
```

## 3. Contrato esperado com o backend

**Envio (front → API Gateway WebSocket):**
```json
{ "action": "sendMessage", "conversationId": "uuid", "content": "texto do usuário" }
```

**Recebimento (Lambda Processor → front, via Stream do DynamoDB):**
```json
{ "type": "chunk", "conversationId": "uuid", "messageId": "uuid", "content": "pedaço da resposta" }
{ "type": "done", "conversationId": "uuid" }
{ "type": "error", "conversationId": "uuid", "error": "mensagem de erro" }
```

Ajuste `src/types.ts` e `src/hooks/useChatSocket.ts` se o formato real das
suas Lambdas for diferente — é só esse arquivo que precisa mudar.

A autenticação no WebSocket é feita passando o `idToken` do Cognito como
query string (`?token=...`), validado pela `Lambda (Authorizer)` no
`$connect` do API Gateway. Se preferir outro mecanismo (header customizado,
por exemplo), ajuste a URL de conexão em `useChatSocket.ts`.

## 4. Build de produção

```bash
npm run build
```

Isso gera a pasta `dist/` pronta para upload.

## 5. Deploy no S3 + CloudFront

```bash
# Sincroniza os arquivos com o bucket (ajuste o nome do bucket)
aws s3 sync dist/ s3://SEU-BUCKET-FRONTEND --delete

# Invalida o cache do CloudFront para publicar a nova versão
aws cloudfront create-invalidation \
  --distribution-id SEU_DISTRIBUTION_ID \
  --paths "/*"
```

Pontos de atenção alinhados ao diagrama:
- O bucket S3 (`S3 - FrontEnd Hosting`) deve ter **acesso restrito** e ser
  servido apenas via CloudFront (Origin Access Control), nunca público direto.
- Configure o CloudFront para redirecionar erros 403/404 de rota para
  `index.html` (SPA), já que este é um app de página única.
- O domínio (`Route 53 → CloudFront`) precisa do certificado TLS no
  `Certificate Manager` associado à distribuição CloudFront.
- O `WAF` na frente do CloudFront não exige nenhuma mudança no front, mas
  vale checar rate limiting se o chat gerar muitas conexões WebSocket.

## Customização visual

Cores e tipografia ficam centralizadas em `src/styles/tokens.css` — troque
as variáveis `--color-sauce`, `--color-basil`, etc. para bater com a
identidade visual real da pizzaria.
