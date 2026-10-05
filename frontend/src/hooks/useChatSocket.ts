import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from '../config'
import type { ChatMessage, IncomingWsMessage, OutgoingWsMessage } from '../types'

function newId() {
  return crypto.randomUUID()
}

// Conecta ao API Gateway WebSocket com o idToken do Cognito e envia as mensagens
// com o histórico recente para a Lambda que chama o Amazon Bedrock.
export function useChatSocket(idToken: string | null, conversationId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'open' | 'closed' | 'error' | 'local'
  >(config.chatMessagesEnabled ? 'connecting' : 'local')
  const socketRef = useRef<WebSocket | null>(null)
  const pendingAssistantIdRef = useRef<string | null>(null)

  useEffect(() => {
    setMessages([])
    pendingAssistantIdRef.current = null
    setConnectionState(config.chatMessagesEnabled ? 'connecting' : 'local')
  }, [conversationId])

  useEffect(() => {
    if (!idToken) return
    if (!config.chatMessagesEnabled) {
      socketRef.current = null
      setConnectionState('local')
      return
    }

    const url = `${config.wsUrl}?token=${encodeURIComponent(idToken)}`
    const socket = new WebSocket(url)
    socketRef.current = socket
    setConnectionState('connecting')

    socket.onopen = () => setConnectionState('open')
    socket.onclose = () => setConnectionState('closed')
    socket.onerror = () => setConnectionState('error')

    socket.onmessage = (event) => {
      let payload: IncomingWsMessage
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }
      if (
        payload.conversationId !== conversationId &&
        payload.type !== 'error'
      ) {
        return
      }

      if (payload.type === 'chunk') {
        setMessages((prev) => {
          const assistantId = pendingAssistantIdRef.current
          if (assistantId) {
            return prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + (payload.content ?? '') }
                : m
            )
          }
          // primeiro chunk: cria a bolha da resposta do assistente
          const id = payload.messageId ?? newId()
          pendingAssistantIdRef.current = id
          return [
            ...prev,
            {
              id,
              role: 'assistant',
              content: payload.content ?? '',
              createdAt: Date.now(),
              pending: true,
            },
          ]
        })
      }

      if (payload.type === 'done') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingAssistantIdRef.current ? { ...m, pending: false } : m
          )
        )
        pendingAssistantIdRef.current = null
      }

      if (payload.type === 'error') {
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: 'assistant',
            content:
              payload.error ??
              'Ocorreu um erro ao processar sua mensagem. Tente novamente.',
            createdAt: Date.now(),
          },
        ])
        pendingAssistantIdRef.current = null
      }
    }

    return () => socket.close()
  }, [idToken, conversationId])

  const sendMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim()
      if (!trimmed) return

      if (!config.chatMessagesEnabled) {
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: 'user',
            content: trimmed,
            createdAt: Date.now(),
          },
        ])
        return
      }

      if (socketRef.current?.readyState !== WebSocket.OPEN) return

      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'user',
          content: trimmed,
          createdAt: Date.now(),
        },
      ])

      const outgoing: OutgoingWsMessage = {
        action: 'sendMessage',
        conversationId,
        content: trimmed,
        history: messages
          .slice(-10)
          .map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
      }
      socketRef.current.send(JSON.stringify(outgoing))
    },
    [conversationId, messages]
  )

  return { messages, connectionState, sendMessage }
}
