import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { isValidContactInput, normalizeContactInput } from '../contacts/contactCode'
import {
  sortWorkspaceConversations,
  workspaceAvailability,
  type WorkspaceSyncStateRecord,
} from '../../core/workspace/model'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { db, type CloudMessageRecord, type CloudReceiptRecord } from '../../offline/db'
import { GroupManagementPanel } from './GroupManagementPanel'
import {
  InternetMessagingService,
  type ConversationParticipant,
  type InternetConversation,
} from './InternetMessagingService'

function formatTime(value: number | undefined) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function parseMemberContacts(value: string): string[] {
  return value
    .split(/[\n,]+/u)
    .map((item) => normalizeContactInput(item))
    .filter(Boolean)
}

export function MessagingPage() {
  const { session } = useAuth()
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [composerMode, setComposerMode] = useState<'direct' | 'group'>('direct')
  const [recipientId, setRecipientId] = useState('')
  const [groupTitle, setGroupTitle] = useState('')
  const [groupMembers, setGroupMembers] = useState('')
  const [showQrFoundation, setShowQrFoundation] = useState(false)
  const [showGroupManager, setShowGroupManager] = useState(false)
  const [text, setText] = useState('')
  const [notice, setNotice] = useState('Chats ready.')
  const [busy, setBusy] = useState(false)
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine)

  const service = useMemo(() => (supabase ? new InternetMessagingService(supabase) : null), [])
  const localUserId = session?.user.id ?? ''

  const cachedConversations = useLiveQuery(
    async () => localUserId
      ? sortWorkspaceConversations(
          await db.workspaceConversations.where('localUserId').equals(localUserId).toArray(),
        )
      : [],
    [localUserId],
    [],
  )
  const cachedParticipants = useLiveQuery(
    async () => localUserId
      ? db.workspaceParticipants.where('localUserId').equals(localUserId).toArray()
      : [],
    [localUserId],
    [],
  )
  const workspaceSyncState = useLiveQuery<
    WorkspaceSyncStateRecord | undefined,
    undefined
  >(
    async () => localUserId
      ? await db.workspaceSyncState.get(localUserId)
      : undefined,
    [localUserId],
    undefined,
  )
  const conversations = useMemo<InternetConversation[]>(
    () => cachedConversations.map((conversation) => ({
      id: conversation.id,
      kind: conversation.kind,
      title: conversation.title,
      created_by: conversation.created_by,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
    })),
    [cachedConversations],
  )
  const participants = useMemo<Record<string, ConversationParticipant[]>>(() => {
    const next: Record<string, ConversationParticipant[]> = {}
    for (const participant of cachedParticipants) {
      const list = next[participant.conversationId] ?? []
      list.push({
        user_id: participant.user_id,
        fieldmesh_user_id: participant.fieldmesh_user_id,
        display_name: participant.display_name,
        role: participant.role,
        ...(participant.joined_at ? { joined_at: participant.joined_at } : {}),
      })
      next[participant.conversationId] = list
    }
    return next
  }, [cachedParticipants])

  const messages = useLiveQuery<CloudMessageRecord[], CloudMessageRecord[]>(
    async () => localUserId ? db.cloudMessages.where('localUserId').equals(localUserId).toArray() : [],
    [localUserId],
    [],
  )
  const receipts = useLiveQuery<CloudReceiptRecord[], CloudReceiptRecord[]>(
    async () => localUserId ? db.cloudReceipts.where('localUserId').equals(localUserId).toArray() : [],
    [localUserId],
    [],
  )
  const queuedCount = useLiveQuery(
    () => localUserId ? db.deliveryQueue.where('localUserId').equals(localUserId).count() : Promise.resolve(0),
    [localUserId],
    0,
  )

  const refresh = useCallback(async () => {
    if (!service || !localUserId) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setBrowserOnline(false)
      return
    }
    const nextConversations = await service.syncWorkspace(localUserId)
    await service.syncAll(nextConversations.map((conversation) => conversation.id), localUserId)
  }, [localUserId, service])


  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setBrowserOnline(false)
      setNotice('Offline workspace active. Cached conversations remain available and new messages will queue locally.')
      return
    }
    void refresh().catch((error) =>
      setNotice(error instanceof Error ? error.message : 'Unable to synchronize messages.'),
    )
  }, [refresh])

  useEffect(() => {
    if (!service || !localUserId) return
    const timer = window.setInterval(() => {
      if (navigator.onLine) void refresh().catch(() => undefined)
    }, 3_000)
    const handleOnline = () => {
      setBrowserOnline(true)
      setNotice('Connection restored. Synchronizing the offline workspace…')
      void refresh()
        .then(() => setNotice('Workspace synchronized.'))
        .catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to synchronize messages.'))
    }
    const handleOffline = () => {
      setBrowserOnline(false)
      setNotice('Offline workspace active. Cached conversations remain available and new messages will queue locally.')
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void refresh().catch(() => undefined)
      }
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [localUserId, refresh, service])

  useEffect(() => {
    setSelectedConversationId((current) =>
      current && !conversations.some((conversation) => conversation.id === current) ? null : current,
    )
  }, [conversations])

  useEffect(() => {
    setShowGroupManager(false)
    if (!browserOnline || !service || !localUserId || !selectedConversationId) return
    void service.markConversationRead(selectedConversationId, localUserId).catch((error) => {
      setNotice(error instanceof Error ? error.message : 'Unable to mark messages as read.')
    })
  }, [browserOnline, localUserId, selectedConversationId, service])

  if (!session || !service) {
    return <main className="mx-auto max-w-4xl p-4 sm:p-6"><p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Sign in on the home page before opening chats.</p></main>
  }

  const messagingService = service
  const selectedConversation = conversations.find((item) => item.id === selectedConversationId)
  const selectedParticipants = selectedConversationId ? (participants[selectedConversationId] ?? []) : []
  const selectedMessages = messages.filter((message) => message.conversationId === selectedConversationId).sort((a, b) => a.createdAt - b.createdAt)

  const workspaceMode = workspaceAvailability({
    browserOnline,
    cachedConversationCount: conversations.length,
    ...(workspaceSyncState?.lastSuccessfulSyncAt
      ? { lastSuccessfulSyncAt: workspaceSyncState.lastSuccessfulSyncAt }
      : {}),
  })

  function conversationLabel(conversation: InternetConversation | undefined) {
    if (!conversation) return 'Conversation'
    if (conversation.title) return conversation.title
    const others = (participants[conversation.id] ?? []).filter((participant) => participant.user_id !== localUserId)
    return others.map((participant) => participant.display_name).join(', ') || 'Direct conversation'
  }

  function unreadCount(conversationId: string) {
    return messages.filter((message) => {
      if (message.conversationId !== conversationId || message.senderId === localUserId) return false
      return !receipts.some((receipt) => receipt.messageId === message.id && receipt.userId === localUserId && receipt.receiptType === 'read')
    }).length
  }

  function latestMessage(conversationId: string) {
    return messages.filter((message) => message.conversationId === conversationId).sort((a, b) => b.createdAt - a.createdAt)[0]
  }

  async function pasteContact() {
    try {
      setRecipientId(normalizeContactInput(await navigator.clipboard.readText()))
      setNotice('Contact pasted. Review the code, then start the chat.')
    } catch {
      setNotice('Clipboard read access is unavailable. Paste the ConnectX code manually.')
    }
  }

  async function createDirectConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!browserOnline) {
      setNotice('Starting a new conversation requires Internet once. Existing cached chats remain available offline.')
      return
    }
    const contact = normalizeContactInput(recipientId)
    if (!isValidContactInput(contact)) {
      setNotice('Enter a valid ConnectX code such as FM-12AB34CD56EF, a shared contact link, or a technical identity ID.')
      return
    }
    setBusy(true)
    try {
      const conversationId = await messagingService.createDirectConversation(contact)
      setRecipientId('')
      await refresh()
      setSelectedConversationId(conversationId)
      setNotice('Chat ready.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to create conversation.')
    } finally {
      setBusy(false)
    }
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!browserOnline) {
      setNotice('Creating a group requires Internet. Existing groups remain readable and messages can queue offline.')
      return
    }
    const contacts = parseMemberContacts(groupMembers)
    if (!groupTitle.trim()) {
      setNotice('Enter a group name.')
      return
    }
    const invalid = contacts.find((contact) => !isValidContactInput(contact))
    if (invalid) {
      setNotice(`Invalid ConnectX contact: ${invalid}`)
      return
    }
    setBusy(true)
    try {
      const conversationId = await messagingService.createGroup(groupTitle, contacts)
      setGroupTitle('')
      setGroupMembers('')
      await refresh()
      setSelectedConversationId(conversationId)
      setNotice('Group created.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to create group.')
    } finally {
      setBusy(false)
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedConversationId || !text.trim()) return
    setBusy(true)
    try {
      const result = await messagingService.sendText({ localUserId, conversationId: selectedConversationId, text })
      setText('')
      if (result.state === 'queued') setNotice('Message saved on this device and queued for retry.')
      else {
        await messagingService.syncConversation(selectedConversationId, localUserId)
        setNotice('Message sent.')
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to send message.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Chats</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Messages</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Conversation lists, participants and cached messages now reopen from this device even without Internet. New messages still enter the same canonical delivery queue before transport.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${browserOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{browserOnline ? 'Online' : 'Offline'}</span>
          {workspaceMode === 'offline-cached' ? <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">Cached workspace</span> : null}
          {queuedCount > 0 ? <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">{queuedCount} queued</span> : null}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className={`space-y-4 ${selectedConversationId ? 'hidden lg:block' : 'block'}`}>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-xs font-bold">
              <button type="button" onClick={() => setComposerMode('direct')} className={`rounded-lg px-3 py-2 ${composerMode === 'direct' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>New chat</button>
              <button type="button" onClick={() => setComposerMode('group')} className={`rounded-lg px-3 py-2 ${composerMode === 'group' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>New group</button>
            </div>

            {composerMode === 'direct' ? (
              <form className="mt-4 space-y-2" onSubmit={createDirectConversation}>
                <p className="text-xs leading-5 text-slate-500">Ask the other person for their ConnectX code from Profile → Share contact.</p>
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm uppercase placeholder:normal-case" placeholder="FM-12AB34CD56EF" value={recipientId} onChange={(event) => setRecipientId(event.target.value)} onBlur={() => setRecipientId((current) => normalizeContactInput(current))} autoCapitalize="characters" required />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => void pasteContact()} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Paste</button>
                  <button type="button" onClick={() => setShowQrFoundation((current) => !current)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Scan QR</button>
                </div>
                <button className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !browserOnline}>Start chat</button>
              </form>
            ) : (
              <form className="mt-4 space-y-2" onSubmit={createGroup}>
                <p className="text-xs leading-5 text-slate-500">Create a private group and invite people with ConnectX codes. You become the owner.</p>
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="Group name" value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} maxLength={120} required />
                <textarea className="min-h-24 w-full rounded-xl border border-slate-300 p-3 text-sm uppercase placeholder:normal-case" placeholder={'Member codes, one per line\nFM-12AB34CD56EF'} value={groupMembers} onChange={(event) => setGroupMembers(event.target.value)} />
                <button className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !browserOnline || !groupTitle.trim()}>Create group</button>
              </form>
            )}

            {showQrFoundation && composerMode === 'direct' ? (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                <p className="font-bold text-slate-800">QR contact discovery foundation</p>
                <p className="mt-1">ConnectX accepts shared contact links and FM compatibility codes. Camera scanning will be connected in the mobile/hardware phase.</p>
              </div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Conversations</h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">{workspaceSyncState?.lastSuccessfulSyncAt ? `Last synced ${formatTime(workspaceSyncState.lastSuccessfulSyncAt)}` : 'Not synchronized on this device yet'}</p>
                </div>
                <button type="button" disabled={!browserOnline || workspaceSyncState?.status === 'syncing'} className="text-xs font-semibold text-slate-600 disabled:text-slate-300" onClick={() => void refresh().catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to synchronize workspace.'))}>{workspaceSyncState?.status === 'syncing' ? 'Syncing…' : 'Sync'}</button>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {conversations.length === 0 ? (
                <div className="p-5 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg" aria-hidden="true">✦</div><p className="mt-3 text-sm font-semibold text-slate-700">{workspaceMode === 'offline-empty' ? 'No cached conversations' : 'No conversations yet'}</p><p className="mt-1 text-xs leading-5 text-slate-500">{workspaceMode === 'offline-empty' ? 'Connect once to synchronize this device, then your conversation list and cached messages can reopen offline.' : 'Start a direct chat or create your first group.'}</p></div>
              ) : conversations.map((conversation) => {
                const latest = latestMessage(conversation.id)
                const unread = unreadCount(conversation.id)
                const selected = conversation.id === selectedConversationId
                return (
                  <button type="button" key={conversation.id} onClick={() => setSelectedConversationId(conversation.id)} className={`block w-full p-4 text-left ${selected ? 'bg-slate-100' : 'bg-white hover:bg-slate-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><div className="truncate text-sm font-semibold">{conversationLabel(conversation)}</div>{conversation.kind === 'group' ? <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">GROUP</span> : null}</div><div className="mt-1 truncate text-xs text-slate-500">{latest?.body ?? 'No messages yet'}</div></div>
                      {unread > 0 ? <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[11px] font-bold text-white">{unread}</span> : null}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        </aside>

        <section className={`${selectedConversationId ? 'block' : 'hidden lg:block'} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm`}>
          {selectedConversationId && selectedConversation ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <button type="button" onClick={() => setSelectedConversationId(null)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 lg:hidden">Back</button>
                  <div className="min-w-0"><h2 className="truncate font-semibold">{conversationLabel(selectedConversation)}</h2><p className="mt-0.5 text-xs text-slate-500">{selectedConversation.kind === 'group' ? `${selectedParticipants.length} members · private group` : 'Direct ConnectX chat'}</p></div>
                </div>
                {selectedConversation.kind === 'group' ? <button type="button" onClick={() => setShowGroupManager((current) => !current)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700">{showGroupManager ? 'Close group settings' : 'Group settings'}</button> : null}
              </div>

              {selectedConversation.kind === 'group' && showGroupManager ? (
                <GroupManagementPanel conversation={selectedConversation} participants={selectedParticipants} localUserId={localUserId} service={messagingService} online={browserOnline} onChanged={refresh} onLeft={() => setSelectedConversationId(null)} setNotice={setNotice} />
              ) : null}

              <div className="min-h-[420px] space-y-3 bg-slate-50 p-4">
                {selectedMessages.length === 0 ? (
                  <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><p className="font-semibold text-slate-700">Start the conversation</p><p className="mt-1 text-sm leading-6 text-slate-500">Messages are stored locally first and synchronized when a supported path is available.</p></div>
                ) : selectedMessages.map((message) => {
                  const mine = message.senderId === localUserId
                  const sender = selectedParticipants.find((participant) => participant.user_id === message.senderId)
                  const visibleState = selectedConversation.kind === 'group' && mine
                    ? (message.state === 'queued' ? 'queued' : 'sent')
                    : message.state
                  return (
                    <div key={message.localKey} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <article className={`max-w-[85%] rounded-2xl px-4 py-3 ${mine ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-900'}`}>
                        {selectedConversation.kind === 'group' && !mine ? <p className="mb-1 text-[11px] font-bold text-blue-700">{sender?.display_name ?? 'Group member'}</p> : null}
                        <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                        <div className={`mt-2 flex flex-wrap items-center gap-2 text-[11px] ${mine ? 'text-slate-300' : 'text-slate-500'}`}><span>{formatTime(message.serverCreatedAt ?? message.createdAt)}</span><span>•</span><span>{visibleState}</span></div>
                      </article>
                    </div>
                  )
                })}
              </div>

              <form className="border-t border-slate-200 p-4" onSubmit={sendMessage}>
                <textarea className="min-h-20 w-full resize-y rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-slate-600" placeholder="Message…" value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">{browserOnline ? 'Ready to send' : 'Will queue until a path returns'}</span><button className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !text.trim()}>{browserOnline ? 'Send' : 'Queue'}</button></div>
              </form>
            </>
          ) : (
            <div className="flex min-h-[560px] items-center justify-center p-10 text-center"><div className="max-w-sm"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl" aria-hidden="true">✦</div><h2 className="mt-4 text-lg font-bold text-slate-800">Choose a conversation</h2><p className="mt-2 text-sm leading-6 text-slate-500">Select a chat from the left, start a direct chat, or create a private group.</p></div></div>
          )}
        </section>
      </div>

      <p aria-live="polite" className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{notice}</p>
    </main>
  )
}
