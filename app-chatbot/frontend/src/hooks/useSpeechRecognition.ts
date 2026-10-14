import { useCallback, useEffect, useRef, useState } from 'react'

// Tipos para a Web Speech API (não estão no lib padrão do TypeScript)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export type SpeechState = 'idle' | 'listening' | 'unsupported'

interface UseSpeechRecognitionReturn {
  speechState: SpeechState
  startListening: () => void
  stopListening: () => void
}

/**
 * Hook que encapsula a Web Speech API para reconhecimento de voz.
 * Chama onTranscript com o texto final reconhecido.
 * Retorna speechState: 'idle' | 'listening' | 'unsupported'
 */
export function useSpeechRecognition(
  onTranscript: (text: string) => void
): UseSpeechRecognitionReturn {
  const RecognitionClass = getSpeechRecognition()
  const supported = RecognitionClass !== null

  const [speechState, setSpeechState] = useState<SpeechState>(
    supported ? 'idle' : 'unsupported'
  )
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  // Limpa a instância ao desmontar
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  const startListening = useCallback(() => {
    if (!RecognitionClass || speechState === 'listening') return

    const recognition = new RecognitionClass()
    recognition.lang = 'pt-BR'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim()
      if (transcript) {
        onTranscript(transcript)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'aborted' acontece quando o usuário para manualmente — não é erro real
      if (event.error !== 'aborted') {
        console.warn('Erro no reconhecimento de voz:', event.error)
      }
      setSpeechState('idle')
    }

    recognition.onend = () => {
      setSpeechState('idle')
    }

    recognitionRef.current = recognition
    recognition.start()
    setSpeechState('listening')
  }, [RecognitionClass, speechState, onTranscript])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setSpeechState('idle')
  }, [])

  return { speechState, startListening, stopListening }
}
