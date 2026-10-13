import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import './LoginScreen.css'

interface ConfirmScreenProps {
  email: string
  onConfirmed: () => void
  onSwitchToLogin: () => void
}

export function ConfirmScreen({
  email,
  onConfirmed,
  onSwitchToLogin,
}: ConfirmScreenProps) {
  const { confirmSignUp, resendConfirmationCode, error } = useAuth()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await confirmSignUp(email, code)
      onConfirmed()
    } catch {
      // erro já fica disponível via useAuth().error
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    setResendMessage(null)
    try {
      await resendConfirmationCode(email)
      setResendMessage('Novo código enviado para o seu e-mail.')
    } catch {
      // erro já fica disponível via useAuth().error
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-mark" aria-hidden="true">
          📩
        </div>
        <h1>Confirme seu e-mail</h1>
        <p className="login-subtitle">
          Enviamos um código de 6 dígitos para <strong>{email}</strong>.
          Confira também a caixa de spam.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Código de confirmação
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              maxLength={6}
              required
            />
          </label>

          {error && <p className="login-error">{error}</p>}
          {resendMessage && <p className="login-success">{resendMessage}</p>}

          <button type="submit" disabled={submitting || code.length < 6}>
            {submitting ? 'Confirmando…' : 'Confirmar'}
          </button>
        </form>

        <p className="login-switch">
          Não recebeu?{' '}
          <button type="button" onClick={handleResend}>
            Reenviar código
          </button>
        </p>
        <p className="login-switch">
          <button type="button" onClick={onSwitchToLogin}>
            Voltar para o login
          </button>
        </p>
      </div>
    </div>
  )
}
