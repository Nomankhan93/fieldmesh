import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { APP_BRAND } from '../../config/brand'
import { BACKGROUND_WORKSPACE_SYNC_INTERVAL_MS } from '../../core/workspace/syncPolicy'
import { db, type CloudMessageRecord } from '../../offline/db'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { getInternetMessagingService } from '../messaging/runtime'
import { notificationPreview, shouldSurfaceIncoming, type IncomingNotificationDetail } from './model'

const PENDING_CONVERSATION_KEY = 'connectx:pending-conversation'

export function queuePendingConversationId(conversationId: string): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(PENDING_CONVERSATION_KEY, conversationId)
}

export function consumePendingConversationId(): string | null {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return null
  const stored = sessionStorage.getItem(PENDING_CONVERSATION_KEY)
  if (stored) {
    sessionStorage.removeItem(PENDING_CONVERSATION_KEY)
    return stored
  }
  const url = new URL(window.location.href)
  const fromNotification = url.searchParams.get('conversation')
  if (fromNotification) {
    url.searchParams.delete('conversation')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }
  return fromNotification
}

async function describeIncoming(localUserId: string, message: CloudMessageRecord): Promise<IncomingNotificationDetail | null> {
  const preference = await db.workspaceConversationPreferences.get(`${localUserId}:${message.conversationId}`)
  if (!shouldSurfaceIncoming({ senderId: message.senderId, localUserId, muted: preference?.muted ?? false })) return null

  const conversation = await db.workspaceConversations.get(`${localUserId}:${message.conversationId}`)
  const participants = await db.workspaceParticipants
    .where('[localUserId+conversationId]')
    .equals([localUserId, message.conversationId])
    .toArray()
  const sender = participants.find((participant) => participant.user_id === message.senderId)
  const title = conversation?.kind === 'group'
    ? `${conversation.title || 'ConnectX group'} · ${sender?.display_name || 'New message'}`
    : sender?.display_name || 'New ConnectX message'

  return {
    conversationId: message.conversationId,
    messageId: message.id,
    title,
    body: notificationPreview(message.body),
  }
}

async function showSystemNotification(detail: IncomingNotificationDetail) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification(detail.title, {
      body: detail.body,
      icon: APP_BRAND.icon,
      badge: '/icons/connectx-favicon-64.png',
      tag: `connectx:${detail.conversationId}`,
      data: { conversationId: detail.conversationId, url: '/messages' },
    })
  } catch {
    // Notifications are best-effort; incoming messages remain in the durable workspace.
  }
}

export function IncomingSyncAgent() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [toast, setToast] = useState<IncomingNotificationDetail | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const service = getInternetMessagingService()
  const localUserId = session?.user.id ?? ''

  const surfaceIncoming = useCallback(async (messages: CloudMessageRecord[]) => {
    for (const message of messages) {
      const detail = await describeIncoming(localUserId, message)
      if (!detail) continue
      if (document.visibilityState === 'hidden') {
        await showSystemNotification(detail)
      } else if (pathname !== '/messages') {
        setToast(detail)
      }
    }
  }, [localUserId, pathname])

  const synchronize = useCallback(async () => {
    if (!service || !localUserId || !navigator.onLine) return
    if (inFlight.current) return inFlight.current
    const task = (async () => {
      const conversations = await service.syncWorkspace(localUserId)
      const incoming = await service.syncAll(conversations.map((conversation) => conversation.id), localUserId)
      await surfaceIncoming(incoming)
    })().finally(() => {
      if (inFlight.current === task) inFlight.current = null
    })
    inFlight.current = task
    return task
  }, [localUserId, service, surfaceIncoming])

  useEffect(() => {
    if (!service || !localUserId) return
    void synchronize().catch(() => undefined)
    const timer = window.setInterval(() => void synchronize().catch(() => undefined), BACKGROUND_WORKSPACE_SYNC_INTERVAL_MS)
    const wake = () => { if (navigator.onLine) void synchronize().catch(() => undefined) }
    const visible = () => { if (document.visibilityState === 'visible') wake() }
    window.addEventListener('online', wake)
    window.addEventListener('focus', wake)
    document.addEventListener('visibilitychange', visible)

    const channel = supabase
      ? supabase
          .channel(`connectx-incoming-${localUserId}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, wake)
          .subscribe()
      : null

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', wake)
      window.removeEventListener('focus', wake)
      document.removeEventListener('visibilitychange', visible)
      if (channel && supabase) void supabase.removeChannel(channel)
    }
  }, [localUserId, service, synchronize])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handleMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string; conversationId?: string } | null
      if (payload?.type !== 'CONNECTX_OPEN_CONVERSATION' || !payload.conversationId) return
      queuePendingConversationId(payload.conversationId)
      void navigate({ to: '/messages' })
    }
    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
  }, [navigate])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(timer)
  }, [toast])

  if (!toast) return null

  return (
    <button
      type="button"
      onClick={() => {
        queuePendingConversationId(toast.conversationId)
        setToast(null)
        void navigate({ to: '/messages' })
      }}
      className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[90] mx-auto flex max-w-sm items-start gap-3 rounded-2xl border border-blue-100 bg-white p-3 text-left shadow-2xl shadow-slate-950/15 lg:left-auto lg:right-5 lg:top-5"
      aria-label={`Open message from ${toast.title}`}
    >
      <img src={APP_BRAND.icon} alt="" className="h-10 w-10 rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-slate-950">{toast.title}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-600">{toast.body}</span>
      </span>
      <span className="text-xs font-bold text-blue-700">Open</span>
    </button>
  )
}
