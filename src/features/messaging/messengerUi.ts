import type { CloudMessageState } from '../../offline/db'

export type MessageStatusPresentation = {
  label: string
  glyph: string
  tone: 'muted' | 'read' | 'danger'
}

const AVATAR_TONES = [
  'from-cyan-500 to-blue-700',
  'from-blue-500 to-violet-700',
  'from-violet-500 to-fuchsia-700',
  'from-sky-500 to-indigo-700',
  'from-teal-500 to-blue-700',
] as const

export function avatarInitials(label: string): string {
  const words = label.trim().split(/\s+/u).filter(Boolean)
  if (words.length === 0) return 'CX'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return `${words[0]![0] ?? ''}${words[words.length - 1]![0] ?? ''}`.toUpperCase()
}

export function avatarTone(label: string): string {
  let hash = 0
  for (const character of label) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length]!
}

export function messageStatusPresentation(state: CloudMessageState): MessageStatusPresentation {
  switch (state) {
    case 'queued':
      return { label: 'Queued', glyph: '◷', tone: 'muted' }
    case 'submitted':
      return { label: 'Sent', glyph: '✓', tone: 'muted' }
    case 'delivered':
      return { label: 'Delivered', glyph: '✓✓', tone: 'muted' }
    case 'read':
      return { label: 'Read', glyph: '✓✓', tone: 'read' }
    case 'expired':
      return { label: 'Expired', glyph: '!', tone: 'danger' }
    case 'failed':
      return { label: 'Failed', glyph: '!', tone: 'danger' }
  }
}

export function conversationPreview(body: string | undefined, mine: boolean): string {
  if (!body) return 'No messages yet'
  return mine ? `You: ${body}` : body
}

export function messageDayKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function messageDayLabel(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp)
  const today = new Date(now)
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayDifference = Math.round((startToday - startDate) / 86_400_000)

  if (dayDifference === 0) return 'Today'
  if (dayDifference === 1) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' }).format(date)
}
