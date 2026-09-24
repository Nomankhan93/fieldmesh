import type { FieldMeshMessage, SosCategory } from '../message/model'
import { RADIO_APPLICATION_BUDGET_BYTES } from '../transport/limits'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const SAFETY_WIRE_VERSION = 1
const RADIO_NOTE_BUDGET_BYTES = 72

const categoryToCode: Record<SosCategory, number> = {
  medical: 0,
  security: 1,
  accident: 2,
  lost: 3,
  vehicle: 4,
  other: 5,
}

const codeToCategory: Record<number, SosCategory> = {
  0: 'medical',
  1: 'security',
  2: 'accident',
  3: 'lost',
  4: 'vehicle',
  5: 'other',
}

export type SafetyRadioPayload =
  | {
      kind: 'location'
      senderUserId: string
      latitude: number
      longitude: number
      accuracy: number
      capturedAt: number
    }
  | {
      kind: 'sos'
      senderUserId: string
      sosId: string
      category: SosCategory
      message?: string
      latitude?: number
      longitude?: number
      accuracy?: number
      capturedAt?: number
      batteryPercent?: number
    }

function truncateUtf8(value: string, maxBytes: number): string {
  let output = ''
  for (const character of value) {
    const candidate = output + character
    if (encoder.encode(candidate).byteLength > maxBytes) break
    output = candidate
  }
  return output
}

function coordinateToInt(value: number): number {
  return Math.round(value * 100_000)
}

function coordinateFromInt(value: number): number {
  return value / 100_000
}

export function encodeSafetyRadioPayload(message: FieldMeshMessage): Uint8Array {
  let wire: readonly unknown[]

  if (message.type === 'location' && message.payload.location) {
    const location = message.payload.location
    wire = [
      SAFETY_WIRE_VERSION,
      0,
      message.senderUserId,
      coordinateToInt(location.latitude),
      coordinateToInt(location.longitude),
      Math.round(location.accuracy),
      Math.floor(location.capturedAt / 1_000),
    ] as const
  } else if (message.type === 'sos' && message.payload.sos) {
    const sos = message.payload.sos
    const location = sos.location
    wire = [
      SAFETY_WIRE_VERSION,
      1,
      message.senderUserId,
      sos.sosId,
      categoryToCode[sos.category],
      location ? coordinateToInt(location.latitude) : null,
      location ? coordinateToInt(location.longitude) : null,
      location ? Math.round(location.accuracy) : null,
      location ? Math.floor(location.capturedAt / 1_000) : null,
      sos.batteryPercent ?? null,
      sos.message ? truncateUtf8(sos.message, RADIO_NOTE_BUDGET_BYTES) : '',
    ] as const
  } else {
    throw new Error('Safety radio codec only supports location and SOS logical messages.')
  }

  const bytes = encoder.encode(JSON.stringify(wire))
  if (bytes.byteLength > RADIO_APPLICATION_BUDGET_BYTES) {
    throw new Error(
      `Safety payload is ${bytes.byteLength} encoded bytes; radio budget is ${RADIO_APPLICATION_BUDGET_BYTES} bytes.`,
    )
  }
  return bytes
}

export function decodeSafetyRadioPayload(bytes: Uint8Array): SafetyRadioPayload {
  const value: unknown = JSON.parse(decoder.decode(bytes))
  if (!Array.isArray(value) || value[0] !== SAFETY_WIRE_VERSION) {
    throw new Error('Unsupported FieldMesh safety radio payload.')
  }

  if (value[1] === 0) {
    const [, , senderUserId, latitude, longitude, accuracy, capturedAt] = value
    if (
      typeof senderUserId !== 'string'
      || typeof latitude !== 'number'
      || typeof longitude !== 'number'
      || typeof accuracy !== 'number'
      || typeof capturedAt !== 'number'
    ) {
      throw new Error('Invalid FieldMesh location radio payload.')
    }
    return {
      kind: 'location',
      senderUserId,
      latitude: coordinateFromInt(latitude),
      longitude: coordinateFromInt(longitude),
      accuracy,
      capturedAt: capturedAt * 1_000,
    }
  }

  if (value[1] === 1) {
    const [, , senderUserId, sosId, categoryCode, latitude, longitude, accuracy, capturedAt, batteryPercent, note] = value
    if (
      typeof senderUserId !== 'string'
      || typeof sosId !== 'string'
      || typeof categoryCode !== 'number'
      || !codeToCategory[categoryCode]
    ) {
      throw new Error('Invalid FieldMesh SOS radio payload.')
    }
    const hasLocation = typeof latitude === 'number'
      && typeof longitude === 'number'
      && typeof accuracy === 'number'
      && typeof capturedAt === 'number'

    return {
      kind: 'sos',
      senderUserId,
      sosId,
      category: codeToCategory[categoryCode],
      ...(typeof note === 'string' && note ? { message: note } : {}),
      ...(hasLocation ? {
        latitude: coordinateFromInt(latitude),
        longitude: coordinateFromInt(longitude),
        accuracy,
        capturedAt: capturedAt * 1_000,
      } : {}),
      ...(typeof batteryPercent === 'number' ? { batteryPercent } : {}),
    }
  }

  throw new Error('Unknown FieldMesh safety radio payload type.')
}
