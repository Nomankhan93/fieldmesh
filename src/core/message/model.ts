import type { FieldMeshUserId, MessageId } from '../protocol/ids'

export const FIELDMESH_MESSAGE_VERSION = 1 as const
export const DEFAULT_TEXT_MESSAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type FieldMeshMessageType = 'text' | 'receipt' | 'location' | 'sos'
export type MessagePriority = 'normal' | 'location' | 'control' | 'emergency'

export interface FieldMeshMessage {
  version: typeof FIELDMESH_MESSAGE_VERSION
  id: MessageId
  conversationId: string
  senderUserId: FieldMeshUserId
  type: FieldMeshMessageType
  priority: MessagePriority
  createdAt: number
  expiresAt: number
  payload: {
    text?: string
  }
}

export function directConversationKey(a: string, b: string): string {
  return [a, b].sort().join(':')
}

export function createTextMessage(args: {
  conversationId: string
  senderUserId: FieldMeshUserId
  text: string
  id?: MessageId
  now?: number
  ttlMs?: number
  priority?: MessagePriority
}): FieldMeshMessage {
  const text = args.text.trim()
  if (!text) throw new Error('Message cannot be empty')

  const now = args.now ?? Date.now()
  const ttlMs = args.ttlMs ?? DEFAULT_TEXT_MESSAGE_TTL_MS
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error('Message TTL must be greater than zero')
  }

  return {
    version: FIELDMESH_MESSAGE_VERSION,
    id: args.id ?? crypto.randomUUID(),
    conversationId: args.conversationId,
    senderUserId: args.senderUserId,
    type: 'text',
    priority: args.priority ?? 'normal',
    createdAt: now,
    expiresAt: now + ttlMs,
    payload: { text },
  }
}
