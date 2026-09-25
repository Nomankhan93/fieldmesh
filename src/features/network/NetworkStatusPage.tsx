import { useEffect, useMemo, useState } from 'react'
import { SectionHeader, StatusRow } from '../mobile/CompactUi'
import { connectionRows } from '../mobile/informationHierarchy'
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

  const radioConnected = false
  const gatewayReachable = false
  const summary = describeConnection({ internet: online, radio: radioConnected, gateway: gatewayReachable })
  const rows = useMemo(() => connectionRows({ internet: online, radio: radioConnected, gateway: gatewayReachable }), [gatewayReachable, online, radioConnected])

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <SectionHeader eyebrow="Network" title="Connection status" detail="See which communication paths are available right now." compact />

      <section className={`rounded-2xl border px-4 py-3.5 lg:mt-6 ${summary.canCommunicate ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${summary.canCommunicate ? 'bg-emerald-100' : 'bg-amber-100'}`}><span className={`h-2.5 w-2.5 rounded-full ${summary.canCommunicate ? 'bg-emerald-500' : 'bg-amber-500'}`} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-950">{summary.title}</h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">{summary.detail}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${summary.canCommunicate ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{summary.mode}</span>
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
        {rows.map((row) => <StatusRow key={row.id} label={row.label} value={row.value} detail={row.detail} tone={row.tone} />)}
      </section>

      <details className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
        <summary className="cursor-pointer text-sm font-bold text-slate-800">Connection details</summary>
        <div className="mt-3 grid gap-3 text-xs leading-5 text-slate-500 sm:grid-cols-3">
          <div><p className="font-bold text-slate-700">Internet</p><p>Uses the browser connection for cloud synchronization.</p></div>
          <div><p className="font-bold text-slate-700">Radio</p><p>No compatible physical radio is paired on this device yet.</p></div>
          <div><p className="font-bold text-slate-700">Gateway</p><p>Hybrid gateway availability will appear after compatible radio integration.</p></div>
        </div>
      </details>
    </main>
  )
}
