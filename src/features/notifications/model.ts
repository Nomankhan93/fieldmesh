export type ConnectXNotificationPermission = NotificationPermission | 'unsupported'

export type IncomingNotificationDetail = {
  conversationId: string
  messageId: string
  title: string
  body: string
}

export function notificationPreview(body: string, maxLength = 96): string {
  const compact = body.trim().replace(/\s+/gu, ' ')
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}

export function shouldSurfaceIncoming(args: {
  senderId: string
  localUserId: string
  muted: boolean
}): boolean {
  return args.senderId !== args.localUserId && !args.muted
}
