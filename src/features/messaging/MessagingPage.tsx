import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { isValidContactInput, normalizeContactInput } from '../contacts/contactCode'
import {
  sortWorkspaceConversations,
  workspaceAvailability,
  type WorkspaceSyncStateRecord,
} from '../../core/workspace/model'
import { BACKGROUND_WORKSPACE_SYNC_INTERVAL_MS } from '../../core/workspace/syncPolicy'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { db, type CloudMessageRecord, type CloudReceiptRecord } from '../../offline/db'
import { GroupManagementPanel } from './GroupManagementPanel'
import { MobileSheet } from '../mobile/MobileSheet'
import { MessengerAvatar } from './MessengerAvatar'
import {
  conversationPreview,
  messageDayKey,
  messageDayLabel,
  messageStatusPresentation,
} from './messengerUi'
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
  const [mobileComposerOpen, setMobileComposerOpen] = useState(false)
  const [desktopComposerOpen, setDesktopComposerOpen] = useState(false)
  const [text, setText] = useState('')
  const [conversationSearch, setConversationSearch] = useState('')
  const [notice, setNotice] = useState('Chats ready.')
  const [busy, setBusy] = useState(false)
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine)
  const messageViewportRef = useRef<HTMLDivElement | null>(null)

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
    }, BACKGROUND_WORKSPACE_SYNC_INTERVAL_MS)
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

  useEffect(() => {
    if (!selectedConversationId) return
    const viewport = messageViewportRef.current
    if (!viewport) return
    window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight
    })
  }, [messages.length, selectedConversationId])

  if (!session || !service) {
    return <main className="mx-auto max-w-4xl p-4 sm:p-6"><p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Sign in on the home page before opening chats.</p></main>
  }

  const messagingService = service
  const selectedConversation = conversations.find((item) => item.id === selectedConversationId)
  const selectedParticipants = selectedConversationId ? (participants[selectedConversationId] ?? []) : []
  const selectedMessages = messages.filter((message) => message.conversationId === selectedConversationId).sort((a, b) => a.createdAt - b.createdAt)
  const filteredConversations = conversations.filter((conversation) => {
    const query = conversationSearch.trim().toLocaleLowerCase()
    if (!query) return true
    const latest = messages.filter((message) => message.conversationId === conversation.id).sort((a, b) => b.createdAt - a.createdAt)[0]
    return conversationLabel(conversation).toLocaleLowerCase().includes(query)
      || latest?.body.toLocaleLowerCase().includes(query)
  })

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
      setMobileComposerOpen(false)
      setDesktopComposerOpen(false)
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
      setMobileComposerOpen(false)
      setDesktopComposerOpen(false)
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
    <main className="mx-auto max-w-[1480px] px-0 pb-4 sm:p-5 lg:p-6 xl:p-8">
      <header className={`${selectedConversationId ? 'hidden lg:flex' : 'flex'} mb-3 items-center justify-between gap-4 px-4 pt-3 sm:px-0 sm:pt-0 lg:mb-4`}>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">ConnectX</p>
          <h1 className="mt-0.5 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Chats</h1>
          <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-slate-500 sm:block">Familiar messaging, backed by the same offline workspace and durable delivery queue.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {queuedCount > 0 ? <span className="rounded-full bg-amber-100 px-2.5 py-1.5 text-[11px] font-bold text-amber-900">{queuedCount} queued</span> : null}
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold ${browserOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
            <span className={`h-2 w-2 rounded-full ${browserOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {browserOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </header>

      <div className="overflow-hidden bg-white sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-xl sm:shadow-slate-200/40 lg:grid lg:h-[calc(100dvh-8.5rem)] lg:min-h-[620px] lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className={`${selectedConversationId ? 'hidden lg:flex' : 'flex'} min-h-[calc(100dvh-9rem)] flex-col border-r-0 border-slate-200 bg-white lg:min-h-0 lg:border-r`}>
          <div className="border-b border-slate-100 px-4 pb-3 pt-3 sm:px-4 lg:pt-4">
            <div className="flex items-center gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search conversations</span>
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400" aria-hidden="true">⌕</span>
                <input
                  value={conversationSearch}
                  onChange={(event) => setConversationSearch(event.target.value)}
                  placeholder="Search chats"
                  className="connectx-input h-11 w-full rounded-full border border-slate-200 bg-slate-100/80 pl-9 pr-4 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                />
              </label>
              <button
                type="button"
                onClick={() => setMobileComposerOpen(true)}
                className="connectx-touch flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 via-blue-600 to-violet-700 text-xl font-light text-white shadow-md shadow-blue-200 lg:hidden"
                aria-label="New conversation"
                title="New conversation"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setDesktopComposerOpen((current) => !current)}
                className={`connectx-touch hidden h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-light shadow-sm lg:flex ${desktopComposerOpen ? 'bg-slate-900 text-white' : 'bg-gradient-to-br from-cyan-500 via-blue-600 to-violet-700 text-white'}`}
                aria-label="New conversation"
                title="New conversation"
              >
                {desktopComposerOpen ? '×' : '+'}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[11px] text-slate-400">
              <span>{workspaceMode === 'offline-cached' ? 'Offline workspace · cached chats' : `${filteredConversations.length} conversation${filteredConversations.length === 1 ? '' : 's'}`}</span>
              <button type="button" disabled={!browserOnline || workspaceSyncState?.status === 'syncing'} className="font-bold text-blue-600 disabled:text-slate-300" onClick={() => void refresh().catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to synchronize workspace.'))}>{workspaceSyncState?.status === 'syncing' ? 'Syncing…' : 'Sync'}</button>
            </div>
          </div>

          {desktopComposerOpen ? (
            <section className="hidden border-b border-slate-200 bg-slate-50/80 p-4 lg:block">
              <div className="grid grid-cols-2 rounded-xl bg-slate-200/70 p-1 text-xs font-bold">
                <button type="button" onClick={() => setComposerMode('direct')} className={`rounded-lg px-3 py-2 ${composerMode === 'direct' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>New chat</button>
                <button type="button" onClick={() => setComposerMode('group')} className={`rounded-lg px-3 py-2 ${composerMode === 'group' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>New group</button>
              </div>
              {composerMode === 'direct' ? (
                <form className="mt-3 space-y-2" onSubmit={createDirectConversation}>
                  <input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm uppercase placeholder:normal-case outline-none focus:border-blue-400" placeholder="FM-12AB34CD56EF" value={recipientId} onChange={(event) => setRecipientId(event.target.value)} onBlur={() => setRecipientId((current) => normalizeContactInput(current))} autoCapitalize="characters" required />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => void pasteContact()} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Paste</button>
                    <button type="button" onClick={() => setShowQrFoundation((current) => !current)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Scan QR</button>
                  </div>
                  {showQrFoundation ? <p className="rounded-xl bg-white p-2.5 text-[11px] leading-5 text-slate-500">Camera scanning is not connected yet. Shared links and FM compatibility codes are supported.</p> : null}
                  <button className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40" disabled={busy || !browserOnline}>Start chat</button>
                </form>
              ) : (
                <form className="mt-3 space-y-2" onSubmit={createGroup}>
                  <input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400" placeholder="Group name" value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} maxLength={120} required />
                  <textarea className="min-h-20 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm uppercase placeholder:normal-case outline-none focus:border-blue-400" placeholder={'Member codes, one per line\nFM-12AB34CD56EF'} value={groupMembers} onChange={(event) => setGroupMembers(event.target.value)} />
                  <button className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40" disabled={busy || !browserOnline || !groupTitle.trim()}>Create group</button>
                </form>
              )}
            </section>
          ) : null}

          <div className="connectx-chat-scroll flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-100 to-violet-100 text-2xl text-blue-700" aria-hidden="true">✦</div>
                <p className="mt-4 text-sm font-bold text-slate-800">{conversationSearch.trim() ? 'No matching chats' : workspaceMode === 'offline-empty' ? 'No cached conversations' : 'No conversations yet'}</p>
                <p className="mx-auto mt-1 max-w-[260px] text-xs leading-5 text-slate-500">{conversationSearch.trim() ? 'Try another name or message.' : workspaceMode === 'offline-empty' ? 'Connect once to synchronize this device, then your chats can reopen offline.' : 'Start a direct chat or create a private group.'}</p>
                {!conversationSearch.trim() ? <button type="button" onClick={() => setMobileComposerOpen(true)} className="connectx-touch mt-4 rounded-full bg-slate-950 px-5 text-sm font-bold text-white">Start a chat</button> : null}
              </div>
            ) : filteredConversations.map((conversation) => {
              const label = conversationLabel(conversation)
              const latest = latestMessage(conversation.id)
              const unread = unreadCount(conversation.id)
              const selected = conversation.id === selectedConversationId
              const mine = latest?.senderId === localUserId
              return (
                <button
                  type="button"
                  key={conversation.id}
                  onClick={() => setSelectedConversationId(conversation.id)}
                  className={`group flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition ${selected ? 'bg-blue-50/80' : 'bg-white hover:bg-slate-50'}`}
                >
                  <MessengerAvatar label={label} group={conversation.kind === 'group'} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={`truncate text-[15px] ${unread > 0 ? 'font-extrabold text-slate-950' : 'font-semibold text-slate-800'}`}>{label}</span>
                      <span className={`shrink-0 text-[11px] ${unread > 0 ? 'font-bold text-blue-600' : 'text-slate-400'}`}>{latest ? formatTime(latest.serverCreatedAt ?? latest.createdAt) : ''}</span>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className={`min-w-0 flex-1 truncate text-xs ${unread > 0 ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>{conversationPreview(latest?.body, Boolean(mine))}</span>
                      {unread > 0 ? <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-1.5 text-[10px] font-black text-white">{unread > 99 ? '99+' : unread}</span> : conversation.kind === 'group' ? <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-300">Group</span> : null}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="hidden border-t border-slate-100 bg-white p-3 text-[11px] text-slate-400 lg:flex lg:items-center lg:justify-between">
            <span>{workspaceSyncState?.lastSuccessfulSyncAt ? `Synced ${formatTime(workspaceSyncState.lastSuccessfulSyncAt)}` : 'Not synced yet'}</span>
            <span>{browserOnline ? 'Cloud available' : 'Offline queue active'}</span>
          </div>
        </aside>

        <section className={`${selectedConversationId ? 'flex' : 'hidden lg:flex'} min-h-[calc(100dvh-8rem)] flex-col bg-white lg:min-h-0`}>
          {selectedConversationId && selectedConversation ? (
            <>
              <div className="z-20 flex min-h-[4.25rem] items-center justify-between gap-3 border-b border-slate-200 bg-white/96 px-3 py-2.5 backdrop-blur sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button type="button" onClick={() => setSelectedConversationId(null)} className="connectx-touch flex h-10 w-9 items-center justify-center rounded-full text-xl text-slate-700 hover:bg-slate-100 lg:hidden" aria-label="Back to chats">‹</button>
                  <MessengerAvatar label={conversationLabel(selectedConversation)} group={selectedConversation.kind === 'group'} />
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-extrabold text-slate-950 sm:text-base">{conversationLabel(selectedConversation)}</h2>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{selectedConversation.kind === 'group' ? `${selectedParticipants.length} members · private group` : browserOnline ? 'ConnectX direct chat' : 'Offline · messages will queue'}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {selectedConversation.kind === 'group' ? <button type="button" onClick={() => setShowGroupManager((current) => !current)} className={`connectx-touch flex h-10 items-center rounded-full px-3 text-xs font-bold ${showGroupManager ? 'bg-blue-100 text-blue-800' : 'text-slate-600 hover:bg-slate-100'}`}>{showGroupManager ? 'Done' : 'Group info'}</button> : null}
                  <span className={`ml-1 h-2.5 w-2.5 rounded-full ${browserOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} title={browserOnline ? 'Internet available' : 'Offline'} />
                </div>
              </div>

              {selectedConversation.kind === 'group' && showGroupManager ? (
                <GroupManagementPanel conversation={selectedConversation} participants={selectedParticipants} localUserId={localUserId} service={messagingService} online={browserOnline} onChanged={refresh} onLeft={() => setSelectedConversationId(null)} setNotice={setNotice} />
              ) : null}

              <div ref={messageViewportRef} className="connectx-chat-scroll connectx-chat-wallpaper flex-1 overflow-y-auto px-3 py-4 sm:px-5 lg:min-h-0">
                {selectedMessages.length === 0 ? (
                  <div className="mx-auto mt-16 max-w-sm rounded-3xl border border-white/80 bg-white/80 p-7 text-center shadow-sm backdrop-blur"><MessengerAvatar label={conversationLabel(selectedConversation)} group={selectedConversation.kind === 'group'} size="lg" /><p className="mt-4 font-bold text-slate-800">Start the conversation</p><p className="mt-1 text-sm leading-6 text-slate-500">Messages are stored locally first and delivered whenever a supported path is available.</p></div>
                ) : selectedMessages.map((message, index) => {
                  const mine = message.senderId === localUserId
                  const sender = selectedParticipants.find((participant) => participant.user_id === message.senderId)
                  const previous = selectedMessages[index - 1]
                  const timestamp = message.serverCreatedAt ?? message.createdAt
                  const showDay = !previous || messageDayKey(previous.serverCreatedAt ?? previous.createdAt) !== messageDayKey(timestamp)
                  const stateForUi = selectedConversation.kind === 'group' && mine && message.state !== 'queued' && message.state !== 'failed' && message.state !== 'expired' ? 'submitted' : message.state
                  const status = messageStatusPresentation(stateForUi)
                  return (
                    <div key={message.localKey}>
                      {showDay ? <div className="my-4 flex justify-center"><span className="rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur">{messageDayLabel(timestamp)}</span></div> : null}
                      <div className={`mb-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <article className={`max-w-[86%] px-3.5 py-2 sm:max-w-[72%] ${mine ? 'connectx-message-out rounded-2xl bg-gradient-to-br from-[#dff5ff] via-[#e9efff] to-[#eee7ff] text-slate-950' : 'connectx-message-in rounded-2xl border border-white bg-white text-slate-900'}`}>
                          {selectedConversation.kind === 'group' && !mine ? <p className="mb-1 text-[11px] font-extrabold text-blue-700">{sender?.display_name ?? 'Group member'}</p> : null}
                          <p className="whitespace-pre-wrap break-words text-[14px] leading-5 sm:text-[15px]">{message.body}</p>
                          <div className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${mine ? 'text-slate-500' : 'text-slate-400'}`}>
                            <span>{formatTime(timestamp)}</span>
                            {mine ? <span className={`font-black tracking-[-0.12em] ${status.tone === 'read' ? 'text-cyan-600' : status.tone === 'danger' ? 'text-rose-600' : 'text-slate-500'}`} title={status.label} aria-label={status.label}>{status.glyph}</span> : null}
                          </div>
                        </article>
                      </div>
                    </div>
                  )
                })}
              </div>

              <form className="sticky bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-30 border-t border-slate-200/80 bg-[#f8faff]/96 px-2.5 py-2.5 backdrop-blur-xl sm:px-4 sm:py-3 lg:static" onSubmit={sendMessage}>
                <div className="mx-auto flex max-w-4xl items-end gap-2">
                  <div className="flex min-h-12 min-w-0 flex-1 items-end rounded-[1.6rem] border border-slate-200 bg-white px-4 shadow-sm focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-50">
                    <textarea rows={1} className="connectx-input max-h-32 min-h-12 min-w-0 flex-1 resize-none border-0 bg-transparent py-3 text-base leading-6 text-slate-900 outline-none placeholder:text-slate-400" placeholder={browserOnline ? 'Message' : 'Message will queue'} value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} />
                  </div>
                  <button className="connectx-touch flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 via-blue-600 to-violet-700 text-white shadow-lg shadow-blue-200 transition active:scale-95 disabled:opacity-40 disabled:shadow-none" disabled={busy || !text.trim()} aria-label={browserOnline ? 'Send message' : 'Queue message'} title={browserOnline ? 'Send' : 'Queue'}><span aria-hidden="true" className="translate-x-[-1px] text-lg">➤</span></button>
                </div>
                {!browserOnline ? <p className="mt-1.5 text-center text-[10px] font-semibold text-amber-700">Offline — your message will stay safely queued on this device.</p> : null}
              </form>
            </>
          ) : (
            <div className="connectx-chat-wallpaper flex flex-1 items-center justify-center p-10 text-center"><div className="max-w-sm rounded-3xl border border-white/80 bg-white/80 p-8 shadow-sm backdrop-blur"><img src="/icons/connectx-192.png" alt="" className="mx-auto h-16 w-16 rounded-2xl shadow-sm" /><h2 className="mt-4 text-lg font-black text-slate-900">ConnectX for resilient messaging</h2><p className="mt-2 text-sm leading-6 text-slate-500">Choose a conversation or start a new chat. Messages remain local-first and can queue when connectivity disappears.</p></div></div>
          )}
        </section>
      </div>

      {!selectedConversationId ? (
        <button type="button" onClick={() => setMobileComposerOpen(true)} className="fixed bottom-[calc(5.4rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 via-blue-600 to-violet-700 text-2xl font-light text-white shadow-xl shadow-blue-300/40 lg:hidden" aria-label="New conversation">+</button>
      ) : null}

      <MobileSheet
        open={mobileComposerOpen}
        title={composerMode === 'direct' ? 'New conversation' : 'New group'}
        description={browserOnline ? 'Start a new ConnectX conversation.' : 'Creating new conversations requires Internet once.'}
        onClose={() => setMobileComposerOpen(false)}
      >
        <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-xs font-bold">
          <button type="button" onClick={() => setComposerMode('direct')} className={`connectx-touch rounded-lg px-3 py-2 ${composerMode === 'direct' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>New chat</button>
          <button type="button" onClick={() => setComposerMode('group')} className={`connectx-touch rounded-lg px-3 py-2 ${composerMode === 'group' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>New group</button>
        </div>
        {composerMode === 'direct' ? (
          <form className="mt-4 space-y-3" onSubmit={createDirectConversation}>
            <p className="text-xs leading-5 text-slate-500">Enter a shared ConnectX code. Existing cached chats remain available when offline.</p>
            <input className="connectx-input w-full rounded-xl border border-slate-300 px-3 py-3 text-base uppercase placeholder:normal-case" placeholder="FM-12AB34CD56EF" value={recipientId} onChange={(event) => setRecipientId(event.target.value)} onBlur={() => setRecipientId((current) => normalizeContactInput(current))} autoCapitalize="characters" required />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void pasteContact()} className="connectx-touch rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700">Paste</button>
              <button type="button" onClick={() => setShowQrFoundation((current) => !current)} className="connectx-touch rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700">Scan QR</button>
            </div>
            {showQrFoundation ? <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">Camera scanning is not connected yet. Shared contact links and FM compatibility codes are already supported.</p> : null}
            <button className="connectx-touch w-full rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-700 px-4 text-sm font-bold text-white disabled:opacity-40" disabled={busy || !browserOnline}>Start chat</button>
          </form>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={createGroup}>
            <input className="connectx-input w-full rounded-xl border border-slate-300 px-3 py-3 text-base" placeholder="Group name" value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} maxLength={120} required />
            <textarea className="connectx-input min-h-28 w-full rounded-xl border border-slate-300 p-3 text-base uppercase placeholder:normal-case" placeholder={'Member codes, one per line\nFM-12AB34CD56EF'} value={groupMembers} onChange={(event) => setGroupMembers(event.target.value)} />
            <button className="connectx-touch w-full rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-700 px-4 text-sm font-bold text-white disabled:opacity-40" disabled={busy || !browserOnline || !groupTitle.trim()}>Create group</button>
          </form>
        )}
      </MobileSheet>

      <p aria-live="polite" className={`${selectedConversationId ? 'hidden lg:block' : 'block'} mx-4 mt-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500 shadow-sm sm:mx-0`}>{notice}</p>
    </main>
  )
}
