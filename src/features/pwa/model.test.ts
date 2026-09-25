import { describe, expect, it } from 'vitest'
import { detectPwaInstallPlatform, installGuidance, isStandaloneDisplay } from './model'

describe('ConnectX PWA model', () => {
  it('detects iOS including iPad desktop user-agent mode', () => {
    expect(detectPwaInstallPlatform({ userAgent: 'Mozilla/5.0 (iPhone)', platform: 'iPhone' })).toBe('ios')
    expect(detectPwaInstallPlatform({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios')
  })

  it('detects Android and desktop install targets', () => {
    expect(detectPwaInstallPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 15)' })).toBe('android')
    expect(detectPwaInstallPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toBe('desktop')
  })

  it('treats display-mode or iOS navigator standalone as installed', () => {
    expect(isStandaloneDisplay({ displayModeStandalone: true })).toBe(true)
    expect(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: true })).toBe(true)
    expect(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: false })).toBe(false)
  })

  it('provides platform-specific installation guidance', () => {
    expect(installGuidance('ios')).toContain('Add to Home Screen')
    expect(installGuidance('android')).toContain('Install ConnectX')
  })
})
