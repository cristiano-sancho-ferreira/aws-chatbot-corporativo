import type { ChatMessage } from '../types'

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`bubble-row ${isUser ? 'bubble-row-user' : ''}`}>
      {!isUser && (
        <span className="bubble-avatar" aria-hidden="true">
          🍕
        </span>
      )}
      <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
        {message.content || (message.pending ? '…' : '')}
      </div>
    </div>
  )
}
