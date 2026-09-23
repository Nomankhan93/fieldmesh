import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import {
  db,
  type CloudMessageRecord,
  type CloudReceiptRecord,
} from '../../offline/db'
import {
  InternetMessagingService,
  type ConversationParticipant,
  type InternetConversation,
} from './InternetMessagingService'

function formatTime(value: number | undefined) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function MessagingPage() {
  const { session } = useAuth()
  const [conversations, setConversations] = useState<InternetConversation[]>([])
  const [participants, setParticipants] = useState<Record<string, ConversationParticipant[]>>({})
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [recipientId, setRecipientId] = useState('')
  const [text, setText] = useState('')
  const [notice, setNotice] = useState('Durable internet messaging ready.')
  const [busy, setBusy] = useState(false)
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine)

  const service = useMemo(
    () => (supabase ? new InternetMessagingService(supabase) : null),
    [],
  )
  const localUserId = session?.user.id ?? ''

  const messages = useLiveQuery<CloudMessageRecord[], CloudMessageRecord[]>(
    async () => {
      if (!localUserId) return []
      return db.cloudMessages.where('localUserId').equals(localUserId).toArray()
    },
    [localUserId],
    [],
  )
  const receipts = useLiveQuery<CloudReceiptRecord[], CloudReceiptRecord[]>(
    async () => {
      if (!localUserId) return []
      return db.cloudReceipts.where('localUserId').equals(localUserId).toArray()
    },
    [localUserId],
    [],
  )
  const queuedCount = useLiveQuery(
    () =>
      localUserId
        ? db.cloudOutbox.where('localUserId').equals(localUserId).count()
        : Promise.resolve(0),
    [localUserId],
    0,
  )

  const refresh = useCallback(async () => {
    if (!service || !localUserId) return
    const nextConversations = await service.listConversations()
    setConversations(nextConversations)

    const nextParticipants: Record<string, ConversationParticipant[]> = {}
    for (const conversation of nextConversations) {
      nextParticipants[conversation.id] = await service.getParticipants(conversation.id)
    }
    setParticipants(nextParticipants)

    await service.syncAll(
      nextConversations.map((conversation) => conversation.id),
      localUserId,
    )

    setSelectedConversationId((current) => {
      if (current && nextConversations.some((conversation) => conversation.id === current)) return current
      return nextConversations[0]?.id ?? null
    })
  }, [localUserId, service])

  useEffect(() => {
    void refresh().catch((error) => {
      setNotice(error instanceof Error ? error.message : 'Unable to synchronize messages.')
    })
  }, [refresh])

  useEffect(() => {
    if (!service || !localUserId) return

    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined)
    }, 3_000)

    const handleOnline = () => {
      setBrowserOnline(true)
      void refresh().catch(() => undefined)
    }
    const handleOffline = () => setBrowserOnline(false)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh().catch(() => undefined)
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
    if (!service || !localUserId || !selectedConversationId) return
    void service.markConversationRead(selectedConversationId, localUserId).catch((error) => {
      setNotice(error instanceof Error ? error.message : 'Unable to mark messages as read.')
    })
  }, [localUserId, selectedConversationId, service])

  if (!session || !service) {
    return (
      <main className="mx-auto max-w-4xl p-4 sm:p-6">
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Sign in on the home page before opening durable internet messaging.
        </p>
      </main>
    )
  }

  // Capture the narrowed non-null instance so nested async handlers
  // do not widen it back to InternetMessagingService | null.
  const messagingService = service

  const selectedMessages = messages
    .filter((message) => message.conversationId === selectedConversationId)
    .sort((a, b) => a.createdAt - b.createdAt)

  function conversationLabel(conversation: InternetConversation | undefined) {
    if (!conversation) return 'Conversation'
    if (conversation.title) return conversation.title
    const others = (participants[conversation.id] ?? []).filter(
      (participant) => participant.user_id !== localUserId,
    )
    return others.map((participant) => participant.display_name).join(', ') || 'Direct conversation'
  }

  function unreadCount(conversationId: string) {
    return messages.filter((message) => {
      if (message.conversationId !== conversationId || message.senderId === localUserId) return false
      return !receipts.some(
        (receipt) =>
          receipt.messageId === message.id &&
          receipt.userId === localUserId &&
          receipt.receiptType === 'read',
      )
    }).length
  }

  function latestMessage(conversationId: string) {
    return messages
      .filter((message) => message.conversationId === conversationId)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
  }

  async function createDirectConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      const conversationId = await messagingService.createDirectConversation(recipientId)
      setRecipientId('')
      setSelectedConversationId(conversationId)
      await refresh()
      setNotice('Direct conversation ready.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to create conversation.')
    } finally {
      setBusy(false)
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedConversationId || !text.trim()) return

    setBusy(true)
    try {
      const result = await messagingService.sendText({
        localUserId,
        conversationId: selectedConversationId,
        text,
      })
      setText('')
      if (result.state === 'queued') {
        setNotice('Message saved locally and queued for retry.')
      } else {
        await messagingService.syncConversation(selectedConversationId, localUserId)
        setNotice('Message submitted to durable cloud mailbox.')
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to send message.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">FieldMesh 0.3</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Durable Internet Messaging</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Messages are written to local IndexedDB first, queued when submission fails, and synchronized through the authenticated cloud mailbox.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${browserOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {browserOnline ? 'Browser online' : 'Browser offline'}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold">Queued {queuedCount}</span>
          <Link to="/" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Identity</Link>
          <Link to="/simulator" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Radio simulator</Link>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">Start direct conversation</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Ask the other user to share their stable FieldMesh User ID.</p>
            <form className="mt-3 space-y-2" onSubmit={createDirectConversation}>
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                placeholder="Recipient FieldMesh User ID"
                value={recipientId}
                onChange={(event) => setRecipientId(event.target.value)}
                required
              />
              <button className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy}>
                Create / open conversation
              </button>
            </form>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Conversations</h2>
                <button type="button" className="text-xs font-semibold text-slate-600" onClick={() => void refresh()}>Sync now</button>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {conversations.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No conversations yet.</p>
              ) : (
                conversations.map((conversation) => {
                  const latest = latestMessage(conversation.id)
                  const unread = unreadCount(conversation.id)
                  const selected = conversation.id === selectedConversationId
                  return (
                    <button
                      type="button"
                      key={conversation.id}
                      onClick={() => setSelectedConversationId(conversation.id)}
                      className={`block w-full p-4 text-left ${selected ? 'bg-slate-100' : 'bg-white hover:bg-slate-50'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{conversationLabel(conversation)}</div>
                          <div className="mt-1 truncate text-xs text-slate-500">{latest?.body ?? 'No messages yet'}</div>
                        </div>
                        {unread > 0 && <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">{unread}</span>}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </section>
        </aside>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {selectedConversationId ? (
            <>
              <div className="border-b border-slate-200 p-4">
                <h2 className="font-semibold">{conversationLabel(conversations.find((item) => item.id === selectedConversationId))}</h2>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{selectedConversationId}</p>
              </div>

              <div className="min-h-96 space-y-3 bg-slate-50 p-4">
                {selectedMessages.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No messages in this conversation.</div>
                ) : (
                  selectedMessages.map((message) => {
                    const mine = message.senderId === localUserId
                    return (
                      <div key={message.localKey} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <article className={`max-w-[85%] rounded-2xl px-4 py-3 ${mine ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-900'}`}>
                          <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                          <div className={`mt-2 flex flex-wrap items-center gap-2 text-[11px] ${mine ? 'text-slate-300' : 'text-slate-500'}`}>
                            <span>{formatTime(message.serverCreatedAt ?? message.createdAt)}</span>
                            <span>•</span>
                            <span>{message.state}</span>
                          </div>
                        </article>
                      </div>
                    )
                  })
                )}
              </div>

              <form className="border-t border-slate-200 p-4" onSubmit={sendMessage}>
                <textarea
                  className="min-h-24 w-full resize-y rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-slate-600"
                  placeholder="Type an internet message…"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  maxLength={4000}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">{text.length}/4000 characters</span>
                  <button className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !text.trim()}>
                    {browserOnline ? 'Send message' : 'Queue message'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="p-10 text-center text-sm text-slate-500">Create or select a conversation to begin.</div>
          )}
        </section>
      </div>

      <p aria-live="polite" className="mt-4 rounded-2xl bg-slate-900 p-4 text-sm text-white">{notice}</p>
    </main>
  )
}
