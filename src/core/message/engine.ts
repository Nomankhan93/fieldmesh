import { db } from '../../offline/db'
import type { FieldMeshTransport } from '../../transports/types'
import {
  assertFitsRadioBudget,
  createTextEnvelope,
  envelopeByteLength,
} from './codec'
import type { FieldMeshEnvelope, FieldMeshUserId, StoredMessage } from './types'

const conversationIdFor = (a: FieldMeshUserId, b: FieldMeshUserId) =>
  [a, b].sort().join(':')

export class MessageEngine {
  private readonly radio: FieldMeshTransport

  constructor(radio: FieldMeshTransport) {
    this.radio = radio
    this.radio.setReceiver(async (envelope) => {
      await this.receive(envelope)
    })
  }

  async sendText(args: {
    senderId: FieldMeshUserId
    recipientId: FieldMeshUserId
    text: string
  }): Promise<{ messageId: string; encodedBytes: number }> {
    const text = args.text.trim()
    if (!text) throw new Error('Message cannot be empty')

    const envelope = createTextEnvelope({ ...args, text })
    assertFitsRadioBudget(envelope)

    const now = Date.now()
    const message: StoredMessage = {
      id: envelope.id,
      conversationId: conversationIdFor(args.senderId, args.recipientId),
      senderId: args.senderId,
      recipientId: args.recipientId,
      body: text,
      envelope,
      state: 'queued',
      createdAt: now,
      updatedAt: now,
    }

    await db.transaction('rw', db.messages, db.outbox, async () => {
      await db.messages.put(message)
      await db.outbox.put({
        messageId: message.id,
        nextAttemptAt: now,
        expiresAt: envelope.expiresAt,
        retryCount: 0,
      })
    })

    await this.attempt(message.id)

    return { messageId: message.id, encodedBytes: envelopeByteLength(envelope) }
  }

  async retryOutbox(): Promise<void> {
    const now = Date.now()
    const pending = await db.outbox.where('nextAttemptAt').belowOrEqual(now).toArray()
    for (const item of pending) {
      await this.attempt(item.messageId)
    }
  }

  async receive(envelope: FieldMeshEnvelope): Promise<'accepted' | 'duplicate'> {
    const seen = await db.seenPackets.get(envelope.id)
    if (seen) return 'duplicate'

    const existing = await db.messages.get(envelope.id)
    const now = Date.now()

    await db.transaction('rw', db.seenPackets, db.messages, db.outbox, async () => {
      await db.seenPackets.put({ packetId: envelope.id, receivedAt: now })

      if (existing) {
        await db.messages.update(envelope.id, {
          state: 'delivered',
          updatedAt: now,
        })
        await db.outbox.delete(envelope.id)
        return
      }

      if (envelope.type === 'text') {
        await db.messages.put({
          id: envelope.id,
          conversationId: conversationIdFor(envelope.senderId, envelope.recipientId),
          senderId: envelope.senderId,
          recipientId: envelope.recipientId,
          body: envelope.payload.text ?? '',
          envelope,
          state: 'delivered',
          createdAt: envelope.createdAt,
          updatedAt: now,
        })
      }
    })

    return 'accepted'
  }

  async replayPacket(messageId: string): Promise<'accepted' | 'duplicate'> {
    const message = await db.messages.get(messageId)
    if (!message) throw new Error('No message available to replay')
    return this.receive(structuredClone(message.envelope))
  }

  private async attempt(messageId: string): Promise<void> {
    const message = await db.messages.get(messageId)
    const queueItem = await db.outbox.get(messageId)
    if (!message || !queueItem) return

    const now = Date.now()
    if (queueItem.expiresAt <= now) {
      await db.transaction('rw', db.messages, db.outbox, async () => {
        await db.messages.update(messageId, { state: 'expired', updatedAt: now })
        await db.outbox.delete(messageId)
      })
      return
    }

    const attemptId = crypto.randomUUID()
    await db.deliveryAttempts.put({
      id: attemptId,
      messageId,
      transport: 'mock-radio',
      status: 'started',
      startedAt: now,
    })

    try {
      await this.radio.send(message.envelope)
      await db.deliveryAttempts.update(attemptId, {
        status: 'accepted',
        finishedAt: Date.now(),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown transport error'
      const retryCount = queueItem.retryCount + 1
      const backoffMs = Math.min(30_000, 1_000 * 2 ** Math.min(retryCount, 5))

      await db.transaction('rw', db.deliveryAttempts, db.outbox, db.messages, async () => {
        await db.deliveryAttempts.update(attemptId, {
          status: 'failed',
          finishedAt: Date.now(),
          failureReason: reason,
        })
        await db.outbox.put({
          ...queueItem,
          retryCount,
          nextAttemptAt: Date.now() + backoffMs,
          lastFailureReason: reason,
        })
        await db.messages.update(messageId, {
          state: 'queued',
          updatedAt: Date.now(),
        })
      })
    }
  }
}
