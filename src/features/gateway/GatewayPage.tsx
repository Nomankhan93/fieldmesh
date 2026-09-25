import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SimulatedGatewayCloudAdapter,
  SimulatedGatewayRadioAdapter,
} from '../../core/gateway/adapters'
import { GatewayAgent } from '../../core/gateway/agent'
import { DexieGatewayStore } from '../../core/gateway/dexieStore'
import type {
  GatewayDirection,
  GatewaySnapshot,
  GatewayTraceEvent,
} from '../../core/gateway/types'
import { createTransportFrame } from '../../core/transport/frame'

const GATEWAY_ID = 'G1'
const LAB_USER_ID = 'user-b'
const LAB_RADIO_NODE_ID = 'radio:user-b'
const encoder = new TextEncoder()

function formatDirection(direction: GatewayDirection): string {
  return direction === 'radio-to-cloud' ? 'Radio → Cloud' : 'Cloud → Radio'
}

function formatAge(value: number, now: number): string {
  const delta = Math.max(0, now - value)
  if (delta < 1_000) return `${delta} ms ago`
  if (delta < 60_000) return `${Math.floor(delta / 1_000)}s ago`
  return `${Math.floor(delta / 60_000)}m ago`
}

function traceClasses(event: GatewayTraceEvent): string {
  if (event.type === 'cloud-forwarded' || event.type === 'radio-forwarded') return 'border-emerald-200 bg-emerald-50'
  if (event.type === 'forward-failed' || event.type === 'expired' || event.type === 'route-unavailable') return 'border-rose-200 bg-rose-50'
  if (event.type === 'queued' || event.type === 'retry-scheduled') return 'border-amber-200 bg-amber-50'
  if (event.type === 'duplicate-suppressed') return 'border-fuchsia-200 bg-fuchsia-50'
  if (event.type === 'connectivity-changed') return 'border-violet-200 bg-violet-50'
  return 'border-slate-200 bg-white'
}

export function GatewayPage() {
  const storeRef = useRef<DexieGatewayStore | null>(null)
  const radioRef = useRef<SimulatedGatewayRadioAdapter | null>(null)
  const cloudRef = useRef<SimulatedGatewayCloudAdapter | null>(null)
  const agentRef = useRef<GatewayAgent | null>(null)

  if (!storeRef.current) storeRef.current = new DexieGatewayStore()
  if (!radioRef.current) radioRef.current = new SimulatedGatewayRadioAdapter(true)
  if (!cloudRef.current) cloudRef.current = new SimulatedGatewayCloudAdapter(true)
  if (!agentRef.current) {
    agentRef.current = new GatewayAgent(
      GATEWAY_ID,
      storeRef.current,
      radioRef.current,
      cloudRef.current,
    )
  }

  const agent = agentRef.current
  const radio = radioRef.current
  const cloud = cloudRef.current

  const [snapshot, setSnapshot] = useState<GatewaySnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [radioAvailable, setRadioAvailable] = useState(radio.isAvailable())
  const [internetAvailable, setInternetAvailable] = useState(cloud.isAvailable())

  async function refresh() {
    setSnapshot(await agent.snapshot())
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unknown gateway lab error')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void run(async () => {
      await agent.learnRoute({
        userId: LAB_USER_ID,
        radioNodeId: LAB_RADIO_NODE_ID,
        ttlMs: 30 * 60 * 1000,
      })
      await agent.flush(Date.now(), true)
    })
    // Agent instance is intentionally stable for the page lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const queue = snapshot?.queue ?? []
  const trace = snapshot?.trace ?? []
  const metrics = snapshot?.metrics
  const now = Date.now()
  const latestTrace = useMemo(() => [...trace].reverse().slice(0, 40), [trace])

  function setRadioState(next: boolean) {
    radio.setAvailable(next)
    setRadioAvailable(next)
    agent.recordConnectivityChange()
    void run(async () => {
      if (next) await agent.flush(Date.now(), true)
    })
  }

  function setInternetState(next: boolean) {
    cloud.setAvailable(next)
    setInternetAvailable(next)
    agent.recordConnectivityChange()
    void run(async () => {
      if (next) await agent.flush(Date.now(), true)
    })
  }

  function sendRadioToCloud() {
    void run(async () => {
      const createdAt = Date.now()
      const messageId = crypto.randomUUID()
      const frame = createTransportFrame({
        messageId,
        sourceNodeId: 'radio:user-a',
        destinationNodeId: `gateway:${GATEWAY_ID}`,
        createdAt,
        expiresAt: createdAt + 10 * 60 * 1000,
        attempt: 1,
        payload: encoder.encode(`Field radio uplink ${messageId.slice(0, 8)}`),
      })
      await agent.ingestRadioFrame(frame)
    })
  }

  function sendCloudToRadio() {
    void run(async () => {
      const createdAt = Date.now()
      const messageId = crypto.randomUUID()
      await agent.ingestCloudMessage({
        messageId,
        destinationUserId: LAB_USER_ID,
        createdAt,
        expiresAt: createdAt + 10 * 60 * 1000,
        payload: encoder.encode(`Cloud downlink ${messageId.slice(0, 8)}`),
      })
    })
  }

  function resetLab() {
    void run(async () => {
      await agent.reset()
      radio.setAvailable(true)
      cloud.setAvailable(true)
      setRadioAvailable(true)
      setInternetAvailable(true)
      await agent.learnRoute({
        userId: LAB_USER_ID,
        radioNodeId: LAB_RADIO_NODE_ID,
        ttlMs: 30 * 60 * 1000,
      })
    })
  }

  return (
    <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">FieldMesh 0.8.0 · Developer tools</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Hybrid gateway lab</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            Durable LoRa-side ↔ Internet/cloud bridging with queue recovery, duplicate suppression and a routing registry. The radio and cloud adapters on this page are simulated; no physical transmission occurs.
          </p>
        </div>
      </header>

      {error ? <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">{error}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Gateway</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">{GATEWAY_ID}</h2>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Agent active</span>
            </div>

            <ConnectivityToggle
              label="Simulated radio"
              available={radioAvailable}
              onChange={setRadioState}
            />
            <ConnectivityToggle
              label="Internet / cloud"
              available={internetAvailable}
              onChange={setInternetState}
            />

            <button
              type="button"
              disabled={busy}
              onClick={() => void run(async () => agent.flush(Date.now(), true))}
              className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
            >
              Retry queued traffic now
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100">
            <h2 className="font-semibold text-slate-950">Inject traffic</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">Use these actions to prove both bridge directions and failure recovery.</p>
            <div className="mt-4 grid gap-2">
              <button type="button" disabled={busy} onClick={sendRadioToCloud} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                Radio → Cloud message
              </button>
              <button type="button" disabled={busy} onClick={sendCloudToRadio} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                Cloud → Radio message
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-950">Routing registry</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{snapshot?.routes.length ?? 0} active</span>
            </div>
            <div className="mt-3 space-y-2">
              {(snapshot?.routes ?? []).map((route) => (
                <div key={route.key} className="rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-slate-900">{route.userId}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{route.gatewayId} → {route.radioNodeId}</p>
                  <p className="mt-1 text-xs text-slate-500">learned {formatAge(route.lastSeenAt, now)}</p>
                </div>
              ))}
            </div>
          </section>

          <button type="button" disabled={busy} onClick={resetLab} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
            Reset gateway lab
          </button>
        </aside>

        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Uplink queue" value={snapshot?.uplinkQueueDepth ?? 0} detail="Radio → Cloud" />
            <MetricCard label="Downlink queue" value={snapshot?.downlinkQueueDepth ?? 0} detail="Cloud → Radio" />
            <MetricCard label="Cloud forwarded" value={metrics?.cloudForwarded ?? 0} detail="Logical messages" />
            <MetricCard label="Radio forwarded" value={metrics?.radioForwarded ?? 0} detail="Logical messages" />
            <MetricCard label="Duplicates blocked" value={metrics?.duplicatesSuppressed ?? 0} detail="Gateway dedupe" />
            <MetricCard label="Retries scheduled" value={metrics?.retriesScheduled ?? 0} detail="Durable queue" />
            <MetricCard label="Expired" value={metrics?.expired ?? 0} detail="TTL enforced" />
            <MetricCard label="Forward failures" value={metrics?.failures ?? 0} detail="Adapter errors" />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">Three-queue architecture</h2>
                <p className="mt-1 text-sm text-slate-500">Phone outbox and cloud mailbox already exist; 0.5 adds the durable gateway inbox/outbox bridge.</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Same messageId across transports</span>
            </div>
            <div className="mt-5 grid items-center gap-3 text-center md:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <FlowCard title="Field radio" detail="LoRa-side frame" active={radioAvailable} />
              <span className="text-xl text-slate-400">⇄</span>
              <FlowCard title="Gateway G1" detail={`${queue.length} durable queued`} active />
              <span className="text-xl text-slate-400">⇄</span>
              <FlowCard title="Cloud mailbox" detail={`${cloud.getMailbox().size} accepted`} active={internetAvailable} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">Durable gateway queues</h2>
                <p className="mt-1 text-sm text-slate-500">Pending items survive browser refresh through IndexedDB and retry when the required side recovers.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{queue.length} pending</span>
            </div>

            <div className="mt-4 space-y-2">
              {queue.map((item) => (
                <div key={item.key} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">{formatDirection(item.direction)}</span>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-900">{item.state}</span>
                  </div>
                  <p className="mt-2 break-all font-mono text-xs text-slate-500">{item.messageId}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>retry {item.retryCount}</span>
                    <span>created {formatAge(item.createdAt, now)}</span>
                    {item.lastFailureReason ? <span>{item.lastFailureReason}</span> : null}
                  </div>
                </div>
              ))}
              {queue.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Gateway queues are empty.</div> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">Gateway event timeline</h2>
                <p className="mt-1 text-sm text-slate-500">Ingress, durable queueing, route resolution, forwarding, retry and dedupe events.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">latest {latestTrace.length}</span>
            </div>
            <div className="mt-4 space-y-2">
              {latestTrace.map((event, index) => (
                <div key={`${event.at}-${event.type}-${index}`} className={`rounded-xl border p-3 ${traceClasses(event)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{event.type.replaceAll('-', ' ')}</span>
                    <span className="font-mono text-[11px] text-slate-500">{new Date(event.at).toLocaleTimeString()}</span>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-slate-700">{event.summary}</p>
                  {event.messageId ? <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{event.messageId}</p> : null}
                  {event.route ? <p className="mt-1 font-mono text-xs font-semibold text-blue-700">{event.route}</p> : null}
                </div>
              ))}
              {latestTrace.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Inject traffic to start the gateway trace.</div> : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function ConnectivityToggle({
  label,
  available,
  onChange,
}: {
  label: string
  available: boolean
  onChange: (available: boolean) => void
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className={`mt-0.5 text-xs font-semibold ${available ? 'text-emerald-700' : 'text-rose-700'}`}>{available ? 'ONLINE' : 'OFFLINE'}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!available)}
        aria-pressed={available}
        className={`rounded-full px-3 py-1.5 text-xs font-bold ${available ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
      >
        Turn {available ? 'off' : 'on'}
      </button>
    </div>
  )
}

function MetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  )
}

function FlowCard({ title, detail, active }: { title: string; detail: string; active: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${active ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
      <p className="font-bold text-slate-950">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
      <p className={`mt-2 text-[11px] font-bold uppercase tracking-wide ${active ? 'text-emerald-700' : 'text-rose-700'}`}>{active ? 'available' : 'unavailable'}</p>
    </div>
  )
}
