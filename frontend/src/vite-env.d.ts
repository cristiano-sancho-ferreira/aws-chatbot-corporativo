/// <reference types="vite/client" />

declare module 'buffer'

declare const global: any

interface ImportMetaEnv {
  readonly VITE_COGNITO_USER_POOL_ID: string
  readonly VITE_COGNITO_CLIENT_ID: string
  readonly VITE_COGNITO_REGION: string
  readonly VITE_WS_URL: string
  readonly VITE_ASSISTANT_NAME: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
