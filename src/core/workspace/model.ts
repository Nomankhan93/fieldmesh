export type WorkspaceSyncStatus = 'never' | 'syncing' | 'ready' | 'error'

export interface WorkspaceConversationRecord {
  localKey: string
  localUserId: string
  id: string
  kind: 'direct' | 'group'
  title: string | null
  created_by: string
  created_at: string
  updated_at: string
  updatedAtMs: number
  lastSyncedAt: number
}

export interface WorkspaceParticipantRecord {
  localKey: string
  localUserId: string
  conversationId: string
  user_id: string
  fieldmesh_user_id: string
  display_name: string
  role: 'owner' | 'admin' | 'member'
  joined_at?: string
  lastSyncedAt: number
}

export interface WorkspaceSyncStateRecord {
  localUserId: string
  status: WorkspaceSyncStatus
  lastAttemptAt?: number
  lastSuccessfulSyncAt?: number
  lastError?: string
}

export interface WorkspaceSyncCursorRecord {
  localKey: string
  localUserId: string
  conversationId: string
  lastServerCreatedAt?: string
  lastMessageId?: string
  lastSyncedAt: number
}

export interface WorkspaceConversationPreferenceRecord {
  localKey: string
  localUserId: string
  conversationId: string
  hiddenAt?: string
  clearedBefore?: string
  muted: boolean
  updatedAt: number
}

export interface RemoteConversationUserState {
  conversation_id: string
  hidden_at: string | null
  cleared_before: string | null
  muted: boolean
  updated_at: string
}

export interface RemoteWorkspaceConversation {
  id: string
  kind: 'direct' | 'group'
  title: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface RemoteWorkspaceParticipant {
  user_id: string
  fieldmesh_user_id: string
  display_name: string
  role: 'owner' | 'admin' | 'member'
  joined_at?: string
}

export function workspaceConversationKey(localUserId: string, conversationId: string): string {
  return `${localUserId}:${conversationId}`
}

export function workspaceParticipantKey(
  localUserId: string,
  conversationId: string,
  participantUserId: string,
): string {
  return `${localUserId}:${conversationId}:${participantUserId}`
}

export function workspaceCursorKey(localUserId: string, conversationId: string): string {
  return workspaceConversationKey(localUserId, conversationId)
}

export function workspacePreferenceKey(localUserId: string, conversationId: string): string {
  return workspaceConversationKey(localUserId, conversationId)
}

export function toWorkspaceConversationPreferenceRecord(args: {
  localUserId: string
  state: RemoteConversationUserState
}): WorkspaceConversationPreferenceRecord {
  return {
    localKey: workspacePreferenceKey(args.localUserId, args.state.conversation_id),
    localUserId: args.localUserId,
    conversationId: args.state.conversation_id,
    ...(args.state.hidden_at ? { hiddenAt: args.state.hidden_at } : {}),
    ...(args.state.cleared_before ? { clearedBefore: args.state.cleared_before } : {}),
    muted: args.state.muted,
    updatedAt: Date.parse(args.state.updated_at) || Date.now(),
  }
}

export function toWorkspaceConversationRecord(args: {
  localUserId: string
  conversation: RemoteWorkspaceConversation
  syncedAt: number
}): WorkspaceConversationRecord {
  const updatedAtMs = Date.parse(args.conversation.updated_at)
  return {
    localKey: workspaceConversationKey(args.localUserId, args.conversation.id),
    localUserId: args.localUserId,
    ...args.conversation,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : args.syncedAt,
    lastSyncedAt: args.syncedAt,
  }
}

export function toWorkspaceParticipantRecord(args: {
  localUserId: string
  conversationId: string
  participant: RemoteWorkspaceParticipant
  syncedAt: number
}): WorkspaceParticipantRecord {
  return {
    localKey: workspaceParticipantKey(
      args.localUserId,
      args.conversationId,
      args.participant.user_id,
    ),
    localUserId: args.localUserId,
    conversationId: args.conversationId,
    ...args.participant,
    lastSyncedAt: args.syncedAt,
  }
}

export function removedConversationIds(
  existingConversationIds: Iterable<string>,
  incomingConversationIds: Iterable<string>,
): string[] {
  const incoming = new Set(incomingConversationIds)
  return [...new Set(existingConversationIds)].filter((id) => !incoming.has(id)).sort()
}

export function sortWorkspaceConversations<T extends { updatedAtMs: number; id: string }>(
  conversations: T[],
): T[] {
  return [...conversations].sort(
    (a, b) => b.updatedAtMs - a.updatedAtMs || a.id.localeCompare(b.id),
  )
}

export function workspaceAvailability(args: {
  browserOnline: boolean
  cachedConversationCount: number
  lastSuccessfulSyncAt?: number
}): 'online' | 'offline-cached' | 'offline-empty' {
  if (args.browserOnline) return 'online'
  return args.cachedConversationCount > 0 || args.lastSuccessfulSyncAt
    ? 'offline-cached'
    : 'offline-empty'
}
