import { z } from 'zod'
import {
  FIELDMESH_PROTOCOL_VERSION,
  type FieldMeshEnvelope,
  type FieldMeshMessageType,
  type FieldMeshUserId,
} from './types'

// Meshtastic documents a 233-byte application payload ceiling. FieldMesh 0.1.1
// uses a compact versioned wire tuple and keeps a small safety margin for the
// first hardware integration tests.
export const RADIO_ENVELOPE_BUDGET_BYTES = 220
export const DEFAULT_MESSAGE_TTL_MS = 24 * 60 * 60 * 1000

const envelopeSchema = z.object({
  version: z.literal(FIELDMESH_PROTOCOL_VERSION),
  id: z.string().uuid(),
  type: z.enum(['text', 'receipt', 'location', 'sos']),
  senderId: z.enum(['user-a', 'user-b']),
  recipientId: z.enum(['user-a', 'user-b']),
  createdAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  payload: z.object({
    text: z.string().optional(),
  }),
})

const wireSchema = z.tuple([
  z.literal(FIELDMESH_PROTOCOL_VERSION),
  z.string().regex(/^[0-9a-f]{32}$/i),
  z.number().int().min(0).max(3),
  z.number().int().min(0).max(1),
  z.number().int().min(0).max(1),
  z.number().int().positive(),
  z.number().int().positive(),
  z.string(),
])

const typeToCode: Record<FieldMeshMessageType, number> = {
  text: 0,
  receipt: 1,
  location: 2,
  sos: 3,
}
const codeToType: Record<number, FieldMeshMessageType> = {
  0: 'text',
  1: 'receipt',
  2: 'location',
  3: 'sos',
}
const userToCode: Record<FieldMeshUserId, number> = {
  'user-a': 0,
  'user-b': 1,
}
const codeToUser: Record<number, FieldMeshUserId> = {
  0: 'user-a',
  1: 'user-b',
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function compactUuid(id: string): string {
  return id.replaceAll('-', '')
}

function expandUuid(value: string): string {
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength
}

export function encodeEnvelope(envelope: FieldMeshEnvelope): Uint8Array {
  const value = envelopeSchema.parse(envelope)
  const wire = [
    value.version,
    compactUuid(value.id),
    typeToCode[value.type],
    userToCode[value.senderId],
    userToCode[value.recipientId],
    value.createdAt,
    value.expiresAt,
    value.payload.text ?? '',
  ] as const
  return encoder.encode(JSON.stringify(wire))
}

export function decodeEnvelope(bytes: Uint8Array): FieldMeshEnvelope {
  const wire = wireSchema.parse(JSON.parse(decoder.decode(bytes)))
  const envelope: FieldMeshEnvelope = {
    version: wire[0],
    id: expandUuid(wire[1]),
    type: codeToType[wire[2]],
    senderId: codeToUser[wire[3]],
    recipientId: codeToUser[wire[4]],
    createdAt: wire[5],
    expiresAt: wire[6],
    payload: wire[7] ? { text: wire[7] } : {},
  }
  return envelopeSchema.parse(envelope) as FieldMeshEnvelope
}

export function envelopeByteLength(envelope: FieldMeshEnvelope): number {
  return encodeEnvelope(envelope).byteLength
}

export function createTextEnvelope(args: {
  senderId: FieldMeshUserId
  recipientId: FieldMeshUserId
  text: string
  now?: number
  ttlMs?: number
}): FieldMeshEnvelope {
  const now = args.now ?? Date.now()
  return {
    version: FIELDMESH_PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    type: 'text',
    senderId: args.senderId,
    recipientId: args.recipientId,
    createdAt: now,
    expiresAt: now + (args.ttlMs ?? DEFAULT_MESSAGE_TTL_MS),
    payload: { text: args.text },
  }
}

export function assertFitsRadioBudget(envelope: FieldMeshEnvelope): void {
  const bytes = envelopeByteLength(envelope)
  if (bytes > RADIO_ENVELOPE_BUDGET_BYTES) {
    throw new Error(
      `Message is ${bytes} encoded bytes; radio budget is ${RADIO_ENVELOPE_BUDGET_BYTES} bytes. Shorten the message or use internet transport.`,
    )
  }
}
