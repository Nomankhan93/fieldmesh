import type { FieldMeshUserId, MessageId } from '../protocol/ids'

export const FIELDMESH_MESSAGE_VERSION = 1 as const
export const DEFAULT_TEXT_MESSAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const DEFAULT_LOCATION_MESSAGE_TTL_MS = 60 * 60 * 1000
export const DEFAULT_SOS_MESSAGE_TTL_MS = 24 * 60 * 60 * 1000

export type FieldMeshMessageType = 'text' | 'receipt' | 'location' | 'sos'
export type MessagePriority = 'normal' | 'location' | 'control' | 'emergency'
export type SosCategory = 'medical' | 'security' | 'accident' | 'lost' | 'vehicle' | 'other'

export interface FieldMeshLocationPayload {
  latitude: number
  longitude: number
  accuracy: number
  capturedAt: number
}

export interface FieldMeshSosPayload {
  sosId: string
  category: SosCategory
  message?: string
  location?: FieldMeshLocationPayload
  batteryPercent?: number
}

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
    location?: FieldMeshLocationPayload
    sos?: FieldMeshSosPayload
  }
}

export const MESSAGE_PRIORITY_RANK: Record<MessagePriority, number> = {
  emergency: 0,
  control: 1,
  location: 2,
  normal: 3,
}

export function compareMessagePriority(a: MessagePriority, b: MessagePriority): number {
  return MESSAGE_PRIORITY_RANK[a] - MESSAGE_PRIORITY_RANK[b]
}

export function directConversationKey(a: string, b: string): string {
  return [a, b].sort().join(':')
}

function assertTtl(ttlMs: number): void {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error('Message TTL must be greater than zero')
  }
}

function assertLocation(location: FieldMeshLocationPayload): void {
  if (!Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90) {
    throw new Error('Latitude must be between -90 and 90.')
  }
  if (!Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) {
    throw new Error('Longitude must be between -180 and 180.')
  }
  if (!Number.isFinite(location.accuracy) || location.accuracy < 0) {
    throw new Error('Location accuracy must be zero or greater.')
  }
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
  assertTtl(ttlMs)

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

export function createLocationMessage(args: {
  conversationId: string
  senderUserId: FieldMeshUserId
  location: FieldMeshLocationPayload
  id?: MessageId
  now?: number
  ttlMs?: number
}): FieldMeshMessage {
  assertLocation(args.location)
  const now = args.now ?? Date.now()
  const ttlMs = args.ttlMs ?? DEFAULT_LOCATION_MESSAGE_TTL_MS
  assertTtl(ttlMs)

  return {
    version: FIELDMESH_MESSAGE_VERSION,
    id: args.id ?? crypto.randomUUID(),
    conversationId: args.conversationId,
    senderUserId: args.senderUserId,
    type: 'location',
    priority: 'location',
    createdAt: now,
    expiresAt: now + ttlMs,
    payload: { location: { ...args.location } },
  }
}

export function createSosMessage(args: {
  conversationId: string
  senderUserId: FieldMeshUserId
  sosId?: string
  category: SosCategory
  message?: string
  location?: FieldMeshLocationPayload
  batteryPercent?: number
  id?: MessageId
  now?: number
  ttlMs?: number
}): FieldMeshMessage {
  if (args.location) assertLocation(args.location)
  if (args.batteryPercent !== undefined && (
    !Number.isFinite(args.batteryPercent)
    || args.batteryPercent < 0
    || args.batteryPercent > 100
  )) {
    throw new Error('Battery percent must be between 0 and 100.')
  }

  const now = args.now ?? Date.now()
  const ttlMs = args.ttlMs ?? DEFAULT_SOS_MESSAGE_TTL_MS
  assertTtl(ttlMs)
  const note = args.message?.trim()

  return {
    version: FIELDMESH_MESSAGE_VERSION,
    id: args.id ?? crypto.randomUUID(),
    conversationId: args.conversationId,
    senderUserId: args.senderUserId,
    type: 'sos',
    priority: 'emergency',
    createdAt: now,
    expiresAt: now + ttlMs,
    payload: {
      sos: {
        sosId: args.sosId ?? crypto.randomUUID(),
        category: args.category,
        ...(note ? { message: note } : {}),
        ...(args.location ? { location: { ...args.location } } : {}),
        ...(args.batteryPercent !== undefined ? { batteryPercent: args.batteryPercent } : {}),
      },
    },
  }
}
