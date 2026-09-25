import { describe, expect, it } from 'vitest'
import {
  MOBILE_PREVIEW_PRESETS,
  MOBILE_PREVIEW_ROUTES,
  isSafePreviewPath,
  previewDimensions,
} from './model'

describe('ConnectX mobile preview model', () => {
  it('ships realistic phone and tablet viewport presets', () => {
    expect(MOBILE_PREVIEW_PRESETS.map((preset) => preset.id)).toEqual([
      'compact',
      'iphone',
      'android',
      'tablet',
    ])
    expect(MOBILE_PREVIEW_PRESETS.find((preset) => preset.id === 'iphone')).toMatchObject({
      width: 390,
      height: 844,
    })
  })

  it('swaps frame dimensions for landscape orientation', () => {
    const iphone = MOBILE_PREVIEW_PRESETS.find((preset) => preset.id === 'iphone')!
    expect(previewDimensions(iphone, 'portrait')).toEqual({ width: 390, height: 844 })
    expect(previewDimensions(iphone, 'landscape')).toEqual({ width: 844, height: 390 })
  })

  it('limits preview navigation to normal user routes', () => {
    expect(MOBILE_PREVIEW_ROUTES.map((route) => route.path)).toEqual([
      '/',
      '/messages',
      '/sos',
      '/network',
      '/profile',
    ])
    expect(isSafePreviewPath('/messages')).toBe(true)
    expect(isSafePreviewPath('/developer/mobile-preview')).toBe(false)
    expect(isSafePreviewPath('https://example.com')).toBe(false)
  })
})
