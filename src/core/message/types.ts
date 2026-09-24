import type { FieldMeshMessage, FieldMeshMessageType } from './model'
import type { SimulatorUserId } from '../protocol/ids'

export { FIELDMESH_MESSAGE_VERSION } from './model'
export type {
  FieldMeshDeviceId,
  FieldMeshUserId,
  RadioNodeId,
  SimulatorNodeId,
  SimulatorUserId,
} from '../protocol/ids'
export type {
  FieldMeshLocationPayload,
  FieldMeshMessage,
  FieldMeshMessageType,
  FieldMeshSosPayload,
  MessagePriority,
  SosCategory,
} from './model'

export const FIELDMESH_PROTOCOL_VERSION = 1 as const

export type DeliveryState =
  | 'queued'
  | 'submitted'
  | 'delivered'
  | 'read'
  | 'expired'
  | 'unconfirmed'
  | 'failed'

// Compact simulator/radio payload. Authenticated FieldMesh user identity remains
// separate from simulator/radio node identity and is not encoded as user-a/user-b
// in the production identity model.
export interface FieldMeshEnvelope {
  version: typeof FIELDMESH_PROTOCOL_VERSION
  id: string
  type: FieldMeshMessageType
  senderId: SimulatorUserId
  recipientId: SimulatorUserId
  createdAt: number
  expiresAt: number
  payload: {
    text?: string
  }
}

export interface StoredMessage {
  id: string
  conversationId: string
  senderId: SimulatorUserId
  recipientId: SimulatorUserId
  body: string
  envelope: FieldMeshEnvelope
  logicalMessage?: FieldMeshMessage
  state: DeliveryState
  createdAt: number
  updatedAt: number
}

export interface DeliveryAttempt {
  id: string
  messageId: string
  frameId?: string
  transport: string
  status: 'started' | 'accepted' | 'failed'
  startedAt: number
  finishedAt?: number
  failureReason?: string
}
