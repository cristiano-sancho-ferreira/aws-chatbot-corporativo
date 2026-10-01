import {
  CognitoUser,
  CognitoUserPool,
  CognitoUserAttribute,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js'
import { config } from '../config'

const userPool = new CognitoUserPool({
  UserPoolId: config.cognito.userPoolId,
  ClientId: config.cognito.clientId,
})

export interface AuthSession {
  idToken: string
  accessToken: string
  email: string
  expiresAt: number
}

function sessionFromCognito(
  cognitoUser: CognitoUser,
  session: CognitoUserSession
): AuthSession {
  return {
    idToken: session.getIdToken().getJwtToken(),
    accessToken: session.getAccessToken().getJwtToken(),
    email: cognitoUser.getUsername(),
    expiresAt: session.getIdToken().getExpiration() * 1000,
  }
}

export function login(email: string, password: string): Promise<AuthSession> {
  const cognitoUser = new CognitoUser({ Username: email, Pool: userPool })
  const authDetails = new AuthenticationDetails({
    Username: email,
    Password: password,
  })

  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session) => resolve(sessionFromCognito(cognitoUser, session)),
      onFailure: (err) => reject(err),
      newPasswordRequired: () =>
        reject(
          new Error(
            'Sua conta exige a troca de senha no primeiro acesso. Fale com o administrador.'
          )
        ),
    })
  })
}

// Tenta restaurar a sessão do usuário já autenticado (cookie/localStorage do próprio SDK Cognito)
export function restoreSession(): Promise<AuthSession | null> {
  const cognitoUser = userPool.getCurrentUser()
  if (!cognitoUser) return Promise.resolve(null)

  return new Promise((resolve) => {
    cognitoUser.getSession(
      (err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session || !session.isValid()) {
          resolve(null)
          return
        }
        resolve(sessionFromCognito(cognitoUser, session))
      }
    )
  })
}

export function logout(): void {
  const cognitoUser = userPool.getCurrentUser()
  cognitoUser?.signOut()
}

// Cria o usuário no User Pool. O Cognito envia automaticamente o e-mail com
// o código de verificação (self sign-up precisa estar habilitado no pool).
export function signUp(
  email: string,
  password: string,
  name: string
): Promise<void> {
  const attributes = [
    new CognitoUserAttribute({ Name: 'email', Value: email }),
    new CognitoUserAttribute({ Name: 'name', Value: name }),
  ]

  return new Promise((resolve, reject) => {
    userPool.signUp(email, password, attributes, [], (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

// Confirma o cadastro com o código de 6 dígitos recebido por e-mail.
export function confirmSignUp(email: string, code: string): Promise<void> {
  const cognitoUser = new CognitoUser({ Username: email, Pool: userPool })
  return new Promise((resolve, reject) => {
    cognitoUser.confirmRegistration(code, true, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

// Reenvia o código de confirmação (caso o usuário não tenha recebido ou o código tenha expirado).
export function resendConfirmationCode(email: string): Promise<void> {
  const cognitoUser = new CognitoUser({ Username: email, Pool: userPool })
  return new Promise((resolve, reject) => {
    cognitoUser.resendConfirmationCode((err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}
