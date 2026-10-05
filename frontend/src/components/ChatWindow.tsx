import { useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useChatSocket } from '../hooks/useChatSocket'
import { config } from '../config'
import { MessageBubble } from './MessageBubble'
import { MessageInput } from './MessageInput'
import './ChatWindow.css'

export function ChatWindow({ conversationId }: { conversationId: string }) {
  const { session } = useAuth()
  const { messages, connectionState, sendMessage } = useChatSocket(
    session?.idToken ?? null,
    conversationId
  )
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const statusLabel =
    connectionState === 'open'
      ? 'Conectado'
      : connectionState === 'local'
        ? 'Modo local'
        : connectionState === 'connecting'
          ? 'Conectando…'
          : 'Desconectado'

  return (
    <div className="chat-window">
      <header className="chat-header">
        <span className="chat-header-mark">🍕</span>
        <div>
          <h2>{config.assistantName}</h2>
          <p className={`chat-status chat-status-${connectionState}`}>
            <span className="chat-status-dot" /> {statusLabel}
          </p>
        </div>
      </header>

      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="chat-empty">
            Olá! Posso ajudar com o cardápio, promoções ou o status do seu
            pedido. Por onde começamos?
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      {connectionState === 'local' && (
        <p className="chat-backend-pending">
          Modo local: as mensagens aparecem apenas nesta tela e não são enviadas
          ao backend.
        </p>
      )}

      <MessageInput
        onSend={sendMessage}
        disabled={connectionState !== 'open' && connectionState !== 'local'}
      />
    </div>
  )
}
