import { describe, expect, it } from 'vitest'
import { describeConnection } from './networkStatus'

describe('plain-language connection status', () => {
  it('prefers Internet when it is available', () => {
    expect(describeConnection({ internet: true, radio: true, gateway: true }).mode).toBe('internet')
  })

  it('describes a gateway bridge as hybrid when phone Internet is unavailable', () => {
    expect(describeConnection({ internet: false, radio: true, gateway: true }).mode).toBe('hybrid')
  })

  it('describes radio-only reachability without claiming remote Internet delivery', () => {
    expect(describeConnection({ internet: false, radio: true, gateway: false }).mode).toBe('radio')
  })

  it('keeps offline messages local when no live path exists', () => {
    expect(describeConnection({ internet: false, radio: false, gateway: false }).canCommunicate).toBe(false)
  })
})
