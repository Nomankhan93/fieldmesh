import { describe, expect, it } from 'vitest'
import { createSosMessage, createTextMessage } from '../message/model'
import { DeliveryCoordinator, canonicalMessageLocalKey } from './coordinator'
import type {
  CanonicalMessageRecord,
  DeliveryPathAdapter,
  DeliveryPathAttemptRecord,
  DeliveryQueueRecord,
  DeliveryStore,
} from './types'

class MemoryDeliveryStore implements DeliveryStore {
  readonly messages = new Map<string, CanonicalMessageRecord>()
  readonly queue = new Map<string, DeliveryQueueRecord>()
  readonly attempts = new Map<string, DeliveryPathAttemptRecord>()

  async enqueue(message: CanonicalMessageRecord, queue: DeliveryQueueRecord): Promise<void> {
    this.messages.set(message.localKey, structuredClone(message))
    this.queue.set(queue.localKey, structuredClone(queue))
  }

  async getMessage(localUserId: string, messageId: string): Promise<CanonicalMessageRecord | undefined> {
    return this.messages.get(canonicalMessageLocalKey(localUserId, messageId))
  }

  async getQueue(localUserId: string, messageId: string): Promise<DeliveryQueueRecord | undefined> {
    return this.queue.get(canonicalMessageLocalKey(localUserId, messageId))
  }

  async putMessage(message: CanonicalMessageRecord): Promise<void> {
    this.messages.set(message.localKey, structuredClone(message))
  }

  async updateMessage(localUserId: string, messageId: string, changes: Partial<CanonicalMessageRecord>): Promise<void> {
    const key = canonicalMessageLocalKey(localUserId, messageId)
    const existing = this.messages.get(key)
    if (!existing) return
    this.messages.set(key, { ...existing, ...structuredClone(changes) })
  }

  async putQueue(queue: DeliveryQueueRecord): Promise<void> {
    this.queue.set(queue.localKey, structuredClone(queue))
  }

  async deleteQueue(localUserId: string, messageId: string): Promise<void> {
    this.queue.delete(canonicalMessageLocalKey(localUserId, messageId))
  }

  async listDue(localUserId: string, now: number): Promise<DeliveryQueueRecord[]> {
    return [...this.queue.values()].filter((item) => item.localUserId === localUserId && item.nextAttemptAt <= now)
  }

  async putAttempt(attempt: DeliveryPathAttemptRecord): Promise<void> {
    this.attempts.set(attempt.id, structuredClone(attempt))
  }

  async updateAttempt(id: string, changes: Partial<DeliveryPathAttemptRecord>): Promise<void> {
    const existing = this.attempts.get(id)
    if (!existing) return
    this.attempts.set(id, { ...existing, ...structuredClone(changes) })
  }
}

function adapter(args: {
  path: DeliveryPathAdapter['path']
  available: () => boolean
  onSubmit: DeliveryPathAdapter['submit']
}): DeliveryPathAdapter {
  return {
    path: args.path,
    isAvailable: args.available,
    submit: args.onSubmit,
  }
}

describe('canonical delivery coordinator', () => {
  it('preserves one logical message ID while falling back across delivery paths', async () => {
    const store = new MemoryDeliveryStore()
    const seen: Array<{ path: string; messageId: string }> = []
    const coordinator = new DeliveryCoordinator({
      store,
      adapters: [
        adapter({
          path: 'internet',
          available: () => true,
          onSubmit: async (message) => {
            seen.push({ path: 'internet', messageId: message.id })
            throw new Error('internet unavailable upstream')
          },
        }),
        adapter({
          path: 'gateway',
          available: () => true,
          onSubmit: async (message) => {
            seen.push({ path: 'gateway', messageId: message.id })
            return { acceptedAt: 1_000, transportMessageId: `gw:${message.id}` }
          },
        }),
      ],
      now: () => 1_000,
    })
    const message = createTextMessage({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderUserId: 'user-1',
      text: 'hello',
      now: 900,
      ttlMs: 10_000,
    })

    const result = await coordinator.enqueue({
      localUserId: 'user-1',
      message,
      candidatePaths: ['internet', 'gateway'],
    })

    expect(result).toMatchObject({ messageId: 'message-1', state: 'submitted', path: 'gateway' })
    expect(seen).toEqual([
      { path: 'internet', messageId: 'message-1' },
      { path: 'gateway', messageId: 'message-1' },
    ])
    expect(store.queue.size).toBe(0)
    expect([...store.attempts.values()].map((item) => item.status)).toEqual(['failed', 'accepted'])
  })

  it('keeps a message queued when no path is available and retries later', async () => {
    const store = new MemoryDeliveryStore()
    let now = 2_000
    let online = false
    let submitCount = 0
    const coordinator = new DeliveryCoordinator({
      store,
      adapters: [adapter({
        path: 'internet',
        available: () => online,
        onSubmit: async (message) => {
          submitCount += 1
          return { acceptedAt: now, transportMessageId: message.id }
        },
      })],
      now: () => now,
    })
    const message = createTextMessage({
      id: 'message-2',
      conversationId: 'conversation-1',
      senderUserId: 'user-1',
      text: 'wait for network',
      now,
      ttlMs: 10_000,
    })

    const queued = await coordinator.enqueue({ localUserId: 'user-1', message, candidatePaths: ['internet'] })
    expect(queued.state).toBe('queued')
    expect(store.queue.size).toBe(1)
    expect(submitCount).toBe(0)

    online = true
    now += 1_001
    const retried = await coordinator.retryDue('user-1')
    expect(retried).toHaveLength(1)
    expect(retried[0]).toMatchObject({ state: 'submitted', path: 'internet' })
    expect(submitCount).toBe(1)
    expect(store.queue.size).toBe(0)
  })

  it('retries emergency traffic before normal traffic', async () => {
    const store = new MemoryDeliveryStore()
    let now = 5_000
    let available = false
    const order: string[] = []
    const coordinator = new DeliveryCoordinator({
      store,
      adapters: [adapter({
        path: 'internet',
        available: () => available,
        onSubmit: async (message) => {
          order.push(message.id)
          return { acceptedAt: now, transportMessageId: message.id }
        },
      })],
      now: () => now,
    })
    const normal = createTextMessage({
      id: 'normal-1',
      conversationId: 'conversation-1',
      senderUserId: 'user-1',
      text: 'normal',
      now,
      ttlMs: 20_000,
    })
    const emergency = createSosMessage({
      id: 'sos-message-1',
      sosId: 'sos-1',
      conversationId: 'conversation-1',
      senderUserId: 'user-1',
      category: 'medical',
      now,
      ttlMs: 20_000,
    })

    await coordinator.enqueue({ localUserId: 'user-1', message: normal, candidatePaths: ['internet'] })
    await coordinator.enqueue({ localUserId: 'user-1', message: emergency, candidatePaths: ['internet'] })
    available = true
    now += 1_001
    await coordinator.retryDue('user-1')

    expect(order).toEqual(['sos-message-1', 'normal-1'])
  })

  it('expires stale queued traffic without submitting it', async () => {
    const store = new MemoryDeliveryStore()
    let now = 10_000
    let submitCount = 0
    const coordinator = new DeliveryCoordinator({
      store,
      adapters: [adapter({
        path: 'internet',
        available: () => false,
        onSubmit: async (message) => {
          submitCount += 1
          return { acceptedAt: now, transportMessageId: message.id }
        },
      })],
      now: () => now,
    })
    const message = createTextMessage({
      id: 'message-expire',
      conversationId: 'conversation-1',
      senderUserId: 'user-1',
      text: 'expire',
      now,
      ttlMs: 500,
    })

    await coordinator.enqueue({ localUserId: 'user-1', message, candidatePaths: ['internet'] })
    now += 1_001
    const result = await coordinator.retryDue('user-1')

    expect(result[0]?.state).toBe('expired')
    expect(submitCount).toBe(0)
    expect(store.queue.size).toBe(0)
  })
})
