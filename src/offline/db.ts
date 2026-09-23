import Dexie, { type EntityTable } from 'dexie'
import type { DeliveryAttempt, StoredMessage } from '../core/message/types'

export interface OutboxRecord {
  messageId: string
  nextAttemptAt: number
  expiresAt: number
  retryCount: number
  lastFailureReason?: string
}

export interface SeenPacket {
  packetId: string
  receivedAt: number
}

export type CloudMessageState =
  | 'queued'
  | 'submitted'
  | 'delivered'
  | 'read'
  | 'expired'
  | 'failed'

export interface CloudMessageRecord {
  localKey: string
  localUserId: string
  id: string
  conversationId: string
  senderId: string
  body: string
  state: CloudMessageState
  createdAt: number
  serverCreatedAt?: number
  expiresAt: number
  updatedAt: number
}

export interface CloudOutboxRecord {
  localKey: string
  localUserId: string
  messageId: string
  nextAttemptAt: number
  expiresAt: number
  retryCount: number
  lastFailureReason?: string
}

export type CloudReceiptType = 'delivered' | 'read'

export interface CloudReceiptRecord {
  localKey: string
  localUserId: string
  receiptKey: string
  messageId: string
  userId: string
  receiptType: CloudReceiptType
  createdAt: number
}

export interface CloudDeliveryAttempt {
  id: string
  localUserId: string
  messageId: string
  status: 'started' | 'accepted' | 'failed'
  startedAt: number
  finishedAt?: number
  failureReason?: string
}

class FieldMeshDatabase extends Dexie {
  messages!: EntityTable<StoredMessage, 'id'>
  outbox!: EntityTable<OutboxRecord, 'messageId'>
  seenPackets!: EntityTable<SeenPacket, 'packetId'>
  deliveryAttempts!: EntityTable<DeliveryAttempt, 'id'>
  cloudMessages!: EntityTable<CloudMessageRecord, 'localKey'>
  cloudOutbox!: EntityTable<CloudOutboxRecord, 'localKey'>
  cloudReceipts!: EntityTable<CloudReceiptRecord, 'localKey'>
  cloudDeliveryAttempts!: EntityTable<CloudDeliveryAttempt, 'id'>

  constructor() {
    super('fieldmesh-v01')
    this.version(1).stores({
      messages: 'id, conversationId, senderId, recipientId, state, createdAt, updatedAt',
      outbox: 'messageId, nextAttemptAt, expiresAt, retryCount',
      seenPackets: 'packetId, receivedAt',
      deliveryAttempts: 'id, messageId, transport, status, startedAt',
    })
    this.version(2).stores({
      messages: 'id, conversationId, senderId, recipientId, state, createdAt, updatedAt',
      outbox: 'messageId, nextAttemptAt, expiresAt, retryCount',
      seenPackets: 'packetId, receivedAt',
      deliveryAttempts: 'id, messageId, transport, status, startedAt',
      cloudMessages: 'localKey, localUserId, id, [localUserId+conversationId], senderId, state, createdAt, expiresAt, updatedAt',
      cloudOutbox: 'localKey, localUserId, messageId, nextAttemptAt, expiresAt, retryCount',
      cloudReceipts: 'localKey, localUserId, receiptKey, messageId, userId, receiptType, createdAt',
      cloudDeliveryAttempts: 'id, localUserId, messageId, status, startedAt',
    })
  }
}

export const db = new FieldMeshDatabase()
