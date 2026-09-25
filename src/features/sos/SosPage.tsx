import { useEffect, useMemo, useRef, useState } from 'react'
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
import { readDeveloperMode, subscribeDeveloperMode } from '../shell/developerMode'
import { MobileSheet } from '../mobile/MobileSheet'

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
  const [notice, setNotice] = useState('Safety tools ready.')
  const [confirmSos, setConfirmSos] = useState(false)
  const [developerMode, setDeveloperMode] = useState(readDeveloperMode)

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

  useEffect(() => subscribeDeveloperMode(setDeveloperMode), [])

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
    setConfirmSos(false)
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

  const activeSos = snapshot.sos.find((record) => !['resolved', 'expired', 'failed'].includes(record.status))
  const pastSos = snapshot.sos.filter((record) => ['resolved', 'expired', 'failed'].includes(record.status)).slice(0, 5)
  const latestActionableSos = snapshot.sos.find((record) => record.status === 'received' || record.status === 'acknowledged')
  const events = useMemo(() => [...snapshot.events].reverse().slice(0, 60), [snapshot.events])

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-rose-600">Safety</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">SOS & location</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Send an emergency-priority alert even when a GPS fix is unavailable. Location can be captured and shared separately.</p>
      </header>

      <section className="mt-5 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm leading-6 text-rose-950">
        <strong>Prototype only:</strong> this does not contact police, ambulance, rescue services or any real emergency responder. Radio and gateway paths are still software simulations.
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-600">Emergency priority</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Send SOS</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">GPS is included when available, but lack of GPS never blocks the alert.</p>

          <label className="mt-5 block text-sm font-semibold text-slate-700">
            Emergency type
            <select value={category} onChange={(event) => setCategory(event.target.value as SosCategory)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3">
              {SOS_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>

          <label className="mt-4 block text-sm font-semibold text-slate-700">
            Short message <span className="font-normal text-slate-400">(optional)</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="What happened or what help is needed?" className="mt-2 min-h-24 w-full resize-y rounded-xl border border-slate-300 p-3" />
          </label>

          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            {currentFix ? <>Location ready · ±{Math.round(currentFix.accuracy)} m reported accuracy</> : <>No location fix · SOS can still be sent</>}
          </div>

          {confirmSos ? (
            <div className="mt-4 hidden rounded-2xl border border-rose-300 bg-rose-50 p-4 lg:block">
              <p className="font-bold text-rose-950">Confirm emergency SOS</p>
              <p className="mt-1 text-sm leading-5 text-rose-800">This sends the alert immediately through the best available prototype path. GPS is optional.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={() => setConfirmSos(false)} className="connectx-touch rounded-xl border border-rose-300 bg-white px-4 text-sm font-bold text-rose-800 disabled:opacity-50">Cancel</button>
                <button type="button" disabled={busy} onClick={sendSos} className="connectx-touch rounded-xl bg-rose-700 px-4 text-sm font-bold text-white disabled:opacity-50">Send SOS now</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={busy} onClick={() => setConfirmSos(true)} className="connectx-touch mt-4 w-full rounded-2xl bg-rose-700 px-5 text-lg font-bold text-white shadow-sm disabled:opacity-50">SEND SOS</button>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">Location</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">My location</h2>
          {currentFix ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="font-mono text-sm font-bold text-slate-800">{currentFix.latitude.toFixed(5)}, {currentFix.longitude.toFixed(5)}</div>
              <div className="mt-1 text-slate-500">Accuracy ±{Math.round(currentFix.accuracy)} m</div>
              <div className="text-slate-500">Captured {formatTime(currentFix.capturedAt)}</div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">No location captured yet.</div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={busy} onClick={captureLocation} className="connectx-touch rounded-xl border border-slate-300 px-3 text-sm font-bold disabled:opacity-50">Capture GPS</button>
            <button type="button" disabled={busy || !currentFix} onClick={sendLocationUpdate} className="connectx-touch rounded-xl bg-sky-700 px-3 text-sm font-bold text-white disabled:opacity-40">Share location</button>
          </div>

          <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-bold text-slate-700">Periodic location sharing</summary>
            <p className="mt-2 text-xs leading-5 text-slate-500">Foreground only. Browser background reliability is not guaranteed.</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <select value={periodicMinutes} onChange={(event) => setPeriodicMinutes(Number(event.target.value))} disabled={periodicEnabled} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm disabled:bg-slate-100">
                <option value={1}>Every 1 minute</option>
                <option value={5}>Every 5 minutes</option>
                <option value={15}>Every 15 minutes</option>
              </select>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={periodicEnabled} onChange={(event) => setPeriodicEnabled(event.target.checked)} className="h-5 w-5" /> Enabled</label>
            </div>
          </details>
        </section>
      </div>

      <MobileSheet
        open={confirmSos}
        title="Confirm emergency SOS"
        description="This sends the alert immediately through the best available prototype path. GPS is optional."
        onClose={() => setConfirmSos(false)}
        tone="danger"
      >
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
          <p className="font-bold capitalize">{category} emergency</p>
          <p className="mt-1">{currentFix ? 'Current location will be attached.' : 'No GPS fix is available, but the SOS can still be sent.'}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={() => setConfirmSos(false)} className="connectx-touch rounded-xl border border-rose-300 bg-white px-4 text-sm font-bold text-rose-800 disabled:opacity-50">Cancel</button>
          <button type="button" disabled={busy} onClick={sendSos} className="connectx-touch rounded-xl bg-rose-700 px-4 text-sm font-bold text-white disabled:opacity-50">Send SOS now</button>
        </div>
      </MobileSheet>

      {activeSos ? (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Active SOS</p>
              <h2 className="mt-1 text-xl font-bold capitalize">{activeSos.category}</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${statusClasses(activeSos.status)}`}>{activeSos.status}</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Detail label="Status" value={activeSos.status} />
            <Detail label="Created" value={formatTime(activeSos.createdAt)} />
            <Detail label="Location" value={activeSos.location ? 'Attached' : 'Unavailable'} />
          </div>
          {activeSos.note ? <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{activeSos.note}</p> : null}
        </section>
      ) : null}

      {pastSos.length > 0 ? (
        <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-bold text-slate-700">Past SOS activity ({pastSos.length})</summary>
          <p className="mt-2 text-xs leading-5 text-slate-500">Resolved and terminal prototype records are kept here so they do not look like an active emergency.</p>
          <div className="mt-3 space-y-2">
            {pastSos.map((record) => (
              <article key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                <div><span className="font-bold capitalize">{record.category}</span><span className="ml-2 text-slate-500">{formatTime(record.createdAt)}</span></div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${statusClasses(record.status)}`}>{record.status}</span>
              </article>
            ))}
          </div>
        </details>
      ) : null}

      {developerMode ? (
      <details className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <summary className="cursor-pointer font-black text-amber-950">Developer simulation controls</summary>
        <p className="mt-2 text-sm leading-6 text-amber-900">These controls simulate transport failures and responder behavior. They are not part of the normal user workflow.</p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-amber-200 bg-white p-4">
            <h3 className="font-bold">Connectivity simulation</h3>
            <Toggle label="Phone Internet" checked={phoneInternet} onChange={togglePhoneInternet} />
            <Toggle label="Phone simulated radio" checked={phoneRadio} onChange={togglePhoneRadio} />
            <Toggle label="Gateway Internet" checked={gatewayInternet} onChange={toggleGatewayInternet} />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" disabled={busy} onClick={retry} className="rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">Retry queued traffic</button>
              <button type="button" disabled={busy} onClick={useSimulatedLocation} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-bold disabled:opacity-50">Use simulated location</button>
            </div>
          </section>

          <section className="rounded-xl border border-amber-200 bg-white p-4">
            <h3 className="font-bold">Prototype counters</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Metric label="SOS" value={snapshot.sos.length} />
              <Metric label="Location shares" value={snapshot.locationShares.length} />
              <Metric label="Fixes" value={locationFixes.length} />
              <Metric label="Events" value={snapshot.events.length} />
            </div>
          </section>
        </div>

        {latestActionableSos ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {latestActionableSos.status === 'received' ? <button type="button" disabled={busy} onClick={() => acknowledge(latestActionableSos)} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white">Simulate responder acknowledgement</button> : null}
            {latestActionableSos.status === 'acknowledged' ? <button type="button" disabled={busy} onClick={() => resolve(latestActionableSos)} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white">Mark resolved</button> : null}
          </div>
        ) : null}

        <section className="mt-4 rounded-xl border border-amber-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold">SOS lifecycle events</h3>
            <button type="button" disabled={busy} onClick={resetLab} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold">Reset lab</button>
          </div>
          <div className="mt-3 space-y-2">
            {events.length === 0 ? <div className="text-sm text-slate-500">No SOS events yet.</div> : events.map((event) => (
              <article key={event.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold uppercase tracking-wide text-slate-700">{event.type}</span><span className="text-xs text-slate-500">{formatTime(event.at)}</span></div>
                <p className="mt-1 text-slate-600">{event.summary}</p>
              </article>
            ))}
          </div>
        </section>
      </details>

      ) : null}

      <p aria-live="polite" className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{notice}</p>
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
