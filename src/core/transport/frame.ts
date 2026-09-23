import type {
  MessageId,
  TransportFrameId,
  TransportNodeId,
} from '../protocol/ids'

export const FIELDMESH_TRANSPORT_FRAME_VERSION = 1 as const
export const DEFAULT_FRAME_HOP_LIMIT = 8

export interface TransportFrame {
  version: typeof FIELDMESH_TRANSPORT_FRAME_VERSION
  frameId: TransportFrameId
  messageId: MessageId
  sourceNodeId: TransportNodeId
  destinationNodeId: TransportNodeId
  createdAt: number
  expiresAt: number
  attempt: number
  hopLimit: number
  payload: Uint8Array
}

export function createTransportFrame(args: {
  messageId: MessageId
  sourceNodeId: TransportNodeId
  destinationNodeId: TransportNodeId
  createdAt?: number
  expiresAt: number
  attempt: number
  hopLimit?: number
  payload: Uint8Array
  frameId?: TransportFrameId
}): TransportFrame {
  const createdAt = args.createdAt ?? Date.now()
  const hopLimit = args.hopLimit ?? DEFAULT_FRAME_HOP_LIMIT

  if (args.expiresAt <= createdAt) {
    throw new Error('Cannot create an already-expired transport frame')
  }
  if (!Number.isInteger(args.attempt) || args.attempt < 1) {
    throw new Error('Transport frame attempt must be a positive integer')
  }
  if (!Number.isInteger(hopLimit) || hopLimit < 1 || hopLimit > 255) {
    throw new Error('Transport frame hop limit must be between 1 and 255')
  }

  return {
    version: FIELDMESH_TRANSPORT_FRAME_VERSION,
    frameId: args.frameId ?? crypto.randomUUID(),
    messageId: args.messageId,
    sourceNodeId: args.sourceNodeId,
    destinationNodeId: args.destinationNodeId,
    createdAt,
    expiresAt: args.expiresAt,
    attempt: args.attempt,
    hopLimit,
    payload: new Uint8Array(args.payload),
  }
}

export function isTransportFrameExpired(frame: TransportFrame, now = Date.now()): boolean {
  return frame.expiresAt <= now
}
