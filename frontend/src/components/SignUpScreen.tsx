import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { config } from '../config'
import './LoginScreen.css'

interface SignUpScreenProps {
  onSwitchToLogin: () => void
  onSignedUp: (email: string) => void
}

export function SignUpScreen({ onSwitchToLogin, onSignedUp }: SignUpScreenProps) {
  const { signUp, error } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)

    if (password !== confirmPassword) {
      setLocalError('As senhas não coincidem.')
      return
    }
    if (password.length < 8) {
      setLocalError('A senha precisa ter pelo menos 8 caracteres.')
      return
    }

    setSubmitting(true)
    try {
      await signUp(email, password, name)
      onSignedUp(email)
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
        <h1>Criar conta</h1>
        <p className="login-subtitle">
          Cadastre-se para conversar com o {config.assistantName}.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Nome
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </label>

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
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <label>
            Confirmar senha
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          {(localError || error) && (
            <p className="login-error">{localError ?? error}</p>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Criando conta…' : 'Criar conta'}
          </button>
        </form>

        <p className="login-switch">
          Já tem conta?{' '}
          <button type="button" onClick={onSwitchToLogin}>
            Entrar
          </button>
        </p>
      </div>
    </div>
  )
}
