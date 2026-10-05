// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useChatSocket } from './useChatSocket'

const { config } = vi.hoisted(() => ({
  config: { wsUrl: '', chatMessagesEnabled: false },
}))

vi.mock('../config', () => ({ config }))

describe('useChatSocket', () => {
  it('exibe mensagens localmente sem abrir um WebSocket', () => {
    class MockWebSocket {
      static OPEN = 1
      readyState = MockWebSocket.OPEN
      close = vi.fn()
      send = vi.fn()
      onopen: (() => void) | null = null
      onclose: (() => void) | null = null
      onerror: (() => void) | null = null
      onmessage: ((event: MessageEvent) => void) | null = null

      constructor(public url: string) {}
    }

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
})
