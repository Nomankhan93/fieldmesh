import { describe, expect, it } from 'vitest'
import { APP_BRAND, LEGACY_PROTOCOL_NAME } from './brand'

describe('ConnectX branding', () => {
  it('exposes the selected product name and tagline', () => {
    expect(APP_BRAND.name).toBe('ConnectX')
    expect(APP_BRAND.tagline).toBe('Stay Connected. Anywhere.')
  })

  it('points the app shell at the packaged ConnectX assets', () => {
    expect(APP_BRAND.icon).toBe('/icons/connectx-192.png')
    expect(APP_BRAND.logo).toBe('/brand/connectx-logo.webp')
  })

  it('keeps the validated protocol namespace explicit during the rebrand', () => {
    expect(LEGACY_PROTOCOL_NAME).toBe('FieldMesh')
  })
})
