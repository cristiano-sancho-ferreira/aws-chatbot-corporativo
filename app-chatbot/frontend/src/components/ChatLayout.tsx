import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Sidebar } from './Sidebar'
import { ChatWindow } from './ChatWindow'

const CONVERSATION_KEY_PREFIX = 'chatbot:conversationId:'

/** Retorna o conversationId persistido para o usuário ou cria um novo. */
function getOrCreateConversationId(email: string): string {
  const key = CONVERSATION_KEY_PREFIX + email
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const newId = crypto.randomUUID()
  localStorage.setItem(key, newId)
  return newId
}

/** Gera um novo conversationId e persiste, descartando o anterior. */
function resetConversationId(email: string): string {
  const key = CONVERSATION_KEY_PREFIX + email
  const newId = crypto.randomUUID()
  localStorage.setItem(key, newId)
  return newId
}

export function ChatLayout() {
  const { session } = useAuth()
  const email = session?.email ?? 'anonymous'

  const [conversationId, setConversationId] = useState(() =>
    getOrCreateConversationId(email)
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function handleNewConversation() {
    setConversationId(resetConversationId(email))
    setSidebarOpen(false)
  }

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* Overlay escuro para fechar a sidebar no mobile */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        onNewConversation={handleNewConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <ChatWindow
        key={conversationId}
        conversationId={conversationId}
        onOpenSidebar={() => setSidebarOpen(true)}
      />
    </div>
  )
}
