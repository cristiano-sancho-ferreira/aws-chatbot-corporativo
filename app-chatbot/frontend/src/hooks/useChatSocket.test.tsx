// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useChatSocket } from './useChatSocket'

const { config } = vi.hoisted(() => ({
  config: { wsUrl: '', chatMessagesEnabled: false },
}))

vi.mock('../config', () => ({ config }))

describe('useChatSocket', () => {
  class MockWebSocket {
    static OPEN = 1
    static latest: MockWebSocket | null = null
    readyState = MockWebSocket.OPEN
    close = vi.fn()
    send = vi.fn()
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null

    constructor(public url: string) {
      MockWebSocket.latest = this
    }
  }

  it('exibe mensagens localmente sem abrir um WebSocket', () => {
    vi.stubGlobal('WebSocket', MockWebSocket as any)

    const { result, rerender } = renderHook(
      ({ conversationId }) => useChatSocket('token-de-teste', conversationId),
      { initialProps: { conversationId: 'conversation-1' } }
    )

    expect(result.current.connectionState).toBe('local')

    act(() => {
      result.current.sendMessage('Olá')
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'Olá',
    })

    rerender({ conversationId: 'conversation-2' })

    expect(result.current.messages).toHaveLength(0)
  })

  it('envia a mensagem e o histórico pelo WebSocket quando o backend está habilitado', () => {
    config.chatMessagesEnabled = true
    config.wsUrl = 'wss://example.com/prod'
    vi.stubGlobal('WebSocket', MockWebSocket as any)

    const { result } = renderHook(() =>
      useChatSocket('token-de-teste', 'conversation-1')
    )

    act(() => {
      result.current.sendMessage('Olá')
    })

    act(() => {
      MockWebSocket.latest?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'chunk',
            conversationId: 'conversation-1',
            messageId: 'assistant-1',
            content: 'Olá! ',
          }),
        })
      )
    })

    act(() => {
      MockWebSocket.latest?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'done',
            conversationId: 'conversation-1',
          }),
        })
      )
    })

    act(() => {
      result.current.sendMessage('Continuando')
    })

    expect(MockWebSocket.latest?.send).toHaveBeenCalledTimes(2)
    const outgoing = JSON.parse(
      MockWebSocket.latest?.send.mock.calls[1][0] as string
    )
    expect(outgoing).toMatchObject({
      action: 'sendMessage',
      conversationId: 'conversation-1',
      content: 'Continuando',
      history: [
        { role: 'user', content: 'Olá' },
        { role: 'assistant', content: 'Olá! ' },
      ],
    })
  })
})
