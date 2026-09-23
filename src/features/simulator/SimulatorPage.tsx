import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { MESH_SCENARIOS, getMeshScenario } from '../../core/mesh/scenarios'
import { runMeshSimulation } from '../../core/mesh/simulator'
import type {
  MeshNodeConfig,
  MeshNodeState,
  MeshScenario,
  MeshSimulationResult,
  MeshSimulationStatus,
  MeshTraceEvent,
} from '../../core/mesh/types'
import {
  TIMELINE_FILTERS,
  buildLinkGroups,
  buildNodeStats,
  buildTopologyPositions,
  filterTrace,
  getPreferredRoute,
  routePairKeys,
  type MeshLinkGroup,
  type TimelineFilter,
} from './simulatorView'

interface LabControls {
  seed: number
  packetLossPercent: number
  ackLossPercent: number
  duplicatePercent: number
  jitterMs: number
}

interface RunSpec extends LabControls {
  scenarioId: string
}

type InspectorSelection =
  | { kind: 'node'; id: string }
  | { kind: 'link'; id: string }

const DEFAULT_CONTROLS: Omit<LabControls, 'seed'> = {
  packetLossPercent: 0,
  ackLossPercent: 0,
  duplicatePercent: 0,
  jitterMs: 20,
}

const EVENT_PAGE_SIZE = 80

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(3)}s`
}

function formatStatus(status: MeshSimulationStatus): string {
  return status.replaceAll('-', ' ')
}

function statusClasses(status: MeshSimulationStatus): string {
  if (status === 'acknowledged') return 'bg-emerald-100 text-emerald-800'
  if (status === 'delivered-unacknowledged') return 'bg-sky-100 text-sky-800'
  if (status === 'expired') return 'bg-amber-100 text-amber-900'
  return 'bg-rose-100 text-rose-800'
}

function eventClasses(event: MeshTraceEvent): string {
  if (event.type === 'message-delivered' || event.type === 'ack-received') return 'border-emerald-200 bg-emerald-50'
  if (event.type === 'frame-dropped' || event.type === 'ack-dropped' || event.type === 'message-failed') return 'border-rose-200 bg-rose-50'
  if (event.type === 'retry-scheduled' || event.type === 'message-expired') return 'border-amber-200 bg-amber-50'
  if (event.type === 'node-state-changed' || event.type === 'link-state-changed' || event.type === 'link-quality-changed') return 'border-violet-200 bg-violet-50'
  if (event.type === 'duplicate-scheduled' || event.type === 'duplicate-suppressed') return 'border-fuchsia-200 bg-fuchsia-50'
  return 'border-slate-200 bg-white'
}

function applyLabOverrides(scenario: MeshScenario, overrides: LabControls): MeshScenario {
  return {
    ...scenario,
    seed: overrides.seed,
    links: scenario.links.map((link) => ({
      ...link,
      packetLossPercent: Math.max(link.packetLossPercent, overrides.packetLossPercent),
      ackLossPercent: Math.max(link.ackLossPercent, overrides.ackLossPercent),
      duplicatePercent: Math.max(link.duplicatePercent, overrides.duplicatePercent),
      jitterMs: Math.max(link.jitterMs, overrides.jitterMs),
    })),
  }
}

function controlsForScenario(scenario: MeshScenario): LabControls {
  return { seed: scenario.seed, ...DEFAULT_CONTROLS }
}

function sameControls(left: RunSpec, right: RunSpec): boolean {
  return left.scenarioId === right.scenarioId &&
    left.seed === right.seed &&
    left.packetLossPercent === right.packetLossPercent &&
    left.ackLossPercent === right.ackLossPercent &&
    left.duplicatePercent === right.duplicatePercent &&
    left.jitterMs === right.jitterMs
}

function isBaselineRun(run: RunSpec, scenario: MeshScenario): boolean {
  return run.scenarioId === scenario.id &&
    run.seed === scenario.seed &&
    run.packetLossPercent === 0 &&
    run.ackLossPercent === 0 &&
    run.duplicatePercent === 0 &&
    run.jitterMs === 20
}

function randomSeed(): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return buffer[0] % 1_000_000_000
}

export function SimulatorPage() {
  const initialScenario = MESH_SCENARIOS[0]
  const initialControls = controlsForScenario(initialScenario)
  const [scenarioId, setScenarioId] = useState(initialScenario.id)
  const [draft, setDraft] = useState<LabControls>(initialControls)
  const [activeRun, setActiveRun] = useState<RunSpec>({ scenarioId: initialScenario.id, ...initialControls })
  const [selection, setSelection] = useState<InspectorSelection>({ kind: 'node', id: initialScenario.message.sourceNodeId })
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all')
  const [timelineQuery, setTimelineQuery] = useState('')
  const [showAllEvents, setShowAllEvents] = useState(false)

  const selectedScenario = useMemo(() => getMeshScenario(scenarioId), [scenarioId])
  const scenario = useMemo(() => {
    const base = getMeshScenario(activeRun.scenarioId)
    return applyLabOverrides(base, activeRun)
  }, [activeRun])
  const result = useMemo(() => runMeshSimulation(scenario), [scenario])
  const baseForActiveRun = useMemo(() => getMeshScenario(activeRun.scenarioId), [activeRun.scenarioId])
  const pendingRun: RunSpec = { scenarioId, ...draft }
  const hasPendingChanges = !sameControls(activeRun, pendingRun)
  const baselineRun = isBaselineRun(activeRun, baseForActiveRun)
  const expectationPassed = result.status === baseForActiveRun.expectation.status

  const route = useMemo(() => getPreferredRoute(result), [result])
  const routeEdges = useMemo(() => routePairKeys(route), [route])
  const linkGroups = useMemo(
    () => buildLinkGroups(scenario.links, result.finalLinkStates, result.trace),
    [scenario.links, result.finalLinkStates, result.trace],
  )
  const positions = useMemo(() => buildTopologyPositions(scenario), [scenario])
  const filteredTrace = useMemo(
    () => filterTrace(result.trace, timelineFilter, timelineQuery),
    [result.trace, timelineFilter, timelineQuery],
  )
  const visibleTrace = showAllEvents ? filteredTrace : filteredTrace.slice(0, EVENT_PAGE_SIZE)

  function selectScenario(nextId: string) {
    const next = getMeshScenario(nextId)
    const controls = controlsForScenario(next)
    setScenarioId(next.id)
    setDraft(controls)
    setActiveRun({ scenarioId: next.id, ...controls })
    setSelection({ kind: 'node', id: next.message.sourceNodeId })
    setTimelineFilter('all')
    setTimelineQuery('')
    setShowAllEvents(false)
  }

  function runSimulation() {
    setActiveRun({ scenarioId, ...draft })
    setShowAllEvents(false)
  }

  function replaySameSeed() {
    setActiveRun((current) => ({ ...current }))
    setShowAllEvents(false)
  }

  function chooseRandomSeed() {
    setDraft((current) => ({ ...current, seed: randomSeed() }))
  }

  return (
    <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">FieldMesh 0.4.1</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Mesh Visualization & Simulator UX Hardening</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            Deterministic virtual-time mesh diagnostics with interactive topology, scenario verdicts, node/link inspection and trace filtering. Simulated radio — no physical transmission.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Identity</Link>
          <Link to="/messages" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Internet messages</Link>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-950">Scenario</h2>
              {hasPendingChanges ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-900">Pending changes</span> : null}
            </div>
            <select
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              value={scenarioId}
              onChange={(event) => selectScenario(event.target.value)}
            >
              {MESH_SCENARIOS.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <p className="mt-3 text-sm leading-6 text-slate-600">{selectedScenario.description}</p>
            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Expected baseline outcome</p>
              <p className="mt-1 text-sm font-semibold capitalize text-slate-900">{formatStatus(selectedScenario.expectation.status)}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{selectedScenario.expectation.summary}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100">
            <h2 className="font-semibold text-slate-950">Deterministic controls</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">The same scenario, settings and seed reproduce the same trace. Overrides can only add failure pressure to built-in link settings.</p>

            <label className="mt-4 block text-sm">
              <span className="font-medium">Seed</span>
              <input
                type="number"
                value={draft.seed}
                onChange={(event) => setDraft((current) => ({ ...current, seed: Number(event.target.value) || 0 }))}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <button type="button" onClick={chooseRandomSeed} className="mt-2 text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-950">
              Generate reproducible seed
            </button>

            <Slider label="Minimum packet loss" value={draft.packetLossPercent} suffix="%" max={100} step={5} onChange={(value) => setDraft((current) => ({ ...current, packetLossPercent: value }))} />
            <Slider label="Minimum ACK loss" value={draft.ackLossPercent} suffix="%" max={100} step={5} onChange={(value) => setDraft((current) => ({ ...current, ackLossPercent: value }))} />
            <Slider label="Minimum duplicate rate" value={draft.duplicatePercent} suffix="%" max={100} step={5} onChange={(value) => setDraft((current) => ({ ...current, duplicatePercent: value }))} />
            <Slider label="Minimum jitter" value={draft.jitterMs} suffix=" ms" max={500} step={10} onChange={(value) => setDraft((current) => ({ ...current, jitterMs: value }))} />

            <div className="mt-5 grid gap-2">
              <button type="button" onClick={runSimulation} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
                Run simulation
              </button>
              <button type="button" onClick={replaySameSeed} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Replay same seed
              </button>
            </div>
          </section>

          <Legend />
        </aside>

        <div className="space-y-5">
          <SimulationSummary
            result={result}
            expectedStatus={baseForActiveRun.expectation.status}
            expectationSummary={baseForActiveRun.expectation.summary}
            baselineRun={baselineRun}
            expectationPassed={expectationPassed}
          />

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">Interactive topology</h2>
                <p className="mt-1 text-sm text-slate-500">Select a node or link for diagnostics. The delivered route is highlighted when available.</p>
              </div>
              {route ? <span className="rounded-full bg-blue-50 px-3 py-1.5 font-mono text-xs font-semibold text-blue-700">{route.join(' → ')}</span> : <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">No delivered route</span>}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <TopologyGraph
                scenario={scenario}
                result={result}
                linkGroups={linkGroups}
                positions={positions}
                routeEdges={routeEdges}
                selection={selection}
                onSelect={setSelection}
              />
              <Inspector scenario={scenario} result={result} linkGroups={linkGroups} selection={selection} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">Packet timeline</h2>
                <p className="mt-1 text-sm text-slate-500">Virtual time with message, frame, ACK, failure and network-state filtering.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{filteredTrace.length} of {result.trace.length} events</span>
            </div>

            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {TIMELINE_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => {
                      setTimelineFilter(filter.id)
                      setShowAllEvents(false)
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${timelineFilter === filter.id ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <input
                value={timelineQuery}
                onChange={(event) => {
                  setTimelineQuery(event.target.value)
                  setShowAllEvents(false)
                }}
                placeholder="Search node, link, frame or event…"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm lg:max-w-sm"
              />
            </div>

            <div className="mt-4 space-y-2">
              {visibleTrace.map((event, index) => (
                <div key={`${event.at}-${event.type}-${index}`} className={`rounded-xl border p-3 ${eventClasses(event)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-slate-700">{formatTime(event.at)}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{event.type}</span>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-slate-700">{event.summary}</p>
                  {event.route ? <p className="mt-1 font-mono text-xs text-slate-500">{event.route.join(' → ')}</p> : null}
                  {(event.nodeId || event.linkId || event.frameId) ? (
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {event.nodeId ? <span>node {event.nodeId}</span> : null}
                      {event.linkId ? <span>link {event.linkId}</span> : null}
                      {event.frameId ? <span className="normal-case tracking-normal">{event.frameId}</span> : null}
                    </div>
                  ) : null}
                </div>
              ))}
              {visibleTrace.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No events match this filter.</div> : null}
            </div>

            {!showAllEvents && filteredTrace.length > EVENT_PAGE_SIZE ? (
              <button type="button" onClick={() => setShowAllEvents(true)} className="mt-4 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                Show all {filteredTrace.length} events
              </button>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  )
}

function Slider({
  label,
  value,
  suffix,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  suffix: string
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="mt-4 block text-sm">
      <span className="flex justify-between gap-3"><span>{label}</span><span className="font-semibold text-slate-700">{value}{suffix}</span></span>
      <input className="mt-2 w-full accent-slate-900" type="range" min="0" max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function SimulationSummary({
  result,
  expectedStatus,
  expectationSummary,
  baselineRun,
  expectationPassed,
}: {
  result: MeshSimulationResult
  expectedStatus: MeshSimulationStatus
  expectationSummary: string
  baselineRun: boolean
  expectationPassed: boolean
}) {
  const verdictLabel = baselineRun ? (expectationPassed ? 'Scenario PASS' : 'Scenario FAIL') : 'Custom run'
  const verdictClasses = baselineRun
    ? (expectationPassed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800')
    : 'border-blue-200 bg-blue-50 text-blue-800'

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-950">Simulation result</h2>
          <p className="mt-1 text-sm text-slate-500">{result.messageId} · seed {result.seed}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1.5 text-sm font-bold capitalize ${statusClasses(result.status)}`}>{formatStatus(result.status)}</span>
          <span className={`rounded-full border px-3 py-1.5 text-sm font-bold ${verdictClasses}`}>{verdictLabel}</span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <PrimaryMetric label="Application delivery" value={result.metrics.deliveryLatencyMs === undefined ? '—' : formatTime(result.metrics.deliveryLatencyMs)} detail="Destination persisted the logical message" />
        <PrimaryMetric label="Sender confirmation" value={result.metrics.acknowledgementLatencyMs === undefined ? '—' : formatTime(result.metrics.acknowledgementLatencyMs)} detail="Delivery ACK returned to the sender" />
        <PrimaryMetric label="Delivered route" value={result.metrics.finalHopCount === undefined ? '—' : `${result.metrics.finalHopCount} hops`} detail="Final application-delivery path" />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Attempts" value={result.metrics.attempts} />
        <Metric label="Frames sent" value={result.metrics.framesSent} />
        <Metric label="Frames dropped" value={result.metrics.framesDropped} />
        <Metric label="Retries" value={result.metrics.retriesScheduled} />
        <Metric label="ACKs dropped" value={result.metrics.acksDropped} />
        <Metric label="Duplicates suppressed" value={result.metrics.duplicatesSuppressed} />
      </div>

      <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[180px_180px_minmax(0,1fr)]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Expected</p>
          <p className="mt-1 text-sm font-semibold capitalize text-slate-900">{formatStatus(expectedStatus)}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Actual</p>
          <p className="mt-1 text-sm font-semibold capitalize text-slate-900">{formatStatus(result.status)}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Baseline contract</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{baselineRun ? expectationSummary : 'Custom seed or failure-pressure overrides are active, so the built-in baseline PASS/FAIL contract is shown for reference only.'}</p>
        </div>
      </div>
    </section>
  )
}

function TopologyGraph({
  scenario,
  result,
  linkGroups,
  positions,
  routeEdges,
  selection,
  onSelect,
}: {
  scenario: MeshScenario
  result: MeshSimulationResult
  linkGroups: MeshLinkGroup[]
  positions: Record<string, { x: number; y: number }>
  routeEdges: ReadonlySet<string>
  selection: InspectorSelection
  onSelect: (selection: InspectorSelection) => void
}) {
  return (
    <div className="min-h-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2 sm:min-h-[460px]">
      <svg viewBox="0 0 960 520" className="h-full min-h-[340px] w-full sm:min-h-[440px]" role="img" aria-label="FieldMesh simulated network topology">
        <defs>
          <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.12" />
          </filter>
        </defs>

        {linkGroups.map((group) => {
          const start = positions[group.a]
          const end = positions[group.b]
          if (!start || !end) return null
          const active = routeEdges.has(group.id)
          const selected = selection.kind === 'link' && selection.id === group.id
          const stroke = group.state === 'offline' ? '#e11d48' : group.state === 'degraded' ? '#d97706' : active ? '#2563eb' : '#cbd5e1'
          const dash = group.state === 'offline' ? '10 8' : group.state === 'degraded' ? '5 6' : undefined
          return (
            <g
              key={group.id}
              role="button"
              tabIndex={0}
              className="cursor-pointer outline-none"
              onClick={() => onSelect({ kind: 'link', id: group.id })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect({ kind: 'link', id: group.id })
              }}
            >
              <title>{group.a} ↔ {group.b}: {group.state}, {group.latencyMs} ms, loss {group.packetLossPercent}%</title>
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth="24" />
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={stroke}
                strokeWidth={selected ? 8 : active ? 6 : 4}
                strokeDasharray={dash}
                strokeLinecap="round"
              />
              {selected ? <circle cx={(start.x + end.x) / 2} cy={(start.y + end.y) / 2} r="7" fill={stroke} /> : null}
            </g>
          )
        })}

        {scenario.nodes.map((node) => {
          const point = positions[node.id]
          if (!point) return null
          const state = result.finalNodeStates[node.id] ?? node.state
          const selected = selection.kind === 'node' && selection.id === node.id
          return (
            <TopologyNode
              key={node.id}
              node={node}
              state={state}
              x={point.x}
              y={point.y}
              selected={selected}
              onSelect={() => onSelect({ kind: 'node', id: node.id })}
            />
          )
        })}
      </svg>
    </div>
  )
}

function TopologyNode({
  node,
  state,
  x,
  y,
  selected,
  onSelect,
}: {
  node: MeshNodeConfig
  state: MeshNodeState
  x: number
  y: number
  selected: boolean
  onSelect: () => void
}) {
  const stateColor = state === 'online' ? '#059669' : state === 'restarting' ? '#d97706' : state === 'partitioned' ? '#7c3aed' : '#e11d48'
  const fill = node.kind === 'gateway' ? '#f5f3ff' : node.kind === 'relay' ? '#eff6ff' : '#ffffff'
  const stroke = selected ? '#0f172a' : stateColor

  return (
    <g
      role="button"
      tabIndex={0}
      className="cursor-pointer outline-none"
      transform={`translate(${x} ${y})`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect()
      }}
    >
      <title>{node.label}: {node.kind}, final state {state}</title>
      {node.kind === 'user' ? <circle r="34" fill={fill} stroke={stroke} strokeWidth={selected ? 6 : 4} filter="url(#node-shadow)" /> : null}
      {node.kind === 'relay' ? <polygon points="0,-40 40,0 0,40 -40,0" fill={fill} stroke={stroke} strokeWidth={selected ? 6 : 4} filter="url(#node-shadow)" /> : null}
      {node.kind === 'gateway' ? <rect x="-38" y="-32" width="76" height="64" rx="12" fill={fill} stroke={stroke} strokeWidth={selected ? 6 : 4} filter="url(#node-shadow)" /> : null}
      <circle cx="27" cy="-28" r="7" fill={stateColor} stroke="#fff" strokeWidth="3" />
      <text x="0" y="6" textAnchor="middle" fontSize="18" fontWeight="800" fill="#0f172a">{node.id}</text>
      <text x="0" y="62" textAnchor="middle" fontSize="13" fontWeight="700" fill="#475569">{node.kind}</text>
      <text x="0" y="80" textAnchor="middle" fontSize="12" fill="#64748b">{state}</text>
    </g>
  )
}

function Inspector({
  scenario,
  result,
  linkGroups,
  selection,
}: {
  scenario: MeshScenario
  result: MeshSimulationResult
  linkGroups: MeshLinkGroup[]
  selection: InspectorSelection
}) {
  if (selection.kind === 'link') {
    const link = linkGroups.find((item) => item.id === selection.id)
    if (!link) return <InspectorEmpty />
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Link inspector</p>
        <h3 className="mt-1 text-xl font-bold text-slate-950">{link.a} ↔ {link.b}</h3>
        <p className="mt-1 text-sm capitalize text-slate-500">Final state: {link.state}</p>
        <InspectorGrid rows={[
          ['Latency', `${link.latencyMs} ms`],
          ['Jitter', `${link.jitterMs} ms`],
          ['Packet loss', `${link.packetLossPercent}%`],
          ['ACK loss', `${link.ackLossPercent}%`],
          ['Duplicate rate', `${link.duplicatePercent}%`],
          ['Directions', link.directionIds.length],
          ['Frames sent', link.framesSent],
          ['Frames dropped', link.framesDropped],
          ['ACKs sent', link.acksSent],
          ['ACKs dropped', link.acksDropped],
        ]} />
        <p className="mt-4 break-words font-mono text-[11px] leading-5 text-slate-500">{link.directionIds.join(' · ')}</p>
      </div>
    )
  }

  const node = scenario.nodes.find((item) => item.id === selection.id)
  if (!node) return <InspectorEmpty />
  const stats = buildNodeStats(node, scenario, result)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Node inspector</p>
      <h3 className="mt-1 text-xl font-bold text-slate-950">{node.label}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase text-slate-600">{node.kind}</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">{result.finalNodeStates[node.id]}</span>
      </div>
      <InspectorGrid rows={[
        ['Frames TX', stats.framesSent],
        ['Frames RX', stats.framesReceived],
        ['ACKs TX', stats.acksSent],
        ['Drops', stats.drops],
        ['State changes', stats.stateChanges],
        ['Related events', stats.events],
      ]} />
    </div>
  )
}

function InspectorGrid({ rows }: { rows: ReadonlyArray<readonly [string, string | number]> }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-slate-50 p-3">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-1 text-sm font-bold text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function InspectorEmpty() {
  return <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">Select a node or link in the topology.</div>
}

function Legend() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100">
      <h2 className="font-semibold text-slate-950">Topology legend</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
        <LegendItem swatch="rounded-full border-2 border-slate-400" label="User" />
        <LegendItem swatch="rotate-45 border-2 border-slate-400" label="Relay" />
        <LegendItem swatch="rounded border-2 border-slate-400" label="Gateway" />
        <LegendItem swatch="rounded-full bg-emerald-600" label="Online" />
        <LegendItem swatch="rounded-full bg-amber-600" label="Restarting/degraded" />
        <LegendItem swatch="rounded-full bg-rose-600" label="Offline/broken" />
        <LegendItem swatch="h-1 bg-blue-600" label="Delivered route" />
        <LegendItem swatch="h-1 bg-slate-300" label="Available link" />
      </div>
    </section>
  )
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
      <span className={`inline-block h-3 w-3 shrink-0 ${swatch}`} />
      <span>{label}</span>
    </div>
  )
}

function PrimaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  )
}
