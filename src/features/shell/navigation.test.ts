import { describe, expect, it } from 'vitest'
import {
  DEVELOPER_NAV_ITEMS,
  MOBILE_NAV_ITEMS,
  USER_NAV_ITEMS,
  isDeveloperPath,
  isNavItemActive,
} from './navigation'

describe('ConnectX product navigation', () => {
  it('keeps engineering tools out of the normal user navigation', () => {
    expect(USER_NAV_ITEMS.map((item) => item.to)).toEqual([
      '/',
      '/messages',
      '/sos',
      '/network',
      '/profile',
    ])
    expect(MOBILE_NAV_ITEMS.map((item) => item.to)).toEqual([
      '/',
      '/messages',
      '/sos',
      '/network',
      '/profile',
    ])
    expect(USER_NAV_ITEMS.some((item) => item.to.startsWith('/developer'))).toBe(false)
    expect(USER_NAV_ITEMS.every((item) => Boolean(item.icon))).toBe(true)
  })

  it('keeps mesh and gateway diagnostics in the developer navigation', () => {
    expect(DEVELOPER_NAV_ITEMS.map((item) => item.to)).toEqual([
      '/developer',
      '/developer/mesh',
      '/developer/gateway',
      '/developer/security',
      '/developer/delivery',
      '/developer/workspace',
      '/developer/mobile-preview',
    ])
    expect(isDeveloperPath('/developer/mesh')).toBe(true)
    expect(isDeveloperPath('/developer/gateway')).toBe(true)
    expect(isDeveloperPath('/developer/security')).toBe(true)
    expect(isDeveloperPath('/developer/delivery')).toBe(true)
    expect(isDeveloperPath('/developer/workspace')).toBe(true)
    expect(isDeveloperPath('/developer/mobile-preview')).toBe(true)
    expect(isDeveloperPath('/simulator')).toBe(true)
    expect(isDeveloperPath('/gateway')).toBe(true)
    expect(isDeveloperPath('/messages')).toBe(false)
  })

  it('marks only the relevant user navigation item active', () => {
    expect(isNavItemActive('/', '/')).toBe(true)
    expect(isNavItemActive('/messages', '/messages')).toBe(true)
    expect(isNavItemActive('/profile', '/profile')).toBe(true)
    expect(isNavItemActive('/messages', '/')).toBe(false)
  })
})
