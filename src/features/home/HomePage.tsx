import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { APP_BRAND } from '../../config/brand'
import { AuthPanel } from '../auth/AuthPanel'
import { useAuth } from '../auth/AuthProvider'
import { describeConnection } from '../network/networkStatus'

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
        <SignedInHome online={online} email={session.user.email ?? 'ConnectX user'} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:gap-10">
          <section className="overflow-hidden rounded-[2rem] border border-blue-500/20 bg-[#030a30] p-5 shadow-[0_24px_80px_rgba(30,64,175,0.18)] sm:p-7 lg:p-8">
            <img
              src={APP_BRAND.logo}
              alt="ConnectX — Stay Connected. Anywhere."
              className="mx-auto w-full max-w-2xl rounded-2xl"
            />
            <div className="mx-auto mt-5 max-w-2xl border-t border-cyan-300/15 pt-5 text-center text-sm leading-6 text-blue-100/85 sm:text-base">
              Resilient messaging designed to keep conversations available across Internet, offline queues, and future radio and gateway paths.
            </div>
          </section>
          <div>
            <div className="mb-4 lg:hidden">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">{APP_BRAND.name}</p>
              <p className="mt-1 text-sm text-slate-500">{APP_BRAND.tagline}</p>
            </div>
            <AuthPanel />
          </div>
        </div>
      )}
    </main>
  )
}

function SignedInHome({ online, email }: { online: boolean; email: string }) {
  const connection = describeConnection({ internet: online, radio: false, gateway: false })

  return (
    <>
      <header>
        <div className="flex items-center gap-3">
          <img src={APP_BRAND.icon} alt="" className="h-11 w-11 rounded-xl shadow-sm" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">{APP_BRAND.name}</p>
            <p className="text-xs font-medium text-slate-500">{APP_BRAND.tagline}</p>
          </div>
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Communication, simplified.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Chat, share location, send an SOS and see whether ConnectX has a communication path available.</p>
      </header>

      <section className="mt-5 grid gap-3 sm:mt-6 sm:gap-4 md:grid-cols-3">
        <QuickAction title="Chats" detail="Open direct and group conversations and send messages." to="/messages" primary />
        <QuickAction title="SOS & location" detail="Create an emergency alert or share a location fix." to="/sos" danger />
        <QuickAction title="Network" detail="See whether Internet is available and what fallback capability exists." to="/network" />
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className={`rounded-2xl border p-5 ${online ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Current connection</p>
              <h2 className="mt-1 text-xl font-bold">{connection.title}</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{connection.canCommunicate ? 'Ready' : 'Waiting'}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-700">{connection.detail}</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Signed in as</p>
          <p className="mt-2 truncate font-semibold">{email}</p>
          <Link to="/profile" className="mt-4 inline-block text-sm font-bold text-blue-800 underline decoration-blue-200 underline-offset-4">Profile & devices</Link>
        </article>
      </section>
    </>
  )
}

function QuickAction({ title, detail, to, primary = false, danger = false }: { title: string; detail: string; to: '/messages' | '/sos' | '/network'; primary?: boolean; danger?: boolean }) {
  const classes = primary
    ? 'border-blue-700 bg-gradient-to-br from-cyan-500 via-blue-600 to-violet-700 text-white shadow-blue-950/10'
    : danger
      ? 'border-rose-200 bg-rose-50 text-rose-950'
      : 'border-slate-200 bg-white text-slate-950'
  return (
    <Link to={to} className={`rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${classes}`}>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className={`mt-2 text-sm leading-6 ${primary ? 'text-blue-50' : danger ? 'text-rose-800' : 'text-slate-600'}`}>{detail}</p>
      <span className="mt-4 inline-block text-sm font-bold">Open →</span>
    </Link>
  )
}
