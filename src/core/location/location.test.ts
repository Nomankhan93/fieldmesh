import { describe, expect, it } from 'vitest'
import { createLocationFix } from './types'

describe('FieldMesh location model', () => {
  it('creates a validated location fix', () => {
    const fix = createLocationFix({
      id: 'fix-1',
      latitude: 25.36,
      longitude: 69.74,
      accuracy: 14,
      capturedAt: 1_000,
      source: 'simulated',
    })

    expect(fix.id).toBe('fix-1')
    expect(fix.latitude).toBe(25.36)
    expect(fix.longitude).toBe(69.74)
    expect(fix.accuracy).toBe(14)
    expect(fix.capturedAt).toBe(1_000)
  })

  it('rejects invalid coordinates', () => {
    expect(() => createLocationFix({ latitude: 91, longitude: 10, accuracy: 1 })).toThrow()
    expect(() => createLocationFix({ latitude: 10, longitude: 181, accuracy: 1 })).toThrow()
    expect(() => createLocationFix({ latitude: 10, longitude: 10, accuracy: -1 })).toThrow()
  })
})
