import { useAuth } from './auth/AuthContext'
import { AuthFlow } from './components/AuthFlow'
import { ChatLayout } from './components/ChatLayout'

export default function App() {
  const { status } = useAuth()

  if (status === 'checking') {
    return <div style={{ padding: 24 }}>Carregando…</div>
  }

  return status === 'signedIn' ? <ChatLayout /> : <AuthFlow />
}
