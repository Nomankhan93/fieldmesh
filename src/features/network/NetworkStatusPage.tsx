import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { describeConnection } from './networkStatus'

export function NetworkStatusPage() {
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

  // Real Bluetooth/LoRa status is intentionally false until hardware integration.
  const radioConnected = false
  const gatewayReachable = false
  const summary = describeConnection({
    internet: online,
    radio: radioConnected,
    gateway: gatewayReachable,
  })

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Network</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Connection status</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">A simple view of which communication paths are available right now.</p>
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <StatusCard label="Internet" status={online ? 'Connected' : 'Offline'} detail={online ? 'Chats can synchronize now.' : 'Internet messages will wait locally.'} tone={online ? 'good' : 'warn'} />
        <StatusCard label="Radio" status="Not connected" detail="No physical Bluetooth/LoRa radio is paired with this browser yet." tone="neutral" />
        <StatusCard label="Gateway" status="Not available" detail="A live radio-to-Internet gateway will appear here after real radio integration." tone="neutral" />
      </section>

      <section className={`mt-5 rounded-2xl border p-5 ${summary.canCommunicate ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">{summary.title}</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${summary.canCommunicate ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{summary.mode}</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-700">{summary.detail}</p>
      </section>

      <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-sm font-bold text-slate-700">Advanced network details</summary>
        <div className="mt-3 space-y-2 text-xs leading-5 text-slate-500">
          <p>Mesh and gateway behavior is already validated in the software labs, but this browser is not claiming a physical RF connection.</p>
          <p>When compatible hardware is integrated, these same status inputs can describe Internet-only, local-radio and hybrid gateway communication without exposing packet-level diagnostics to normal users.</p>
        </div>
      </details>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/messages" className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">Open chats</Link>
        <Link to="/sos" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-800">SOS & location</Link>
      </div>
    </main>
  )
}

function StatusCard({ label, status, detail, tone }: { label: string; status: string; detail: string; tone: 'good' | 'warn' | 'neutral' }) {
  const badge = tone === 'good'
    ? 'bg-emerald-100 text-emerald-800'
    : tone === 'warn'
      ? 'bg-amber-100 text-amber-900'
      : 'bg-slate-100 text-slate-700'
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-bold ${badge}`}>{status}</span>
      <p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p>
    </article>
  )
}
