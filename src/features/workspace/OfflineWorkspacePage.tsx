import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  sortWorkspaceConversations,
  type WorkspaceParticipantRecord,
  type WorkspaceSyncCursorRecord,
  type WorkspaceSyncStateRecord,
} from '../../core/workspace/model'
import { db } from '../../offline/db'
import { useAuth } from '../auth/AuthProvider'

function formatDate(value: number | undefined): string {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}

export function OfflineWorkspacePage() {
  const { session } = useAuth()
  const localUserId = session?.user.id ?? ''
  const conversations = useLiveQuery(
    async () => localUserId
      ? sortWorkspaceConversations(
          await db.workspaceConversations.where('localUserId').equals(localUserId).toArray(),
        )
      : [],
    [localUserId],
    [],
  )
  const participants = useLiveQuery<
    WorkspaceParticipantRecord[],
    WorkspaceParticipantRecord[]
  >(
    async () => localUserId
      ? await db.workspaceParticipants.where('localUserId').equals(localUserId).toArray()
      : [],
    [localUserId],
    [],
  )
  const cursors = useLiveQuery<
    WorkspaceSyncCursorRecord[],
    WorkspaceSyncCursorRecord[]
  >(
    async () => localUserId
      ? await db.workspaceSyncCursors.where('localUserId').equals(localUserId).toArray()
      : [],
    [localUserId],
    [],
  )
  const syncState = useLiveQuery<
    WorkspaceSyncStateRecord | undefined,
    undefined
  >(
    async () => localUserId
      ? await db.workspaceSyncState.get(localUserId)
      : undefined,
    [localUserId],
    undefined,
  )
  const cachedMessages = useLiveQuery(
    () => localUserId
      ? db.cloudMessages.where('localUserId').equals(localUserId).count()
      : Promise.resolve(0),
    [localUserId],
    0,
  )
  const queuedMessages = useLiveQuery(
    () => localUserId
      ? db.deliveryQueue.where('localUserId').equals(localUserId).count()
      : Promise.resolve(0),
    [localUserId],
    0,
  )

  const participantCounts = useMemo(() => {
    const result = new Map<string, number>()
    for (const participant of participants) {
      result.set(
        participant.conversationId,
        (result.get(participant.conversationId) ?? 0) + 1,
      )
    }
    return result
  }, [participants])

  if (!session) {
    return (
      <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Sign in before inspecting the local workspace.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">Developer tools</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Offline conversation workspace</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          IndexedDB v6 keeps conversation metadata, participants, cached messages and sync cursors available after the browser loses Internet or the app is reopened offline.
        </p>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Conversations" value={conversations.length} />
        <Metric label="Participants" value={participants.length} />
        <Metric label="Cached messages" value={cachedMessages} />
        <Metric label="Queued messages" value={queuedMessages} />
        <Metric label="Sync cursors" value={cursors.length} />
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">Workspace sync state</h2>
            <p className="mt-1 text-sm text-slate-500">Remote membership remains authoritative whenever a complete sync succeeds.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${syncState?.status === 'error' ? 'bg-rose-50 text-rose-700' : syncState?.status === 'syncing' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
            {syncState?.status ?? 'never'}
          </span>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Last attempt</dt><dd className="mt-1 font-medium">{formatDate(syncState?.lastAttemptAt)}</dd></div>
          <div><dt className="text-slate-500">Last successful sync</dt><dd className="mt-1 font-medium">{formatDate(syncState?.lastSuccessfulSyncAt)}</dd></div>
        </dl>
        {syncState?.lastError ? <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">{syncState.lastError}</p> : null}
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-bold">Cached conversation registry</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {conversations.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No conversations have been synchronized to this device yet.</p>
          ) : conversations.map((conversation) => {
            const cursor = cursors.find((item) => item.conversationId === conversation.id)
            return (
              <article key={conversation.localKey} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold">{conversation.title ?? (conversation.kind === 'group' ? 'Untitled group' : 'Direct conversation')}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">{conversation.kind}</span>
                  </div>
                  <p className="mt-1 break-all text-xs text-slate-500">{conversation.id}</p>
                </div>
                <div className="text-xs leading-5 text-slate-500 md:text-right">
                  <p>{participantCounts.get(conversation.id) ?? 0} participants</p>
                  <p>Metadata sync: {formatDate(conversation.lastSyncedAt)}</p>
                  <p>Message cursor: {formatDate(cursor?.lastSyncedAt)}</p>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950">
        <strong>0.8.1 boundary:</strong> an existing synchronized conversation can reopen and queue messages offline. Creating a brand-new direct conversation/group or changing group membership still requires Internet because those operations require authoritative server-side identity and permission checks.
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  )
}
