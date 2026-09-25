import { describe, expect, it } from 'vitest'
import { compactPwaStatus, connectionRows } from './informationHierarchy'

describe('ConnectX mobile information hierarchy', () => {
  it('keeps network status compact and user-facing', () => {
    const rows = connectionRows({ internet: true, radio: false, gateway: false })
    expect(rows.map((row) => row.value)).toEqual(['Connected', 'Not connected', 'Not available'])
    expect(rows[0]?.tone).toBe('good')
  })

  it('summarizes PWA internals into normal-user states', () => {
    expect(compactPwaStatus({ standalone: true, offlineReady: true, updateAvailable: false })).toEqual({
      installed: 'Installed',
      offline: 'Ready',
      updates: 'Up to date',
    })
  })
})
