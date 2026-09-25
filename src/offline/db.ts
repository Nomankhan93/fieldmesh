import Dexie, { type EntityTable } from 'dexie'
import type { DeliveryAttempt, StoredMessage } from '../core/message/types'
import type { GatewayQueueItem, GatewayRouteRecord, GatewaySeenRecord } from '../core/gateway/types'
import type { LocationFix } from '../core/location/types'
import type { LocationShareRecord, SosEvent, SosRecord } from '../core/sos/types'
import { FIELDMESH_MESSAGE_VERSION, MESSAGE_PRIORITY_RANK } from '../core/message/model'
import type {
  CanonicalMessageRecord,
  DeliveryPathAttemptRecord,
  DeliveryQueueRecord,
} from '../core/delivery/types'
import type {
  WorkspaceConversationRecord,
  WorkspaceParticipantRecord,
  WorkspaceSyncCursorRecord,
  WorkspaceSyncStateRecord,
} from '../core/workspace/model'

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
  gatewayQueue!: EntityTable<GatewayQueueItem, 'key'>
  gatewaySeen!: EntityTable<GatewaySeenRecord, 'key'>
  gatewayRoutes!: EntityTable<GatewayRouteRecord, 'key'>
  locationFixes!: EntityTable<LocationFix, 'id'>
  locationShares!: EntityTable<LocationShareRecord, 'id'>
  sosRecords!: EntityTable<SosRecord, 'id'>
  sosEvents!: EntityTable<SosEvent, 'id'>
  canonicalMessages!: EntityTable<CanonicalMessageRecord, 'localKey'>
  deliveryQueue!: EntityTable<DeliveryQueueRecord, 'localKey'>
  deliveryPathAttempts!: EntityTable<DeliveryPathAttemptRecord, 'id'>
  workspaceConversations!: EntityTable<WorkspaceConversationRecord, 'localKey'>
  workspaceParticipants!: EntityTable<WorkspaceParticipantRecord, 'localKey'>
  workspaceSyncState!: EntityTable<WorkspaceSyncStateRecord, 'localUserId'>
  workspaceSyncCursors!: EntityTable<WorkspaceSyncCursorRecord, 'localKey'>

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
    this.version(3).stores({
      messages: 'id, conversationId, senderId, recipientId, state, createdAt, updatedAt',
      outbox: 'messageId, nextAttemptAt, expiresAt, retryCount',
      seenPackets: 'packetId, receivedAt',
      deliveryAttempts: 'id, messageId, transport, status, startedAt',
      cloudMessages: 'localKey, localUserId, id, [localUserId+conversationId], senderId, state, createdAt, expiresAt, updatedAt',
      cloudOutbox: 'localKey, localUserId, messageId, nextAttemptAt, expiresAt, retryCount',
      cloudReceipts: 'localKey, localUserId, receiptKey, messageId, userId, receiptType, createdAt',
      cloudDeliveryAttempts: 'id, localUserId, messageId, status, startedAt',
      gatewayQueue: 'key, gatewayId, direction, messageId, nextAttemptAt, expiresAt',
      gatewaySeen: 'key, gatewayId, direction, messageId, seenAt',
      gatewayRoutes: 'key, userId, gatewayId, radioNodeId, lastSeenAt, expiresAt',
    })
    this.version(4).stores({
      messages: 'id, conversationId, senderId, recipientId, state, createdAt, updatedAt',
      outbox: 'messageId, nextAttemptAt, expiresAt, retryCount',
      seenPackets: 'packetId, receivedAt',
      deliveryAttempts: 'id, messageId, transport, status, startedAt',
      cloudMessages: 'localKey, localUserId, id, [localUserId+conversationId], senderId, state, createdAt, expiresAt, updatedAt',
      cloudOutbox: 'localKey, localUserId, messageId, nextAttemptAt, expiresAt, retryCount',
      cloudReceipts: 'localKey, localUserId, receiptKey, messageId, userId, receiptType, createdAt',
      cloudDeliveryAttempts: 'id, localUserId, messageId, status, startedAt',
      gatewayQueue: 'key, gatewayId, direction, messageId, nextAttemptAt, expiresAt',
      gatewaySeen: 'key, gatewayId, direction, messageId, seenAt',
      gatewayRoutes: 'key, userId, gatewayId, radioNodeId, lastSeenAt, expiresAt',
      locationFixes: 'id, capturedAt, source',
      locationShares: 'id, status, path, createdAt, updatedAt',
      sosRecords: 'id, status, category, path, createdAt, updatedAt',
      sosEvents: 'id, sosId, at, type',
    })
    this.version(5).stores({
      messages: 'id, conversationId, senderId, recipientId, state, createdAt, updatedAt',
      outbox: 'messageId, nextAttemptAt, expiresAt, retryCount',
      seenPackets: 'packetId, receivedAt',
      deliveryAttempts: 'id, messageId, transport, status, startedAt',
      cloudMessages: 'localKey, localUserId, id, [localUserId+conversationId], senderId, state, createdAt, expiresAt, updatedAt',
      cloudOutbox: 'localKey, localUserId, messageId, nextAttemptAt, expiresAt, retryCount',
      cloudReceipts: 'localKey, localUserId, receiptKey, messageId, userId, receiptType, createdAt',
      cloudDeliveryAttempts: 'id, localUserId, messageId, status, startedAt',
      gatewayQueue: 'key, gatewayId, direction, messageId, nextAttemptAt, expiresAt',
      gatewaySeen: 'key, gatewayId, direction, messageId, seenAt',
      gatewayRoutes: 'key, userId, gatewayId, radioNodeId, lastSeenAt, expiresAt',
      locationFixes: 'id, capturedAt, source',
      locationShares: 'id, status, path, createdAt, updatedAt',
      sosRecords: 'id, status, category, path, createdAt, updatedAt',
      sosEvents: 'id, sosId, at, type',
      canonicalMessages: 'localKey, localUserId, messageId, [localUserId+conversationId], senderUserId, type, priority, state, createdAt, expiresAt, updatedAt',
      deliveryQueue: 'localKey, localUserId, messageId, priorityRank, nextAttemptAt, expiresAt, retryCount',
      deliveryPathAttempts: 'id, localUserId, messageId, path, status, startedAt',
    }).upgrade(async (transaction) => {
      const cloudMessages = await transaction.table('cloudMessages').toArray() as CloudMessageRecord[]
      const canonicalByKey = new Map<string, CanonicalMessageRecord>()

      for (const cloudMessage of cloudMessages) {
        const body = cloudMessage.body.trim()
        if (!body) continue
        const canonical: CanonicalMessageRecord = {
          localKey: cloudMessage.localKey,
          localUserId: cloudMessage.localUserId,
          messageId: cloudMessage.id,
          conversationId: cloudMessage.conversationId,
          senderUserId: cloudMessage.senderId,
          type: 'text',
          priority: 'normal',
          message: {
            version: FIELDMESH_MESSAGE_VERSION,
            id: cloudMessage.id,
            conversationId: cloudMessage.conversationId,
            senderUserId: cloudMessage.senderId,
            type: 'text',
            priority: 'normal',
            createdAt: cloudMessage.createdAt,
            expiresAt: cloudMessage.expiresAt,
            payload: { text: body },
          },
          state: cloudMessage.state,
          lastPath: 'internet',
          createdAt: cloudMessage.createdAt,
          expiresAt: cloudMessage.expiresAt,
          updatedAt: cloudMessage.updatedAt,
        }
        canonicalByKey.set(canonical.localKey, canonical)
      }

      if (canonicalByKey.size > 0) {
        await transaction.table('canonicalMessages').bulkPut([...canonicalByKey.values()])
      }

      const oldQueue = await transaction.table('cloudOutbox').toArray() as CloudOutboxRecord[]
      const migratedQueue: DeliveryQueueRecord[] = []
      for (const item of oldQueue) {
        const canonical = canonicalByKey.get(item.localKey)
        if (!canonical) continue
        migratedQueue.push({
          localKey: item.localKey,
          localUserId: item.localUserId,
          messageId: item.messageId,
          priorityRank: MESSAGE_PRIORITY_RANK[canonical.priority],
          candidatePaths: ['internet'],
          context: { localUserId: item.localUserId },
          nextAttemptAt: item.nextAttemptAt,
          expiresAt: item.expiresAt,
          retryCount: item.retryCount,
          ...(item.lastFailureReason ? { lastFailureReason: item.lastFailureReason } : {}),
        })
      }
      if (migratedQueue.length > 0) {
        await transaction.table('deliveryQueue').bulkPut(migratedQueue)
      }
      await transaction.table('cloudOutbox').clear()
    })
    this.version(6).stores({
      messages: 'id, conversationId, senderId, recipientId, state, createdAt, updatedAt',
      outbox: 'messageId, nextAttemptAt, expiresAt, retryCount',
      seenPackets: 'packetId, receivedAt',
      deliveryAttempts: 'id, messageId, transport, status, startedAt',
      cloudMessages: 'localKey, localUserId, id, [localUserId+conversationId], senderId, state, createdAt, expiresAt, updatedAt',
      cloudOutbox: 'localKey, localUserId, messageId, nextAttemptAt, expiresAt, retryCount',
      cloudReceipts: 'localKey, localUserId, receiptKey, messageId, userId, receiptType, createdAt',
      cloudDeliveryAttempts: 'id, localUserId, messageId, status, startedAt',
      gatewayQueue: 'key, gatewayId, direction, messageId, nextAttemptAt, expiresAt',
      gatewaySeen: 'key, gatewayId, direction, messageId, seenAt',
      gatewayRoutes: 'key, userId, gatewayId, radioNodeId, lastSeenAt, expiresAt',
      locationFixes: 'id, capturedAt, source',
      locationShares: 'id, status, path, createdAt, updatedAt',
      sosRecords: 'id, status, category, path, createdAt, updatedAt',
      sosEvents: 'id, sosId, at, type',
      canonicalMessages: 'localKey, localUserId, messageId, [localUserId+conversationId], senderUserId, type, priority, state, createdAt, expiresAt, updatedAt',
      deliveryQueue: 'localKey, localUserId, messageId, priorityRank, nextAttemptAt, expiresAt, retryCount',
      deliveryPathAttempts: 'id, localUserId, messageId, path, status, startedAt',
      workspaceConversations: 'localKey, localUserId, id, [localUserId+updatedAtMs], kind, lastSyncedAt',
      workspaceParticipants: 'localKey, localUserId, [localUserId+conversationId], user_id, role, lastSyncedAt',
      workspaceSyncState: 'localUserId, status, lastAttemptAt, lastSuccessfulSyncAt',
      workspaceSyncCursors: 'localKey, localUserId, conversationId, lastSyncedAt',
    })
  }
}

export const db = new FieldMeshDatabase()
