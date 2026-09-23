import { describe, expect, it } from 'vitest'
import {
  assertFitsRadioBudget,
  createTextEnvelope,
  decodeEnvelope,
  encodeEnvelope,
  utf8ByteLength,
} from './codec'

describe('FieldMesh message codec', () => {
  it('round-trips a text envelope', () => {
    const envelope = createTextEnvelope({
      senderId: 'user-a',
      recipientId: 'user-b',
      text: 'Reached destination',
      now: 1_800_000_000_000,
    })

    const decoded = decodeEnvelope(encodeEnvelope(envelope))
    expect(decoded).toEqual(envelope)
  })

  it('counts UTF-8 bytes rather than characters', () => {
    expect(utf8ByteLength('سلام')).toBeGreaterThan('سلام'.length)
  })

  it('rejects envelopes larger than the radio budget', () => {
    const envelope = createTextEnvelope({
      senderId: 'user-a',
      recipientId: 'user-b',
      text: 'x'.repeat(500),
    })
    expect(() => assertFitsRadioBudget(envelope)).toThrow(/radio budget/i)
  })
})
