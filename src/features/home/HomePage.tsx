import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { APP_BRAND } from '../../config/brand'
import { sortWorkspaceConversations } from '../../core/workspace/model'
import { db, type CloudMessageRecord } from '../../offline/db'
import { AuthPanel } from '../auth/AuthPanel'
import { useAuth } from '../auth/AuthProvider'
import { MessengerAvatar } from '../messaging/MessengerAvatar'
import { queuePendingConversationId } from '../notifications/IncomingSyncAgent'
import { describeConnection } from '../network/networkStatus'

function formatTime(value: number | undefined) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export function HomePage() {
  const { configured, loading, session } = useAuth()
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      {!configured ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h1 className="font-bold text-amber-950">ConnectX setup required</h1>
          <p className="mt-2 text-sm leading-6 text-amber-900">Start the local Supabase stack, run <code className="rounded bg-white px-1.5 py-0.5">npm run env:local</code>, then restart the app.</p>
        </section>
      ) : loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Checking session…</div>
      ) : session ? (
        <SignedInHome online={online} localUserId={session.user.id} displayName={(session.user.user_metadata?.display_name as string | undefined) ?? session.user.email?.split('@')[0] ?? 'there'} />
      ) : (
        <SignedOutHome />
      )}
    </main>
  )
}

function SignedOutHome() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:gap-10">
      <section className="hidden overflow-hidden rounded-[2rem] border border-blue-500/20 bg-[#030a30] p-7 shadow-[0_24px_80px_rgba(30,64,175,0.18)] lg:block lg:p-8">
        <img src={APP_BRAND.logo} alt="ConnectX — Stay Connected. Anywhere." className="mx-auto w-full max-w-2xl rounded-2xl" />
        <div className="mx-auto mt-5 max-w-2xl border-t border-cyan-300/15 pt-5 text-center text-base leading-6 text-blue-100/85">
          Stay connected when normal connectivity cannot.
        </div>
      </section>
      <div>
        <div className="mb-4 lg:hidden">
          <p className="text-2xl font-bold tracking-tight text-slate-950">{APP_BRAND.tagline}</p>
          <p className="mt-1 text-sm leading-5 text-slate-500">Messaging built for Internet, offline queues and resilient networks.</p>
        </div>
        <AuthPanel />
        <p className="mt-4 text-center text-xs leading-5 text-slate-400 lg:hidden">Offline-first messaging · installable PWA · resilient delivery foundation</p>
      </div>
    </div>
  )
}

function SignedInHome({ online, localUserId, displayName }: { online: boolean; localUserId: string; displayName: string }) {
  const connection = describeConnection({ internet: online, radio: false, gateway: false })

  return (
    <>
      <header className="hidden lg:block">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">{APP_BRAND.name}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Communication, simplified.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Chat, share location, send an SOS and see whether ConnectX has a communication path available.</p>
      </header>

      <section className="lg:mt-6">
        <div className="mb-4 lg:hidden">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Welcome</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Hi, {displayName}</h1>
        </div>
        <article className={`rounded-2xl border px-4 py-3.5 ${online ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${online ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}><span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-slate-950">{connection.title}</h2>
              <p className="mt-0.5 text-xs leading-5 text-slate-600">{connection.detail}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{connection.canCommunicate ? 'Ready' : 'Waiting'}</span>
          </div>
        </article>
      </section>

      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-950">Quick actions</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <QuickAction title="Chats" detail="Messages" to="/messages" accent="blue" symbol="▣" />
          <QuickAction title="SOS" detail="Emergency" to="/sos" accent="rose" symbol="!" />
          <QuickAction title="Location" detail="Share GPS" to="/sos" accent="violet" symbol="◎" />
          <QuickAction title="Network" detail="Connection" to="/network" accent="cyan" symbol="⌁" />
        </div>
      </section>

      <RecentChats localUserId={localUserId} />
    </>
  )
}

function RecentChats({ localUserId }: { localUserId: string }) {
  const conversations = useLiveQuery(
    async () => sortWorkspaceConversations(await db.workspaceConversations.where('localUserId').equals(localUserId).toArray()),
    [localUserId],
    [],
  )
  const participants = useLiveQuery(
    async () => db.workspaceParticipants.where('localUserId').equals(localUserId).toArray(),
    [localUserId],
    [],
  )
  const messages = useLiveQuery<CloudMessageRecord[], CloudMessageRecord[]>(
    async () => db.cloudMessages.where('localUserId').equals(localUserId).toArray(),
    [localUserId],
    [],
  )

  const recent = useMemo(() => conversations.slice(0, 3).map((conversation) => {
    const members = participants.filter((item) => item.conversationId === conversation.id)
    const other = members.find((item) => item.user_id !== localUserId)
    const title = conversation.title || (conversation.kind === 'group' ? 'Group conversation' : other?.display_name || 'Direct conversation')
    const latest = messages
      .filter((message) => message.conversationId === conversation.id)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    return { conversation, title, latest }
  }), [conversations, localUserId, messages, participants])

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">Recent chats</h2>
        <Link to="/messages" className="text-xs font-bold text-blue-700">See all</Link>
      </div>
      {recent.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm font-semibold text-slate-700">No conversations yet</p>
          <Link to="/messages" className="mt-2 inline-block text-xs font-bold text-blue-700">Start a chat</Link>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {recent.map(({ conversation, title, latest }) => (
            <Link key={conversation.id} to="/messages" onClick={() => queuePendingConversationId(conversation.id)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
              <MessengerAvatar label={title} group={conversation.kind === 'group'} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{title}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{latest ? `${latest.senderId === localUserId ? 'You: ' : ''}${latest.body}` : 'No messages yet'}</p>
              </div>
              <span className="shrink-0 text-[11px] text-slate-400">{formatTime(latest?.createdAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function QuickAction({ title, detail, to, accent, symbol }: { title: string; detail: string; to: '/messages' | '/sos' | '/network'; accent: 'blue' | 'rose' | 'violet' | 'cyan'; symbol: string }) {
  const tone = accent === 'rose' ? 'bg-rose-50 text-rose-700' : accent === 'violet' ? 'bg-violet-50 text-violet-700' : accent === 'cyan' ? 'bg-cyan-50 text-cyan-700' : 'bg-blue-50 text-blue-700'
  return (
    <Link to={to} className="connectx-touch flex min-h-[94px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg font-black ${tone}`}>{symbol}</span>
      <span>
        <span className="block text-sm font-bold text-slate-950">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>
      </span>
    </Link>
  )
}
