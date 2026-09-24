import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { captureBatteryPercent, captureBrowserLocation } from '../../core/location/browser'
import { createLocationFix, type LocationFix } from '../../core/location/types'
import { SimulatedGatewayCloudAdapter, SimulatedGatewayRadioAdapter } from '../../core/gateway/adapters'
import { GatewayAgent } from '../../core/gateway/agent'
import { DexieGatewayStore } from '../../core/gateway/dexieStore'
import type { SosCategory } from '../../core/message/model'
import { DexieFieldSafetyStore } from '../../core/sos/dexieStore'
import { FieldSafetyService } from '../../core/sos/service'
import { GatewaySafetyTransportAdapter, SimulatedSafetyInternetAdapter } from '../../core/sos/transports'
import type { SafetySnapshot, SosRecord } from '../../core/sos/types'
import { useAuth } from '../auth/AuthProvider'

const SAFETY_GATEWAY_ID = 'SOS-G1'
const SIMULATED_FIX = {
  latitude: 25.36,
  longitude: 69.74,
  accuracy: 25,
}

const SOS_CATEGORIES: Array<{ value: SosCategory; label: string }> = [
  { value: 'medical', label: 'Medical' },
  { value: 'security', label: 'Security' },
  { value: 'accident', label: 'Accident' },
  { value: 'lost', label: 'Lost' },
  { value: 'vehicle', label: 'Vehicle issue' },
  { value: 'other', label: 'Other' },
]

function formatTime(value?: number): string {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString()
}

function statusClasses(status: SosRecord['status']): string {
  if (status === 'resolved') return 'bg-emerald-100 text-emerald-800'
  if (status === 'acknowledged' || status === 'received') return 'bg-sky-100 text-sky-800'
  if (status === 'transmitted') return 'bg-violet-100 text-violet-800'
  if (status === 'queued' || status === 'created') return 'bg-amber-100 text-amber-800'
  return 'bg-rose-100 text-rose-800'
}

export function SosPage() {
  const { session } = useAuth()
  const safetyStoreRef = useRef<DexieFieldSafetyStore | null>(null)
  const gatewayStoreRef = useRef<DexieGatewayStore | null>(null)
  const gatewayCloudRef = useRef<SimulatedGatewayCloudAdapter | null>(null)
  const gatewayRadioRef = useRef<SimulatedGatewayRadioAdapter | null>(null)
  const gatewayAgentRef = useRef<GatewayAgent | null>(null)
  const internetRef = useRef<SimulatedSafetyInternetAdapter | null>(null)
  const radioGatewayRef = useRef<GatewaySafetyTransportAdapter | null>(null)
  const serviceRef = useRef<FieldSafetyService | null>(null)

  if (!safetyStoreRef.current) safetyStoreRef.current = new DexieFieldSafetyStore()
  if (!gatewayStoreRef.current) gatewayStoreRef.current = new DexieGatewayStore()
  if (!gatewayCloudRef.current) gatewayCloudRef.current = new SimulatedGatewayCloudAdapter(true)
  if (!gatewayRadioRef.current) gatewayRadioRef.current = new SimulatedGatewayRadioAdapter(true)
  if (!gatewayAgentRef.current) {
    gatewayAgentRef.current = new GatewayAgent(
      SAFETY_GATEWAY_ID,
      gatewayStoreRef.current,
      gatewayRadioRef.current,
      gatewayCloudRef.current,
    )
  }
  if (!internetRef.current) internetRef.current = new SimulatedSafetyInternetAdapter(true)
  if (!radioGatewayRef.current) {
    radioGatewayRef.current = new GatewaySafetyTransportAdapter({
      agent: gatewayAgentRef.current,
      sourceNodeId: 'radio:field-user',
      radioAvailable: true,
    })
  }
  if (!serviceRef.current) {
    serviceRef.current = new FieldSafetyService(
      safetyStoreRef.current,
      internetRef.current,
      radioGatewayRef.current,
    )
  }

  const service = serviceRef.current
  const internet = internetRef.current
  const radioGateway = radioGatewayRef.current
  const gatewayCloud = gatewayCloudRef.current
  const gatewayAgent = gatewayAgentRef.current

  const [snapshot, setSnapshot] = useState<SafetySnapshot>({ sos: [], locationShares: [], events: [] })
  const [locationFixes, setLocationFixes] = useState<LocationFix[]>([])
  const [currentFix, setCurrentFix] = useState<LocationFix | null>(null)
  const [category, setCategory] = useState<SosCategory>('medical')
  const [note, setNote] = useState('')
  const [phoneInternet, setPhoneInternet] = useState(true)
  const [phoneRadio, setPhoneRadio] = useState(true)
  const [gatewayInternet, setGatewayInternet] = useState(true)
  const [busy, setBusy] = useState(false)
  const [periodicEnabled, setPeriodicEnabled] = useState(false)
  const [periodicMinutes, setPeriodicMinutes] = useState(5)
  const [notice, setNotice] = useState('Ready. This is a software-only safety lab.')

  async function refresh() {
    const [nextSnapshot, fixes] = await Promise.all([
      service.snapshot(),
      service.listLocationFixes(),
    ])
    setSnapshot(nextSnapshot)
    setLocationFixes(fixes)
    setCurrentFix((existing) => existing ?? fixes[0] ?? null)
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Safety lab action failed.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
    // Store/service instances are stable for this page lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!periodicEnabled) return undefined
    const timer = window.setInterval(() => {
      void run(async () => {
        const result = await captureBrowserLocation({ timeout: 8_000, maximumAge: 30_000 })
        if (!result.fix) {
          setNotice(result.error ?? 'Periodic foreground location capture failed.')
          return
        }
        await service.saveLocationFix(result.fix)
        setCurrentFix(result.fix)
        const share = await service.createLocationShare({
          senderUserId: senderUserId(),
          location: result.fix,
        })
        await service.dispatchLocationShare(share.id)
        setNotice('Foreground periodic location update attempted.')
      })
    }, periodicMinutes * 60_000)
    return () => window.clearInterval(timer)
    // This intentionally runs only while the page is mounted; browser background timers are not claimed as reliable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodicEnabled, periodicMinutes])

  function senderUserId(): string {
    return session?.user.id ?? 'offline-field-user'
  }

  function togglePhoneInternet(next: boolean) {
    internet.setAvailable(next)
    setPhoneInternet(next)
    if (next) void run(async () => { await service.retryPending() })
  }

  function togglePhoneRadio(next: boolean) {
    radioGateway.setRadioAvailable(next)
    setPhoneRadio(next)
    if (next) void run(async () => { await service.retryPending() })
  }

  function toggleGatewayInternet(next: boolean) {
    gatewayCloud.setAvailable(next)
    setGatewayInternet(next)
    gatewayAgent.recordConnectivityChange()
    if (next) {
      void run(async () => {
        await gatewayAgent.flush(Date.now(), true)
        await service.retryPending()
      })
    }
  }

  function captureLocation() {
    void run(async () => {
      const result = await captureBrowserLocation()
      if (!result.fix) {
        setNotice(result.error ?? 'Location unavailable. SOS can still be sent without GPS.')
        return
      }
      await service.saveLocationFix(result.fix)
      setCurrentFix(result.fix)
      setNotice(`Location captured with ±${Math.round(result.fix.accuracy)} m reported accuracy.`)
    })
  }

  function useSimulatedLocation() {
    void run(async () => {
      const fix = createLocationFix({ ...SIMULATED_FIX, source: 'simulated' })
      await service.saveLocationFix(fix)
      setCurrentFix(fix)
      setNotice('Simulated location loaded for software testing only.')
    })
  }

  function sendLocationUpdate() {
    if (!currentFix) return
    void run(async () => {
      const record = await service.createLocationShare({
        senderUserId: senderUserId(),
        location: currentFix,
      })
      const result = await service.dispatchLocationShare(record.id)
      setNotice(`Location update: ${result.status}${result.path ? ` via ${result.path}` : ''}.`)
    })
  }

  function sendSos() {
    void run(async () => {
      const batteryPercent = await captureBatteryPercent()
      const record = await service.createSos({
        senderUserId: senderUserId(),
        category,
        note,
        location: currentFix ?? undefined,
        batteryPercent,
      })
      const result = await service.dispatchSos(record.id)
      setNotice(
        result.status === 'received'
          ? `SOS received via ${result.path}.`
          : result.status === 'transmitted'
            ? 'SOS reached the gateway and is waiting for gateway Internet recovery.'
            : 'SOS stored locally and will retry when a path becomes available.',
      )
      setNote('')
    })
  }

  function acknowledge(record: SosRecord) {
    void run(async () => {
      await service.acknowledge(record.id, 'Simulated responder')
      setNotice('Responder acknowledgement recorded.')
    })
  }

  function resolve(record: SosRecord) {
    void run(async () => {
      await service.resolve(record.id, 'Simulated responder')
      setNotice('SOS marked resolved.')
    })
  }

  function retry() {
    void run(async () => {
      await gatewayAgent.flush(Date.now(), true)
      await service.retryPending()
      setNotice('Queued location/SOS traffic retried with emergency priority first.')
    })
  }

  function resetLab() {
    void run(async () => {
      await service.clear()
      await gatewayAgent.reset()
      setCurrentFix(null)
      setNotice('Location + SOS lab records cleared.')
    })
  }

  const latestSos = snapshot.sos[0]
  const events = useMemo(() => [...snapshot.events].reverse().slice(0, 60), [snapshot.events])

  return (
    <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">FieldMesh 0.6</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Location + SOS</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            Capture a location fix, create emergency-priority SOS traffic and exercise direct Internet or Radio → Gateway → Cloud delivery with durable recovery.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Identity</Link>
          <Link to="/messages" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Messages</Link>
          <Link to="/simulator" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Mesh lab</Link>
          <Link to="/gateway" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Gateway</Link>
        </div>
      </header>

      <section className="mb-5 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm leading-6 text-rose-950">
        <strong>Prototype warning:</strong> this screen does not contact police, ambulance, rescue services or any real emergency responder. Simulated radio/gateway paths are for FieldMesh software validation only.
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Connectivity</h2>
            <p className="mt-1 text-sm text-slate-500">Direct Internet is preferred; emergency traffic falls back to the hybrid gateway.</p>
            <Toggle label="Phone Internet" checked={phoneInternet} onChange={togglePhoneInternet} />
            <Toggle label="Phone simulated radio" checked={phoneRadio} onChange={togglePhoneRadio} />
            <Toggle label="Gateway Internet" checked={gatewayInternet} onChange={toggleGatewayInternet} />
            <button type="button" disabled={busy} onClick={retry} className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              Retry queued safety traffic
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Location</h2>
            {currentFix ? (
              <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm">
                <div className="font-mono text-xs text-slate-700">{currentFix.latitude.toFixed(5)}, {currentFix.longitude.toFixed(5)}</div>
                <div className="mt-1 text-slate-500">Accuracy ±{Math.round(currentFix.accuracy)} m · {currentFix.source}</div>
                <div className="text-slate-500">Captured {formatTime(currentFix.capturedAt)}</div>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No location fix. SOS remains available without GPS.</div>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <button type="button" disabled={busy} onClick={captureLocation} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold disabled:opacity-50">Capture browser GPS</button>
              <button type="button" disabled={busy} onClick={useSimulatedLocation} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold disabled:opacity-50">Use simulated fix</button>
              <button type="button" disabled={busy || !currentFix} onClick={sendLocationUpdate} className="rounded-xl bg-sky-700 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40">Send location update</button>
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-800">Foreground periodic sharing</div>
                  <div className="text-xs text-slate-500">Runs only while this page remains active; background reliability is not guaranteed.</div>
                </div>
                <input type="checkbox" checked={periodicEnabled} onChange={(event) => setPeriodicEnabled(event.target.checked)} className="h-5 w-5" />
              </div>
              <select value={periodicMinutes} onChange={(event) => setPeriodicMinutes(Number(event.target.value))} disabled={periodicEnabled} className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm disabled:bg-slate-100">
                <option value={1}>Every 1 minute</option>
                <option value={5}>Every 5 minutes</option>
                <option value={15}>Every 15 minutes</option>
              </select>
            </div>
          </section>
        </aside>

        <div className="space-y-5">
          <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-600">Emergency priority</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Create SOS</h2>
              </div>
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">SOS &gt; control &gt; location &gt; chat</span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Emergency type
                <select value={category} onChange={(event) => setCategory(event.target.value as SosCategory)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                  {SOS_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Short message (optional)
                <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="What happened / what help is needed?" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
              </label>
            </div>

            <button type="button" disabled={busy} onClick={sendSos} className="mt-5 w-full rounded-2xl bg-rose-700 px-5 py-4 text-lg font-black text-white shadow-sm disabled:opacity-50">
              SEND SOS
            </button>
            <p className="mt-2 text-center text-xs text-slate-500">GPS is attached when available. Lack of GPS never blocks SOS creation or transmission.</p>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="SOS records" value={snapshot.sos.length} />
            <Metric label="Location shares" value={snapshot.locationShares.length} />
            <Metric label="Captured fixes" value={locationFixes.length} />
            <Metric label="Queued / in transit" value={snapshot.sos.filter((item) => ['created', 'queued', 'transmitted'].includes(item.status)).length + snapshot.locationShares.filter((item) => ['created', 'queued', 'transmitted'].includes(item.status)).length} />
          </section>

          {latestSos ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Latest SOS</p>
                  <h2 className="mt-1 text-xl font-bold capitalize text-slate-950">{latestSos.category}</h2>
                  <p className="mt-1 break-all font-mono text-xs text-slate-500">{latestSos.id}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${statusClasses(latestSos.status)}`}>{latestSos.status}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <Detail label="Path" value={latestSos.path ?? 'Not assigned'} />
                <Detail label="Created" value={formatTime(latestSos.createdAt)} />
                <Detail label="Received" value={formatTime(latestSos.receivedAt)} />
                <Detail label="GPS" value={latestSos.location ? `${latestSos.location.latitude.toFixed(4)}, ${latestSos.location.longitude.toFixed(4)}` : 'Unavailable'} />
              </div>
              {latestSos.note ? <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{latestSos.note}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {latestSos.status === 'received' ? <button type="button" disabled={busy} onClick={() => acknowledge(latestSos)} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white">Simulate responder acknowledgement</button> : null}
                {latestSos.status === 'acknowledged' ? <button type="button" disabled={busy} onClick={() => resolve(latestSos)} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white">Mark resolved</button> : null}
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-950">SOS lifecycle timeline</h2>
                <p className="text-sm text-slate-500">Created → queued/transmitted → received → acknowledged → resolved.</p>
              </div>
              <button type="button" disabled={busy} onClick={resetLab} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold">Reset safety lab</button>
            </div>
            <div className="mt-4 space-y-2">
              {events.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">No SOS events yet.</div> : events.map((event) => (
                <article key={event.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold uppercase tracking-wide text-slate-700">{event.type}</span>
                    <span className="text-xs text-slate-500">{formatTime(event.at)}</span>
                  </div>
                  <p className="mt-1 text-slate-600">{event.summary}</p>
                  {event.path ? <p className="mt-1 text-xs font-semibold text-slate-500">Path: {event.path}</p> : null}
                </article>
              ))}
            </div>
          </section>

          <p aria-live="polite" className="rounded-2xl bg-slate-950 p-4 text-sm text-white">{notice}</p>
        </div>
      </div>
    </main>
  )
}

function Toggle(props: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">
      {props.label}
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} className="h-5 w-5" />
    </label>
  )
}

function Metric(props: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{props.label}</div>
      <div className="mt-2 text-2xl font-black text-slate-950">{props.value}</div>
    </div>
  )
}

function Detail(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{props.label}</div>
      <div className="mt-1 break-words font-semibold text-slate-800">{props.value}</div>
    </div>
  )
}
