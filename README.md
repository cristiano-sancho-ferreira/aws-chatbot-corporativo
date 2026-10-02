# AWS Chatbot Corporativo

Projeto de chatbot empresarial com frontend em React e infraestrutura em Terraform para deploy em AWS. O repositório reúne a aplicação web e a base de provisionamento da infraestrutura necessária para hospedar a interface, autenticar usuários e conectar com um backend WebSocket em AWS.

## Visão geral

A solução foi projetada para seguir a arquitetura abaixo:

- Frontend estático em React + TypeScript
- Autenticação com Amazon Cognito
- Hosting via S3 + CloudFront
- Comunicação em tempo real com backend via API Gateway WebSocket
- Persistência e processamento de mensagens com Lambda + DynamoDB
- Integração com Amazon Bedrock AgentCore

A referência visual da arquitetura está no arquivo [arquitetura-chatbot.drawio](arquitetura-chatbot.drawio).

## Stack principal

- Frontend: React 18, TypeScript, Vite
- Autenticação: Amazon Cognito + amazon-cognito-identity-js
- Infraestrutura: Terraform
- Deploy frontend: S3 + CloudFront
- Comunicação: WebSocket via API Gateway
- Integração IA: Amazon Bedrock AgentCore

## Estrutura do repositório

```text
.
├── arquitetura-chatbot.drawio      # Diagrama da arquitetura
├── frontend/                       # Aplicação web
│   ├── public/
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   └── README.md
├── infra/                          # Infraestrutura Terraform
│   ├── _backend.tf
│   ├── _provider.tf
│   ├── _variables.tf
│   ├── cognito.tf
│   ├── deploy.tf
│   ├── main.tf
│   ├── outputs.tf
│   ├── prd.tfvars
│   └── README.md
└── README.md                      # Este arquivo
```

## Como o frontend funciona

A aplicação em [frontend](frontend) implementa uma interface de chat com:

- tela de login e cadastro
- autenticação no Cognito
- sessão do usuário salvas pelo SDK do Cognito
- conexão WebSocket para envio e recebimento de mensagens em tempo real
- renderização de mensagens do assistente

A configuração de ambiente é feita por variáveis com prefixo `VITE_`, como:

```bash
VITE_COGNITO_USER_POOL_ID
VITE_COGNITO_CLIENT_ID
VITE_COGNITO_REGION
VITE_WS_URL
VITE_ASSISTANT_NAME
```

Essas variáveis são lidas em [frontend/src/config.ts](frontend/src/config.ts) e usadas no fluxo de autenticação e no socket do chat.

## Requisitos

Antes de iniciar, certifique-se de ter instalado:

- Node.js 18+
- npm
- Terraform
- AWS CLI configurado com credenciais válidas
- Acesso a uma conta AWS com permissão para criar recursos de S3, CloudFront, Cognito e Lambda (se a infraestrutura for provisionada localmente)

## Executando o frontend localmente

```bash
cd frontend
npm install
npm run dev
```

A aplicação fica disponível em modo de desenvolvimento pelo Vite, normalmente em `http://localhost:5173`.

### Build de produção

```bash
cd frontend
npm run build
```

O resultado fica em `frontend/dist` e pode ser publicado em um bucket S3 ou entregue por um pipeline de deploy.

## Provisionando a infraestrutura com Terraform

A pasta [infra](infra) contém a infraestrutura necessária para provisionar o frontend, o bucket S3, a distribuição CloudFront e o Cognito.

### Passo a passo

```bash
cd infra
terraform init -var-file="prd.tfvars"
terraform validate
terraform plan -var-file="prd.tfvars"
terraform apply -auto-approve -var-file="prd.tfvars"
```

O Terraform também gera automaticamente o arquivo `.env` do frontend com os valores do Cognito e da URL do WebSocket, quando `auto_deploy` está habilitado.

### Configuração principal

Os parâmetros principais estão em [infra/_variables.tf](infra/_variables.tf) e incluem:

- `region`
- `environment`
- `organization_name`
- `application_name`
- `auto_deploy`
- `manage_cognito_user_pool`
- `ws_url`
- `assistant_name`

A variável `ws_url` deve apontar para o endpoint WebSocket do backend do chatbot, por exemplo:

```bash
wss://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod
```

## Deploy e publicação

O fluxo de deploy implementado em [infra/deploy.tf](infra/deploy.tf) executa automaticamente:

1. `npm install` e build do frontend
2. sincronização do conteúdo em `dist` para o bucket S3
3. invalidação do cache do CloudFront

A infraestrutura cria um bucket S3 privado e restringe o acesso somente pela distribuição CloudFront via Origin Access Control, o que é o padrão seguro para hospedagem de sites estáticos.

## Documentação complementar

Para detalhes de uso do frontend e do Terraform, consulte:

- [frontend/README.md](frontend/README.md)
- [infra/README.md](infra/README.md)

## Observações importantes

- O backend não está neste repositório em sua forma completa; o projeto assume um serviço WebSocket já existente ou em outro stack AWS.
- O frontend depende de `VITE_WS_URL` e do `idToken` do Cognito para autenticar a conexão WebSocket.
- O arquivo [arquitetura-chatbot.drawio](arquitetura-chatbot.drawio) é a referência mais completa da solução de arquitetura.

## Próximos passos recomendados

- verificar se o backend WebSocket está realmente público ou protegido pela Lambda Authorizer
- validar o fluxo de autenticação e login do Cognito em ambiente real
- ajustar o nome do assistente e branding visual da aplicação
- configurar DNS, certificado TLS e WAF conforme o ambiente de produção

---

Este repositório é uma base de referência para um chatbot corporativo em AWS com frontend moderno e infraestrutura automatizada em Terraform.
