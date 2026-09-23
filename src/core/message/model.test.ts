import { describe, expect, it } from 'vitest'
import { createTextMessage, DEFAULT_TEXT_MESSAGE_TTL_MS, directConversationKey } from './model'

describe('FieldMesh logical message model', () => {
  it('creates a stable logical message identity and explicit expiry', () => {
    const now = 1_800_000_000_000
    const message = createTextMessage({
      conversationId: 'conversation-1',
      senderUserId: 'fieldmesh-user-1',
      text: 'hello',
      now,
    })

    expect(message.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(message.createdAt).toBe(now)
    expect(message.expiresAt).toBe(now + DEFAULT_TEXT_MESSAGE_TTL_MS)
    expect(message.payload.text).toBe('hello')
  })

  it('uses an order-independent direct conversation key', () => {
    expect(directConversationKey('user-b', 'user-a')).toBe(
      directConversationKey('user-a', 'user-b'),
    )
  })
})
