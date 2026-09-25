export const BACKGROUND_WORKSPACE_SYNC_INTERVAL_MS = 12_000

export interface WorkspaceMessageCursor {
  lastServerCreatedAt?: string
  lastMessageId?: string
}

export interface ServerMessageIdentity {
  id: string
  created_at: string
}

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function messageIsAfterCursor(
  row: ServerMessageIdentity,
  cursor?: WorkspaceMessageCursor,
): boolean {
  if (!cursor?.lastServerCreatedAt) return true

  const rowTime = timestamp(row.created_at)
  const cursorTime = timestamp(cursor.lastServerCreatedAt)
  if (rowTime > cursorTime) return true
  if (rowTime < cursorTime) return false

  if (!cursor.lastMessageId) return false
  return row.id.localeCompare(cursor.lastMessageId) > 0
}

export function rowsAfterCursor<T extends ServerMessageIdentity>(
  rows: T[],
  cursor?: WorkspaceMessageCursor,
): T[] {
  return rows.filter((row) => messageIsAfterCursor(row, cursor))
}


export async function reconcileConversationSnapshot<T extends { id: string }>(args: {
  existingConversationIds: Iterable<string>
  listedConversations: T[]
  lookupMissingConversation: (conversationId: string) => Promise<T | null>
}): Promise<{ conversations: T[]; confirmedRemovedIds: string[] }> {
  const conversationsById = new Map(
    args.listedConversations.map((conversation) => [conversation.id, conversation] as const),
  )
  const confirmedRemovedIds: string[] = []
  const existingIds = [...new Set(args.existingConversationIds)].sort()

  for (const conversationId of existingIds) {
    if (conversationsById.has(conversationId)) continue
    const recovered = await args.lookupMissingConversation(conversationId)
    if (recovered) conversationsById.set(recovered.id, recovered)
    else confirmedRemovedIds.push(conversationId)
  }

  return {
    conversations: [...conversationsById.values()],
    confirmedRemovedIds,
  }
}

export function participantSnapshotIncludesUser<T extends { user_id: string }>(
  participants: T[],
  localUserId: string,
): boolean {
  return participants.some((participant) => participant.user_id === localUserId)
}

export class SingleFlight<Key, Value> {
  private readonly pending = new Map<Key, Promise<Value>>()

  run(key: Key, operation: () => Promise<Value>): Promise<Value> {
    const existing = this.pending.get(key)
    if (existing) return existing

    const task = operation().finally(() => {
      if (this.pending.get(key) === task) this.pending.delete(key)
    })
    this.pending.set(key, task)
    return task
  }

  has(key: Key): boolean {
    return this.pending.has(key)
  }
}
