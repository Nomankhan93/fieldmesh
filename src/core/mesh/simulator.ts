import { createTransportFrame } from '../transport/frame'
import { createSeededRandom } from './random'
import type {
  MeshFault,
  MeshLinkConfig,
  MeshNodeConfig,
  MeshNodeState,
  MeshScenario,
  MeshSimulationMetrics,
  MeshSimulationResult,
  MeshSimulationStatus,
  MeshTraceEvent,
} from './types'

interface ScheduledEvent {
  at: number
  sequence: number
  kind: 'fault' | 'attempt' | 'frame-arrival' | 'ack-arrival' | 'expire'
  fault?: MeshFault
  attempt?: number
  route?: string[]
  hopIndex?: number
  frameId?: string
  duplicate?: boolean
}

interface MutableSimulationState {
  nodes: Map<string, MeshNodeConfig>
  links: Map<string, MeshLinkConfig>
  delivered: boolean
  acknowledged: boolean
  deliveredAt?: number
  acknowledgedAt?: number
  finalHopCount?: number
  expired: boolean
  failed: boolean
  seenFrameAtNode: Set<string>
  seenMessageAtDestination: boolean
  retryScheduledForAttempt: Set<number>
}

const EMPTY_PAYLOAD = new Uint8Array([0])

function cloneNodes(nodes: readonly MeshNodeConfig[]): Map<string, MeshNodeConfig> {
  return new Map(nodes.map((node) => [node.id, { ...node }]))
}

function cloneLinks(links: readonly MeshLinkConfig[]): Map<string, MeshLinkConfig> {
  return new Map(links.map((link) => [link.id, { ...link }]))
}

function isNodeAvailable(state: MeshNodeState): boolean {
  return state === 'online'
}

function validatePercent(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be between 0 and 100`)
  }
}

export function validateMeshScenario(scenario: MeshScenario): void {
  const nodeIds = new Set(scenario.nodes.map((node) => node.id))
  if (nodeIds.size !== scenario.nodes.length) throw new Error('Mesh node IDs must be unique')
  if (!nodeIds.has(scenario.message.sourceNodeId)) throw new Error('Message source node is missing')
  if (!nodeIds.has(scenario.message.destinationNodeId)) throw new Error('Message destination node is missing')
  if (scenario.message.ttlMs <= 0) throw new Error('Message TTL must be greater than zero')
  if (!Number.isInteger(scenario.message.hopLimit) || scenario.message.hopLimit < 1) throw new Error('Hop limit must be a positive integer')
  if (!Number.isInteger(scenario.message.maxAttempts) || scenario.message.maxAttempts < 1) throw new Error('Max attempts must be a positive integer')
  if (scenario.message.retryDelayMs < 0 || scenario.message.ackTimeoutMs < 0) throw new Error('Retry and ACK timeout values cannot be negative')

  const linkIds = new Set<string>()
  for (const link of scenario.links) {
    if (linkIds.has(link.id)) throw new Error(`Duplicate mesh link ID: ${link.id}`)
    linkIds.add(link.id)
    if (!nodeIds.has(link.from) || !nodeIds.has(link.to)) throw new Error(`Mesh link ${link.id} references a missing node`)
    if (link.latencyMs < 0 || link.jitterMs < 0) throw new Error(`Mesh link ${link.id} latency and jitter cannot be negative`)
    validatePercent(link.packetLossPercent, `${link.id} packet loss`)
    validatePercent(link.ackLossPercent, `${link.id} ACK loss`)
    validatePercent(link.duplicatePercent, `${link.id} duplicate rate`)
  }
}

function findRoute(
  sourceNodeId: string,
  destinationNodeId: string,
  nodes: ReadonlyMap<string, MeshNodeConfig>,
  links: ReadonlyMap<string, MeshLinkConfig>,
): string[] | undefined {
  if (!nodes.has(sourceNodeId) || !nodes.has(destinationNodeId)) return undefined
  if (!isNodeAvailable(nodes.get(sourceNodeId)?.state ?? 'offline')) return undefined
  if (!isNodeAvailable(nodes.get(destinationNodeId)?.state ?? 'offline')) return undefined

  const queue: string[][] = [[sourceNodeId]]
  const visited = new Set([sourceNodeId])

  while (queue.length > 0) {
    const path = queue.shift()
    if (!path) break
    const current = path[path.length - 1]
    if (current === destinationNodeId) return path

    for (const link of links.values()) {
      if (!link.enabled || link.from !== current || visited.has(link.to)) continue
      const target = nodes.get(link.to)
      if (!target || !isNodeAvailable(target.state)) continue
      visited.add(link.to)
      queue.push([...path, link.to])
    }
  }

  return undefined
}

function findLink(from: string, to: string, links: ReadonlyMap<string, MeshLinkConfig>): MeshLinkConfig | undefined {
  for (const link of links.values()) {
    if (link.from === from && link.to === to) return link
  }
  return undefined
}

export function runMeshSimulation(scenario: MeshScenario): MeshSimulationResult {
  validateMeshScenario(scenario)

  const random = createSeededRandom(scenario.seed)
  const state: MutableSimulationState = {
    nodes: cloneNodes(scenario.nodes),
    links: cloneLinks(scenario.links),
    delivered: false,
    acknowledged: false,
    expired: false,
    failed: false,
    seenFrameAtNode: new Set<string>(),
    seenMessageAtDestination: false,
    retryScheduledForAttempt: new Set<number>(),
  }

  const trace: MeshTraceEvent[] = []
  const metrics: MeshSimulationMetrics = {
    attempts: 0,
    framesSent: 0,
    framesReceived: 0,
    framesDropped: 0,
    acksSent: 0,
    acksDropped: 0,
    retriesScheduled: 0,
    duplicatesSuppressed: 0,
  }

  const expiresAt = scenario.message.createdAt + scenario.message.ttlMs
  let sequence = 0
  const queue: ScheduledEvent[] = []

  function push(event: Omit<ScheduledEvent, 'sequence'>): void {
    queue.push({ ...event, sequence: sequence++ })
    queue.sort((a, b) => a.at - b.at || a.sequence - b.sequence)
  }

  function record(event: MeshTraceEvent): void {
    trace.push(event)
  }

  function scheduleRetry(now: number, attempt: number, reason: string): void {
    if (state.acknowledged || state.expired) return
    if (state.retryScheduledForAttempt.has(attempt)) return

    if (attempt >= scenario.message.maxAttempts) {
      if (!state.delivered) {
        state.failed = true
        record({
          at: now,
          type: 'message-failed',
          attempt,
          summary: `Message failed after ${attempt} attempt(s): ${reason}.`,
        })
      }
      return
    }

    const retryAt = now + scenario.message.retryDelayMs
    if (retryAt >= expiresAt) {
      push({ at: expiresAt, kind: 'expire' })
      return
    }

    state.retryScheduledForAttempt.add(attempt)
    metrics.retriesScheduled += 1
    record({
      at: now,
      type: 'retry-scheduled',
      attempt,
      summary: `Retry ${attempt + 1} scheduled at ${retryAt} ms because ${reason}.`,
    })
    push({ at: retryAt, kind: 'attempt', attempt: attempt + 1 })
  }

  function scheduleFrameHop(now: number, route: string[], hopIndex: number, attempt: number, frameId: string): void {
    if (state.acknowledged || state.expired) return
    if (now >= expiresAt) {
      push({ at: expiresAt, kind: 'expire' })
      return
    }

    const from = route[hopIndex]
    const to = route[hopIndex + 1]
    if (!from || !to) return

    const fromNode = state.nodes.get(from)
    const toNode = state.nodes.get(to)
    const link = findLink(from, to, state.links)

    if (!fromNode || !toNode || !isNodeAvailable(fromNode.state) || !isNodeAvailable(toNode.state) || !link?.enabled) {
      metrics.framesDropped += 1
      record({
        at: now,
        type: 'frame-dropped',
        attempt,
        nodeId: to,
        linkId: link?.id,
        frameId,
        summary: `${from} → ${to} dropped because the node or link is unavailable.`,
      })
      scheduleRetry(now, attempt, 'the selected route became unavailable')
      return
    }

    metrics.framesSent += 1
    record({
      at: now,
      type: 'frame-sent',
      attempt,
      linkId: link.id,
      frameId,
      summary: `${from} → ${to} frame sent.`,
    })

    const latency = Math.max(0, link.latencyMs + random.signed(link.jitterMs))
    const arrivalAt = now + latency

    if (random.percent(link.packetLossPercent)) {
      metrics.framesDropped += 1
      record({
        at: arrivalAt,
        type: 'frame-dropped',
        attempt,
        nodeId: to,
        linkId: link.id,
        frameId,
        summary: `${from} → ${to} frame dropped by packet-loss simulation.`,
      })
      scheduleRetry(arrivalAt, attempt, `packet loss on ${link.id}`)
      return
    }

    push({
      at: arrivalAt,
      kind: 'frame-arrival',
      attempt,
      route,
      hopIndex: hopIndex + 1,
      frameId,
      duplicate: false,
    })

    if (random.percent(link.duplicatePercent)) {
      record({
        at: now,
        type: 'duplicate-scheduled',
        attempt,
        linkId: link.id,
        frameId,
        summary: `A duplicate frame was injected on ${link.id}.`,
      })
      push({
        at: arrivalAt + 1,
        kind: 'frame-arrival',
        attempt,
        route,
        hopIndex: hopIndex + 1,
        frameId,
        duplicate: true,
      })
    }
  }

  function scheduleAckHop(now: number, route: string[], hopIndex: number, attempt: number, frameId: string): void {
    if (state.acknowledged || state.expired) return

    const from = route[hopIndex]
    const to = route[hopIndex + 1]
    if (!from || !to) return

    const link = findLink(from, to, state.links)
    const fromNode = state.nodes.get(from)
    const toNode = state.nodes.get(to)

    if (!link?.enabled || !fromNode || !toNode || !isNodeAvailable(fromNode.state) || !isNodeAvailable(toNode.state)) {
      metrics.acksDropped += 1
      record({
        at: now,
        type: 'ack-dropped',
        attempt,
        linkId: link?.id,
        frameId,
        summary: `ACK ${from} → ${to} could not use the reverse route.`,
      })
      scheduleRetry(now + scenario.message.ackTimeoutMs, attempt, 'delivery ACK route unavailable')
      return
    }

    metrics.acksSent += 1
    record({
      at: now,
      type: 'ack-sent',
      attempt,
      linkId: link.id,
      frameId,
      summary: `ACK ${from} → ${to} sent.`,
    })

    const latency = Math.max(0, link.latencyMs + random.signed(link.jitterMs))
    const arrivalAt = now + latency
    if (random.percent(link.ackLossPercent)) {
      metrics.acksDropped += 1
      record({
        at: arrivalAt,
        type: 'ack-dropped',
        attempt,
        linkId: link.id,
        frameId,
        summary: `ACK ${from} → ${to} lost.`,
      })
      scheduleRetry(arrivalAt + scenario.message.ackTimeoutMs, attempt, `ACK loss on ${link.id}`)
      return
    }

    push({
      at: arrivalAt,
      kind: 'ack-arrival',
      attempt,
      route,
      hopIndex: hopIndex + 1,
      frameId,
    })
  }

  record({
    at: scenario.message.createdAt,
    type: 'message-created',
    summary: `${scenario.message.id} created at ${scenario.message.sourceNodeId}.`,
  })

  for (const fault of scenario.faults) push({ at: fault.at, kind: 'fault', fault })
  push({ at: scenario.message.createdAt, kind: 'attempt', attempt: 1 })
  push({ at: expiresAt, kind: 'expire' })

  while (queue.length > 0) {
    const event = queue.shift()
    if (!event) break

    if (event.kind === 'expire') {
      if (!state.acknowledged && !state.failed && !state.delivered && event.at >= expiresAt) {
        state.expired = true
        record({
          at: expiresAt,
          type: 'message-expired',
          summary: `${scenario.message.id} expired before application delivery.`,
        })
      }
      continue
    }

    if (state.acknowledged || state.expired || state.failed) {
      if (event.kind !== 'fault') continue
    }

    if (event.kind === 'fault') {
      const fault = event.fault
      if (!fault) continue
      if (fault.type === 'node-state') {
        const node = state.nodes.get(fault.nodeId)
        if (node) {
          node.state = fault.state
          record({
            at: event.at,
            type: 'node-state-changed',
            nodeId: node.id,
            summary: `${node.label} changed to ${fault.state}.`,
          })
        }
      } else if (fault.type === 'link-state') {
        const link = state.links.get(fault.linkId)
        if (link) {
          link.enabled = fault.enabled
          record({
            at: event.at,
            type: 'link-state-changed',
            linkId: link.id,
            summary: `${link.id} changed to ${fault.enabled ? 'online' : 'offline'}.`,
          })
        }
      } else {
        const link = state.links.get(fault.linkId)
        if (link) {
          Object.assign(link, fault.patch)
          record({
            at: event.at,
            type: 'link-quality-changed',
            linkId: link.id,
            summary: `${link.id} quality parameters changed.`,
          })
        }
      }
      continue
    }

    if (event.kind === 'attempt') {
      const attempt = event.attempt ?? 1
      if (state.acknowledged) continue
      if (event.at >= expiresAt) continue

      metrics.attempts = Math.max(metrics.attempts, attempt)
      const frameId = `frame:${scenario.message.id}:${attempt}`
      createTransportFrame({
        messageId: scenario.message.id,
        sourceNodeId: scenario.message.sourceNodeId,
        destinationNodeId: scenario.message.destinationNodeId,
        createdAt: event.at,
        expiresAt,
        attempt,
        hopLimit: scenario.message.hopLimit,
        payload: EMPTY_PAYLOAD,
        frameId,
      })

      record({
        at: event.at,
        type: 'attempt-started',
        attempt,
        frameId,
        summary: `Attempt ${attempt} started with ${frameId}.`,
      })

      const route = findRoute(
        scenario.message.sourceNodeId,
        scenario.message.destinationNodeId,
        state.nodes,
        state.links,
      )

      if (!route) {
        record({
          at: event.at,
          type: 'route-unavailable',
          attempt,
          frameId,
          summary: 'No currently available route reaches the destination.',
        })
        scheduleRetry(event.at, attempt, 'no route is available')
        continue
      }

      const hopCount = route.length - 1
      if (hopCount > scenario.message.hopLimit) {
        record({
          at: event.at,
          type: 'route-unavailable',
          attempt,
          frameId,
          route,
          summary: `Route needs ${hopCount} hops but hop limit is ${scenario.message.hopLimit}.`,
        })
        scheduleRetry(event.at, attempt, 'hop limit rejected the route')
        continue
      }

      record({
        at: event.at,
        type: 'route-selected',
        attempt,
        frameId,
        route,
        summary: `Route selected: ${route.join(' → ')}.`,
      })
      scheduleFrameHop(event.at, route, 0, attempt, frameId)
      continue
    }

    if (event.kind === 'frame-arrival') {
      const route = event.route
      const hopIndex = event.hopIndex
      const attempt = event.attempt
      const frameId = event.frameId
      if (!route || hopIndex === undefined || attempt === undefined || !frameId) continue

      const nodeId = route[hopIndex]
      const node = state.nodes.get(nodeId)
      if (!node || !isNodeAvailable(node.state)) {
        metrics.framesDropped += 1
        record({
          at: event.at,
          type: 'frame-dropped',
          attempt,
          nodeId,
          frameId,
          summary: `${nodeId} could not receive the frame because it is unavailable.`,
        })
        scheduleRetry(event.at, attempt, `${nodeId} is unavailable`)
        continue
      }

      const seenKey = `${frameId}:${nodeId}`
      if (state.seenFrameAtNode.has(seenKey)) {
        metrics.duplicatesSuppressed += 1
        record({
          at: event.at,
          type: 'duplicate-suppressed',
          attempt,
          nodeId,
          frameId,
          summary: `${nodeId} suppressed a duplicate copy of ${frameId}.`,
        })
        continue
      }
      state.seenFrameAtNode.add(seenKey)
      metrics.framesReceived += 1
      record({
        at: event.at,
        type: 'frame-received',
        attempt,
        nodeId,
        frameId,
        summary: `${nodeId} received ${frameId}${event.duplicate ? ' (duplicate injection)' : ''}.`,
      })

      const isDestination = nodeId === scenario.message.destinationNodeId
      if (isDestination) {
        if (state.seenMessageAtDestination) {
          metrics.duplicatesSuppressed += 1
          record({
            at: event.at,
            type: 'duplicate-suppressed',
            attempt,
            nodeId,
            frameId,
            summary: `${nodeId} already persisted ${scenario.message.id}; duplicate logical delivery suppressed.`,
          })
        } else {
          state.seenMessageAtDestination = true
          state.delivered = true
          state.deliveredAt = event.at
          state.finalHopCount = route.length - 1
          metrics.deliveredAt = event.at
          metrics.deliveryLatencyMs = event.at - scenario.message.createdAt
          metrics.finalHopCount = route.length - 1
          record({
            at: event.at,
            type: 'message-delivered',
            attempt,
            nodeId,
            frameId,
            route,
            summary: `${scenario.message.id} persisted at ${nodeId}.`,
          })
        }

        const reverseRoute = findRoute(
          scenario.message.destinationNodeId,
          scenario.message.sourceNodeId,
          state.nodes,
          state.links,
        )
        if (!reverseRoute) {
          metrics.acksDropped += 1
          record({
            at: event.at,
            type: 'ack-dropped',
            attempt,
            nodeId,
            frameId,
            summary: 'Destination received the message but no reverse ACK route exists.',
          })
          scheduleRetry(event.at + scenario.message.ackTimeoutMs, attempt, 'no reverse ACK route')
        } else {
          scheduleAckHop(event.at, reverseRoute, 0, attempt, frameId)
        }
        continue
      }

      scheduleFrameHop(event.at, route, hopIndex, attempt, frameId)
      continue
    }

    if (event.kind === 'ack-arrival') {
      const route = event.route
      const hopIndex = event.hopIndex
      const attempt = event.attempt
      const frameId = event.frameId
      if (!route || hopIndex === undefined || attempt === undefined || !frameId) continue

      const nodeId = route[hopIndex]
      if (nodeId === scenario.message.sourceNodeId) {
        state.acknowledged = true
        state.acknowledgedAt = event.at
        metrics.acknowledgedAt = event.at
        metrics.acknowledgementLatencyMs = event.at - scenario.message.createdAt
        record({
          at: event.at,
          type: 'ack-received',
          attempt,
          nodeId,
          frameId,
          summary: `Sender received delivery ACK for ${scenario.message.id}.`,
        })
      } else {
        scheduleAckHop(event.at, route, hopIndex, attempt, frameId)
      }
    }
  }

  let status: MeshSimulationStatus
  if (state.acknowledged) status = 'acknowledged'
  else if (state.expired) status = 'expired'
  else if (state.delivered) status = 'delivered-unacknowledged'
  else status = 'failed'

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    seed: scenario.seed,
    messageId: scenario.message.id,
    status,
    delivered: state.delivered,
    acknowledged: state.acknowledged,
    trace,
    metrics,
    finalNodeStates: Object.fromEntries([...state.nodes.entries()].map(([id, node]) => [id, node.state])),
    finalLinkStates: Object.fromEntries([...state.links.entries()].map(([id, link]) => [id, link.enabled])),
  }
}
