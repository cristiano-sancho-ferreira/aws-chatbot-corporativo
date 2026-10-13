import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { ChatWindow } from './ChatWindow'

function newConversationId() {
  return crypto.randomUUID()
}

export function ChatLayout() {
  const [conversationId, setConversationId] = useState(newConversationId)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function handleNewConversation() {
    setConversationId(newConversationId())
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
