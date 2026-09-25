import { describe, expect, it } from 'vitest'
import {
  avatarInitials,
  conversationPreview,
  messageDayLabel,
  messageStatusPresentation,
} from './messengerUi'

describe('ConnectX familiar messenger UI model', () => {
  it('builds compact initials for direct and group avatars', () => {
    expect(avatarInitials('Noman Khan')).toBe('NK')
    expect(avatarInitials('Rescue')).toBe('RE')
    expect(avatarInitials('')).toBe('CX')
  })

  it('maps durable delivery states to familiar messenger status glyphs', () => {
    expect(messageStatusPresentation('queued')).toMatchObject({ label: 'Queued', glyph: '◷' })
    expect(messageStatusPresentation('submitted')).toMatchObject({ label: 'Sent', glyph: '✓' })
    expect(messageStatusPresentation('delivered')).toMatchObject({ label: 'Delivered', glyph: '✓✓' })
    expect(messageStatusPresentation('read')).toMatchObject({ label: 'Read', glyph: '✓✓', tone: 'read' })
  })

  it('formats chat-list previews without changing stored message content', () => {
    expect(conversationPreview('Reached safely.', true)).toBe('You: Reached safely.')
    expect(conversationPreview('Reached safely.', false)).toBe('Reached safely.')
    expect(conversationPreview(undefined, false)).toBe('No messages yet')
  })

  it('uses familiar day separators', () => {
    const now = new Date(2026, 8, 25, 12).getTime()
    expect(messageDayLabel(new Date(2026, 8, 25, 9).getTime(), now)).toBe('Today')
    expect(messageDayLabel(new Date(2026, 8, 24, 23).getTime(), now)).toBe('Yesterday')
  })
})
