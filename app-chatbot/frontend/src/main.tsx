import { Buffer } from 'buffer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import './styles/index.css'

;(globalThis as any).Buffer = Buffer
;(globalThis as any).global = globalThis
;(globalThis as any).process = { env: {} }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
)
