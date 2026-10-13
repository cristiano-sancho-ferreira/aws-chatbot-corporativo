// Todas as variáveis vêm do .env (ver .env.example) e são injetadas em build-time pelo Vite.
export const config = {
  cognito: {
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID as string,
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
    region: import.meta.env.VITE_COGNITO_REGION as string,
  },
  wsUrl: import.meta.env.VITE_WS_URL as string,
  chatMessagesEnabled: import.meta.env.VITE_CHAT_MESSAGES_ENABLED === 'true',
  assistantName:
    (import.meta.env.VITE_ASSISTANT_NAME as string) || 'Assistente virtual',
}
