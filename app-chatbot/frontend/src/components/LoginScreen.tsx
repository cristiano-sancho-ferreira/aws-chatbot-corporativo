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
  const [showPassword, setShowPassword] = useState(false)

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
            <div className="login-password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? (
                  // olho fechado
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  // olho aberto
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
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
