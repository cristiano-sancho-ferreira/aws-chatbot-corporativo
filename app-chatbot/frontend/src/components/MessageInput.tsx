import { useCallback, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'

interface MessageInputProps {
  onSend: (content: string) => void
  disabled: boolean
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState('')

  // Quando a voz retorna o transcript: coloca no campo e envia automaticamente
  const handleTranscript = useCallback(
    (text: string) => {
      onSend(text)
    },
    [onSend]
  )

  const { speechState, startListening, stopListening } =
    useSpeechRecognition(handleTranscript)

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!value.trim()) return
    onSend(value)
    setValue('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function handleMicClick() {
    if (speechState === 'listening') {
      stopListening()
    } else {
      startListening()
    }
  }

  const isListening = speechState === 'listening'
  const micSupported = speechState !== 'unsupported'

  return (
    <form className="message-input" onSubmit={submit}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isListening ? 'Ouvindo…' : 'Digite sua mensagem…'}
        rows={1}
        disabled={disabled}
      />

      {micSupported && (
        <button
          type="button"
          className={`mic-btn${isListening ? ' mic-btn--active' : ''}`}
          onClick={handleMicClick}
          disabled={disabled}
          aria-label={isListening ? 'Parar gravação' : 'Falar mensagem'}
          title={isListening ? 'Parar gravação' : 'Falar mensagem'}
        >
          {isListening ? (
            /* onda de gravação */
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="6" height="6" rx="1"/>
              <path d="M5 12H3"/>
              <path d="M21 12h-2"/>
              <path d="M12 5V3"/>
              <path d="M12 21v-2"/>
              <path d="M7.05 7.05 5.636 5.636"/>
              <path d="M18.364 18.364l-1.414-1.414"/>
              <path d="M7.05 16.95l-1.414 1.414"/>
              <path d="M18.364 5.636l-1.414 1.414"/>
            </svg>
          ) : (
            /* microfone */
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>
      )}

      <button type="submit" disabled={disabled || !value.trim()}>
        Enviar
      </button>
    </form>
  )
}
