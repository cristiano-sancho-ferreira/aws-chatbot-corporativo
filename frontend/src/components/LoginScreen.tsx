import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { config } from '../config'
import './LoginScreen.css'

interface LoginScreenProps {
  onSwitchToSignUp: () => void
  prefillEmail?: string
  successMessage?: string | null
}

export function LoginScreen({
  onSwitchToSignUp,
  prefillEmail,
  successMessage,
}: LoginScreenProps) {
  const { login, error } = useAuth()
  const [email, setEmail] = useState(prefillEmail ?? '')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await login(email, password)
    } catch {
      // erro já fica disponível via useAuth().error
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-mark" aria-hidden="true">
          🍕
        </div>
        <h1>{config.assistantName}</h1>
        <p className="login-subtitle">
          Entre para conversar com o assistente e acompanhar seu pedido.
        </p>

        {successMessage && <p className="login-success">{successMessage}</p>}

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="login-switch">
          Ainda não tem conta?{' '}
          <button type="button" onClick={onSwitchToSignUp}>
            Criar conta
          </button>
        </p>
      </div>
    </div>
  )
}
