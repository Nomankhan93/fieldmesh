import type {
  MeshLinkConfig,
  MeshNodeConfig,
  MeshScenario,
  MeshSimulationResult,
  MeshTraceEvent,
  MeshTraceEventType,
} from '../../core/mesh/types'

export type TimelineFilter = 'all' | 'messages' | 'frames' | 'acks' | 'failures' | 'network'

export const TIMELINE_FILTERS: ReadonlyArray<{ id: TimelineFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'messages', label: 'Messages' },
  { id: 'frames', label: 'Frames' },
  { id: 'acks', label: 'ACKs' },
  { id: 'failures', label: 'Failures' },
  { id: 'network', label: 'Network' },
]

const EVENT_FILTERS: Record<Exclude<TimelineFilter, 'all'>, ReadonlySet<MeshTraceEventType>> = {
  messages: new Set(['message-created', 'message-delivered', 'message-expired', 'message-failed', 'retry-scheduled']),
  frames: new Set(['frame-sent', 'frame-received', 'frame-dropped', 'duplicate-scheduled', 'duplicate-suppressed']),
  acks: new Set(['ack-sent', 'ack-received', 'ack-dropped']),
  failures: new Set(['route-unavailable', 'frame-dropped', 'ack-dropped', 'message-expired', 'message-failed']),
  network: new Set(['route-selected', 'route-unavailable', 'node-state-changed', 'link-state-changed', 'link-quality-changed']),
}

export function filterTrace(
  trace: readonly MeshTraceEvent[],
  filter: TimelineFilter,
  query: string,
): MeshTraceEvent[] {
  const normalized = query.trim().toLowerCase()
  return trace.filter((event) => {
    if (filter !== 'all' && !EVENT_FILTERS[filter].has(event.type)) return false
    if (!normalized) return true
    return [event.type, event.summary, event.nodeId, event.linkId, event.frameId, event.route?.join(' ')]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalized))
  })
}

export function unorderedPairKey(a: string, b: string): string {
  return [a, b].sort((left, right) => left.localeCompare(right)).join('::')
}

export function getPreferredRoute(result: MeshSimulationResult): string[] | undefined {
  for (let index = result.trace.length - 1; index >= 0; index -= 1) {
    const event = result.trace[index]
    if ((event.type === 'message-delivered' || event.type === 'route-selected') && event.route) return event.route
  }
  return undefined
}

export function routePairKeys(route: readonly string[] | undefined): Set<string> {
  const keys = new Set<string>()
  if (!route) return keys
  for (let index = 0; index < route.length - 1; index += 1) {
    keys.add(unorderedPairKey(route[index], route[index + 1]))
  }
  return keys
}

export interface MeshLinkGroup {
  id: string
  a: string
  b: string
  directionIds: string[]
  state: 'online' | 'degraded' | 'offline'
  latencyMs: number
  jitterMs: number
  packetLossPercent: number
  ackLossPercent: number
  duplicatePercent: number
  framesSent: number
  framesDropped: number
  acksSent: number
  acksDropped: number
}

export function buildLinkGroups(
  links: readonly MeshLinkConfig[],
  finalLinkStates: Readonly<Record<string, boolean>>,
  trace: readonly MeshTraceEvent[],
): MeshLinkGroup[] {
  const grouped = new Map<string, MeshLinkConfig[]>()
  for (const link of links) {
    const key = unorderedPairKey(link.from, link.to)
    grouped.set(key, [...(grouped.get(key) ?? []), link])
  }

  return [...grouped.entries()]
    .map(([id, directions]) => {
      const [a, b] = id.split('::')
      const enabledCount = directions.filter((link) => finalLinkStates[link.id] ?? link.enabled).length
      const state = enabledCount === 0 ? 'offline' : enabledCount === directions.length ? 'online' : 'degraded'
      const directionIds = directions.map((link) => link.id)
      const related = trace.filter((event) => event.linkId && directionIds.includes(event.linkId))
      const mean = (pick: (link: MeshLinkConfig) => number) => Math.round(directions.reduce((sum, link) => sum + pick(link), 0) / directions.length)
      const max = (pick: (link: MeshLinkConfig) => number) => Math.max(...directions.map(pick))

      return {
        id,
        a,
        b,
        directionIds,
        state,
        latencyMs: mean((link) => link.latencyMs),
        jitterMs: max((link) => link.jitterMs),
        packetLossPercent: max((link) => link.packetLossPercent),
        ackLossPercent: max((link) => link.ackLossPercent),
        duplicatePercent: max((link) => link.duplicatePercent),
        framesSent: related.filter((event) => event.type === 'frame-sent').length,
        framesDropped: related.filter((event) => event.type === 'frame-dropped').length,
        acksSent: related.filter((event) => event.type === 'ack-sent').length,
        acksDropped: related.filter((event) => event.type === 'ack-dropped').length,
      } satisfies MeshLinkGroup
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

export interface MeshNodeStats {
  framesSent: number
  framesReceived: number
  acksSent: number
  drops: number
  stateChanges: number
  events: number
}

export function buildNodeStats(
  node: MeshNodeConfig,
  scenario: MeshScenario,
  result: MeshSimulationResult,
): MeshNodeStats {
  const outgoingLinkIds = new Set(scenario.links.filter((link) => link.from === node.id).map((link) => link.id))
  const incomingLinkIds = new Set(scenario.links.filter((link) => link.to === node.id).map((link) => link.id))
  const relevant = result.trace.filter((event) =>
    event.nodeId === node.id ||
    (event.linkId !== undefined && (outgoingLinkIds.has(event.linkId) || incomingLinkIds.has(event.linkId))),
  )

  return {
    framesSent: result.trace.filter((event) => event.type === 'frame-sent' && event.linkId && outgoingLinkIds.has(event.linkId)).length,
    framesReceived: result.trace.filter((event) => event.type === 'frame-received' && event.nodeId === node.id).length,
    acksSent: result.trace.filter((event) => event.type === 'ack-sent' && event.linkId && outgoingLinkIds.has(event.linkId)).length,
    drops: relevant.filter((event) => event.type === 'frame-dropped' || event.type === 'ack-dropped').length,
    stateChanges: result.trace.filter((event) => event.type === 'node-state-changed' && event.nodeId === node.id).length,
    events: relevant.length,
  }
}

export interface TopologyPoint {
  x: number
  y: number
}

export function buildTopologyPositions(scenario: MeshScenario): Record<string, TopologyPoint> {
  const positions: Record<string, TopologyPoint> = {}
  const source = scenario.message.sourceNodeId
  const destination = scenario.message.destinationNodeId
  positions[source] = { x: 90, y: 260 }
  positions[destination] = { x: 870, y: 260 }

  const relays = scenario.nodes.filter((node) => node.kind === 'relay' && node.id !== source && node.id !== destination)
  const relayPreset: TopologyPoint[] = [
    { x: 320, y: 260 },
    { x: 560, y: 140 },
    { x: 560, y: 380 },
    { x: 740, y: 120 },
    { x: 740, y: 400 },
  ]
  relays.forEach((node, index) => {
    const preset = relayPreset[index]
    if (preset) positions[node.id] = preset
    else {
      const angle = (index / Math.max(relays.length, 1)) * Math.PI * 2
      positions[node.id] = { x: 540 + Math.cos(angle) * 210, y: 260 + Math.sin(angle) * 150 }
    }
  })

  const gateways = scenario.nodes.filter((node) => node.kind === 'gateway' && node.id !== source && node.id !== destination)
  gateways.forEach((node, index) => {
    positions[node.id] = { x: 760 - index * 110, y: 455 }
  })

  const unplaced = scenario.nodes.filter((node) => !positions[node.id])
  unplaced.forEach((node, index) => {
    const step = 760 / Math.max(unplaced.length + 1, 2)
    positions[node.id] = { x: 100 + step * (index + 1), y: 70 }
  })

  return positions
}
