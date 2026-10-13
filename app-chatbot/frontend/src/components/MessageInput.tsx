import { useState, type FormEvent, type KeyboardEvent } from 'react'

interface MessageInputProps {
  onSend: (content: string) => void
  disabled: boolean
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState('')

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

  return (
    <form className="message-input" onSubmit={submit}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Digite sua mensagem…"
        rows={1}
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        Enviar
      </button>
    </form>
  )
}
