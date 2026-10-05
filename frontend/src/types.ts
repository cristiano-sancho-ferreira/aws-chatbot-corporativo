export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  pending?: boolean // true enquanto a resposta ainda está sendo "stremada" (streaming)
}

export interface ConversationSummary {
  id: string
  title: string
  lastMessagePreview: string
  updatedAt: number
}

// Formato de mensagem que trafega no WebSocket (envio -> backend)
export interface OutgoingWsMessage {
  action: 'sendMessage'
  conversationId: string
  content: string
  history: Array<Pick<ChatMessage, 'role' | 'content'>>
}

// Formato de mensagem recebida do backend via WebSocket.
export interface IncomingWsMessage {
  type: 'chunk' | 'done' | 'error' | 'conversationCreated'
  conversationId: string
  messageId?: string
  content?: string
  error?: string
}
