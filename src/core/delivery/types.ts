import type { FieldMeshMessage, MessagePriority } from '../message/model'

export type DeliveryPath = 'internet' | 'radio' | 'gateway'

export type CanonicalDeliveryState =
  | 'queued'
  | 'submitted'
  | 'delivered'
  | 'read'
  | 'expired'
  | 'failed'

export interface DeliveryRoutingContext {
  localUserId: string
  conversationKind?: 'direct' | 'group'
  recipientUserIds?: string[]
}

export interface CanonicalMessageRecord {
  localKey: string
  localUserId: string
  messageId: string
  conversationId: string
  senderUserId: string
  type: FieldMeshMessage['type']
  priority: MessagePriority
  message: FieldMeshMessage
  state: CanonicalDeliveryState
  lastPath?: DeliveryPath
  createdAt: number
  expiresAt: number
  updatedAt: number
}

export interface DeliveryQueueRecord {
  localKey: string
  localUserId: string
  messageId: string
  priorityRank: number
  candidatePaths: DeliveryPath[]
  context: DeliveryRoutingContext
  nextAttemptAt: number
  expiresAt: number
  retryCount: number
  lastFailureReason?: string
}

export interface DeliveryPathAttemptRecord {
  id: string
  localKey: string
  localUserId: string
  messageId: string
  path: DeliveryPath
  status: 'started' | 'accepted' | 'failed'
  startedAt: number
  finishedAt?: number
  failureReason?: string
}

export interface DeliveryAdapterResult {
  acceptedAt: number
  transportMessageId: string
  serverCreatedAt?: number
}

export interface DeliveryPathAdapter {
  readonly path: DeliveryPath
  isAvailable(): boolean | Promise<boolean>
  submit(message: FieldMeshMessage, context: DeliveryRoutingContext): Promise<DeliveryAdapterResult>
}

export interface DeliveryStore {
  enqueue(message: CanonicalMessageRecord, queue: DeliveryQueueRecord): Promise<void>
  getMessage(localUserId: string, messageId: string): Promise<CanonicalMessageRecord | undefined>
  getQueue(localUserId: string, messageId: string): Promise<DeliveryQueueRecord | undefined>
  putMessage(message: CanonicalMessageRecord): Promise<void>
  updateMessage(localUserId: string, messageId: string, changes: Partial<CanonicalMessageRecord>): Promise<void>
  putQueue(queue: DeliveryQueueRecord): Promise<void>
  deleteQueue(localUserId: string, messageId: string): Promise<void>
  listDue(localUserId: string, now: number): Promise<DeliveryQueueRecord[]>
  putAttempt(attempt: DeliveryPathAttemptRecord): Promise<void>
  updateAttempt(id: string, changes: Partial<DeliveryPathAttemptRecord>): Promise<void>
}

export interface DeliveryDispatchResult {
  messageId: string
  state: CanonicalDeliveryState
  path?: DeliveryPath
  serverCreatedAt?: number
}
