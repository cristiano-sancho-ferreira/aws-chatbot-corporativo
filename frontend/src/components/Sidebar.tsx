import { useAuth } from '../auth/AuthContext'
import { config } from '../config'
import './Sidebar.css'

interface SidebarProps {
  onNewConversation: () => void
}

export function Sidebar({ onNewConversation }: SidebarProps) {
  const { session, logout } = useAuth()

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">🍕</span>
        <span className="sidebar-brand-name">{config.assistantName}</span>
      </div>

      <button className="sidebar-new-btn" onClick={onNewConversation}>
        + Nova conversa
      </button>

      <div className="sidebar-footer">
        <p className="sidebar-user">{session?.email}</p>
        <button className="sidebar-logout" onClick={logout}>
          Sair
        </button>
      </div>
    </aside>
  )
}
