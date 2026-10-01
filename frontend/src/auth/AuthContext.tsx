import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import * as CognitoAuth from './CognitoAuth'
import type { AuthSession } from './CognitoAuth'

interface AuthContextValue {
  session: AuthSession | null
  status: 'checking' | 'signedOut' | 'signedIn'
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  signUp: (email: string, password: string, name: string) => Promise<void>
  confirmSignUp: (email: string, code: string) => Promise<void>
  resendConfirmationCode: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [status, setStatus] = useState<AuthContextValue['status']>('checking')
  const [error, setError] = useState<string | null>(null)

  // Ao carregar o app, verifica se já existe uma sessão Cognito válida
  useEffect(() => {
    CognitoAuth.restoreSession().then((restored) => {
      setSession(restored)
      setStatus(restored ? 'signedIn' : 'signedOut')
    })
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    try {
      const newSession = await CognitoAuth.login(email, password)
      setSession(newSession)
      setStatus('signedIn')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Não foi possível entrar.'
      setError(message)
      throw err
    }
  }, [])

  const logout = useCallback(() => {
    CognitoAuth.logout()
    setSession(null)
    setStatus('signedOut')
  }, [])

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      setError(null)
      try {
        await CognitoAuth.signUp(email, password, name)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Não foi possível criar a conta.'
        setError(message)
        throw err
      }
    },
    []
  )

  const confirmSignUp = useCallback(async (email: string, code: string) => {
    setError(null)
    try {
      await CognitoAuth.confirmSignUp(email, code)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Código inválido ou expirado.'
      setError(message)
      throw err
    }
  }, [])

  const resendConfirmationCode = useCallback(async (email: string) => {
    setError(null)
    try {
      await CognitoAuth.resendConfirmationCode(email)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Não foi possível reenviar o código.'
      setError(message)
      throw err
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        status,
        error,
        login,
        logout,
        signUp,
        confirmSignUp,
        resendConfirmationCode,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
