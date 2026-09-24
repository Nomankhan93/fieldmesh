import { describe, expect, it } from 'vitest'
import { createLocationMessage, createSosMessage } from '../message/model'
import { RADIO_APPLICATION_BUDGET_BYTES } from '../transport/limits'
import { decodeSafetyRadioPayload, encodeSafetyRadioPayload } from './codec'

describe('FieldMesh safety radio codec', () => {
  it('encodes a location update within the radio byte budget', () => {
    const message = createLocationMessage({
      conversationId: 'field-safety',
      senderUserId: '550e8400-e29b-41d4-a716-446655440000',
      id: 'loc-message',
      now: 2_000,
      location: { latitude: 25.36, longitude: 69.74, accuracy: 12, capturedAt: 1_000 },
    })
    const bytes = encodeSafetyRadioPayload(message)
    expect(bytes.byteLength).toBeLessThanOrEqual(RADIO_APPLICATION_BUDGET_BYTES)
    expect(decodeSafetyRadioPayload(bytes)).toMatchObject({ kind: 'location', latitude: 25.36, longitude: 69.74 })
  })

  it('keeps essential SOS fields and byte-safely shortens an optional long radio note', () => {
    const message = createSosMessage({
      conversationId: 'field-safety',
      senderUserId: '550e8400-e29b-41d4-a716-446655440000',
      id: 'sos-message',
      sosId: '9ec498fd-0ca3-4a88-a126-6e6b98573e9e',
      category: 'medical',
      message: 'Emergency '.repeat(30),
      batteryPercent: 42,
      now: 2_000,
      location: { latitude: 25.36, longitude: 69.74, accuracy: 8, capturedAt: 1_000 },
    })
    const bytes = encodeSafetyRadioPayload(message)
    const decoded = decodeSafetyRadioPayload(bytes)

    expect(bytes.byteLength).toBeLessThanOrEqual(RADIO_APPLICATION_BUDGET_BYTES)
    expect(decoded).toMatchObject({ kind: 'sos', category: 'medical', batteryPercent: 42 })
    expect(decoded.kind === 'sos' ? decoded.message?.length : 0).toBeLessThan(message.payload.sos?.message?.length ?? 0)
  })

  it('encodes SOS without GPS', () => {
    const message = createSosMessage({
      conversationId: 'field-safety',
      senderUserId: 'user-a',
      id: 'sos-no-gps-message',
      sosId: 'sos-no-gps',
      category: 'lost',
      now: 2_000,
    })
    const decoded = decodeSafetyRadioPayload(encodeSafetyRadioPayload(message))
    expect(decoded).toMatchObject({ kind: 'sos', category: 'lost' })
    expect(decoded.kind === 'sos' ? decoded.latitude : undefined).toBeUndefined()
  })
})
