import { describe, expect, it } from 'vitest'
import {
  compareMessagePriority,
  createLocationMessage,
  createSosMessage,
  createTextMessage,
  DEFAULT_TEXT_MESSAGE_TTL_MS,
  directConversationKey,
} from './model'

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

  it('creates location messages with location priority', () => {
    const message = createLocationMessage({
      conversationId: 'field-safety',
      senderUserId: 'user-a',
      id: 'location-1',
      now: 1_000,
      location: { latitude: 25.36, longitude: 69.74, accuracy: 12, capturedAt: 900 },
    })

    expect(message.type).toBe('location')
    expect(message.priority).toBe('location')
    expect(message.payload.location?.accuracy).toBe(12)
  })

  it('creates SOS messages with emergency priority even without GPS', () => {
    const message = createSosMessage({
      conversationId: 'field-safety',
      senderUserId: 'user-a',
      id: 'sos-message-1',
      sosId: 'sos-1',
      category: 'medical',
      message: 'Need help',
      now: 1_000,
    })

    expect(message.type).toBe('sos')
    expect(message.priority).toBe('emergency')
    expect(message.payload.sos?.sosId).toBe('sos-1')
    expect(message.payload.sos?.location).toBeUndefined()
  })

  it('orders emergency traffic ahead of location and normal traffic', () => {
    expect(compareMessagePriority('emergency', 'control')).toBeLessThan(0)
    expect(compareMessagePriority('control', 'location')).toBeLessThan(0)
    expect(compareMessagePriority('location', 'normal')).toBeLessThan(0)
  })
})
