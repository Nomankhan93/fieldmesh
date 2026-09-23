export const FIELDMESH_PROTOCOL_VERSION = 1 as const

export type FieldMeshUserId = 'user-a' | 'user-b'

export type FieldMeshMessageType = 'text' | 'receipt' | 'location' | 'sos'

export type DeliveryState =
  | 'queued'
  | 'submitted'
  | 'delivered'
  | 'read'
  | 'expired'
  | 'unconfirmed'
  | 'failed'

export interface FieldMeshEnvelope {
  version: typeof FIELDMESH_PROTOCOL_VERSION
  id: string
  type: FieldMeshMessageType
  senderId: FieldMeshUserId
  recipientId: FieldMeshUserId
  createdAt: number
  expiresAt: number
  payload: {
    text?: string
  }
}

export interface StoredMessage {
  id: string
  conversationId: string
  senderId: FieldMeshUserId
  recipientId: FieldMeshUserId
  body: string
  envelope: FieldMeshEnvelope
  state: DeliveryState
  createdAt: number
  updatedAt: number
}

export interface DeliveryAttempt {
  id: string
  messageId: string
  transport: 'mock-radio' | 'internet'
  status: 'started' | 'accepted' | 'failed'
  startedAt: number
  finishedAt?: number
  failureReason?: string
}
