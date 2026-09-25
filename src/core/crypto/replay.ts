export function cryptoReplayToken(conversationId: string, messageId: string): string {
  return `${conversationId}:${messageId}`
}

export class ReplayWindow {
  private readonly seen = new Map<string, number>()

  accept(token: string, expiresAt: number, now = Date.now()): boolean {
    this.prune(now)
    const existingExpiry = this.seen.get(token)
    if (existingExpiry !== undefined && existingExpiry > now) return false
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return false
    this.seen.set(token, expiresAt)
    return true
  }

  has(token: string, now = Date.now()): boolean {
    this.prune(now)
    return (this.seen.get(token) ?? 0) > now
  }

  prune(now = Date.now()): void {
    for (const [token, expiresAt] of this.seen) {
      if (expiresAt <= now) this.seen.delete(token)
    }
  }

  get size(): number {
    return this.seen.size
  }
}
