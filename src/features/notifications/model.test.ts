import { describe, expect, it } from 'vitest'
import { notificationPreview, shouldSurfaceIncoming } from './model'

describe('ConnectX notification model', () => {
  it('suppresses own and muted messages', () => {
    expect(shouldSurfaceIncoming({ senderId: 'a', localUserId: 'a', muted: false })).toBe(false)
    expect(shouldSurfaceIncoming({ senderId: 'b', localUserId: 'a', muted: true })).toBe(false)
    expect(shouldSurfaceIncoming({ senderId: 'b', localUserId: 'a', muted: false })).toBe(true)
  })

  it('creates compact previews', () => {
    expect(notificationPreview('  hello   there  ')).toBe('hello there')
    expect(notificationPreview('abcdefghij', 6)).toBe('abcde…')
  })
})
