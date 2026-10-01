import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { ChatWindow } from './ChatWindow'

function newConversationId() {
  return crypto.randomUUID()
}

export function ChatLayout() {
  const [conversationId, setConversationId] = useState(newConversationId)

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <Sidebar onNewConversation={() => setConversationId(newConversationId())} />
      <ChatWindow key={conversationId} conversationId={conversationId} />
    </div>
  )
}
