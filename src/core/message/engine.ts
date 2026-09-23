import { db } from '../../offline/db'
import { TransportRouter } from '../../transports/router'
import type { FieldMeshTransport } from '../../transports/types'
import { simulatorNodeIdForUser } from '../protocol/ids'
import { createTransportFrame, isTransportFrameExpired, type TransportFrame } from '../transport/frame'
import {
  assertFitsRadioBudget,
  createTextEnvelope,
  decodeEnvelope,
  encodeEnvelope,
  envelopeByteLength,
} from './codec'
import { createTextMessage, directConversationKey } from './model'
import type { FieldMeshEnvelope, SimulatorUserId, StoredMessage } from './types'

export class MessageEngine {
  private readonly router: TransportRouter
  private readonly radioTransportName: string

  constructor(radio: FieldMeshTransport) {
    this.radioTransportName = radio.name
    this.router = new TransportRouter([radio])
    this.router.setReceiver(async (frame) => {
      await this.receiveFrame(frame)
    })
  }

  async sendText(args: {
    senderId: SimulatorUserId
    recipientId: SimulatorUserId
    text: string
  }): Promise<{ messageId: string; encodedBytes: number }> {
    const text = args.text.trim()
    if (!text) throw new Error('Message cannot be empty')

    const conversationId = directConversationKey(args.senderId, args.recipientId)
    const logicalMessage = createTextMessage({
      conversationId,
      senderUserId: args.senderId,
      text,
    })
    const envelope = createTextEnvelope({
      id: logicalMessage.id,
      senderId: args.senderId,
      recipientId: args.recipientId,
      text,
      now: logicalMessage.createdAt,
      expiresAt: logicalMessage.expiresAt,
    })
    assertFitsRadioBudget(envelope)

    const now = Date.now()
    const message: StoredMessage = {
      id: logicalMessage.id,
      conversationId,
      senderId: args.senderId,
      recipientId: args.recipientId,
      body: text,
      envelope,
      logicalMessage,
      state: 'queued',
      createdAt: logicalMessage.createdAt,
      updatedAt: now,
    }

    await db.transaction('rw', db.messages, db.outbox, async () => {
      await db.messages.put(message)
      await db.outbox.put({
        messageId: message.id,
        nextAttemptAt: now,
        expiresAt: logicalMessage.expiresAt,
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
    return this.receiveEnvelope(envelope)
  }

  async replayPacket(messageId: string): Promise<'accepted' | 'duplicate'> {
    const message = await db.messages.get(messageId)
    if (!message) throw new Error('No message available to replay')

    const frame = createTransportFrame({
      messageId: message.id,
      sourceNodeId: simulatorNodeIdForUser(message.senderId),
      destinationNodeId: simulatorNodeIdForUser(message.recipientId),
      createdAt: Date.now(),
      expiresAt: Math.max(message.envelope.expiresAt, Date.now() + 1),
      attempt: 1,
      payload: encodeEnvelope(message.envelope),
    })
    return this.receiveFrame(frame)
  }

  private async receiveFrame(frame: TransportFrame): Promise<'accepted' | 'duplicate'> {
    if (isTransportFrameExpired(frame)) {
      throw new Error('Transport frame expired before application delivery')
    }

    const envelope = decodeEnvelope(frame.payload)
    if (envelope.id !== frame.messageId) {
      throw new Error('Transport frame message ID does not match payload message ID')
    }

    return this.receiveEnvelope(envelope)
  }

  private async receiveEnvelope(envelope: FieldMeshEnvelope): Promise<'accepted' | 'duplicate'> {
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
        const conversationId = directConversationKey(envelope.senderId, envelope.recipientId)
        const body = envelope.payload.text ?? ''
        const logicalMessage = body.trim()
          ? createTextMessage({
              id: envelope.id,
              conversationId,
              senderUserId: envelope.senderId,
              text: body,
              now: envelope.createdAt,
              ttlMs: envelope.expiresAt - envelope.createdAt,
            })
          : undefined

        await db.messages.put({
          id: envelope.id,
          conversationId,
          senderId: envelope.senderId,
          recipientId: envelope.recipientId,
          body,
          envelope,
          logicalMessage,
          state: 'delivered',
          createdAt: envelope.createdAt,
          updatedAt: now,
        })
      }
    })

    return 'accepted'
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

    const frame = createTransportFrame({
      messageId: message.id,
      sourceNodeId: simulatorNodeIdForUser(message.senderId),
      destinationNodeId: simulatorNodeIdForUser(message.recipientId),
      createdAt: now,
      expiresAt: queueItem.expiresAt,
      attempt: queueItem.retryCount + 1,
      payload: encodeEnvelope(message.envelope),
    })

    const attemptId = crypto.randomUUID()
    await db.deliveryAttempts.put({
      id: attemptId,
      messageId,
      frameId: frame.frameId,
      transport: this.radioTransportName,
      status: 'started',
      startedAt: now,
    })

    try {
      await this.router.send(frame, {
        preferred: [this.radioTransportName],
        allowedKinds: ['radio'],
      })
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
