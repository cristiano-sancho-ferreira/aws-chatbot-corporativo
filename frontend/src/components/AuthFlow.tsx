import { useState } from 'react'
import { LoginScreen } from './LoginScreen'
import { SignUpScreen } from './SignUpScreen'
import { ConfirmScreen } from './ConfirmScreen'

type Screen = 'login' | 'signUp' | 'confirm'

export function AuthFlow() {
  const [screen, setScreen] = useState<Screen>('login')
  const [pendingEmail, setPendingEmail] = useState('')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  if (screen === 'signUp') {
    return (
      <SignUpScreen
        onSwitchToLogin={() => setScreen('login')}
        onSignedUp={(email) => {
          setPendingEmail(email)
          setScreen('confirm')
        }}
      />
    )
  }

  if (screen === 'confirm') {
    return (
      <ConfirmScreen
        email={pendingEmail}
        onSwitchToLogin={() => setScreen('login')}
        onConfirmed={() => {
          setSuccessMessage('Conta confirmada! Faça login para continuar.')
          setScreen('login')
        }}
      />
    )
  }

  return (
    <LoginScreen
      onSwitchToSignUp={() => {
        setSuccessMessage(null)
        setScreen('signUp')
      }}
      prefillEmail={pendingEmail}
      successMessage={successMessage}
    />
  )
}
