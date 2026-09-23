export type MeshNodeKind = 'user' | 'relay' | 'gateway'
export type MeshNodeState = 'online' | 'offline' | 'restarting' | 'partitioned'

export interface MeshNodeConfig {
  id: string
  label: string
  kind: MeshNodeKind
  state: MeshNodeState
}

export interface MeshLinkConfig {
  id: string
  from: string
  to: string
  enabled: boolean
  latencyMs: number
  jitterMs: number
  packetLossPercent: number
  ackLossPercent: number
  duplicatePercent: number
}

export interface MeshMessageSpec {
  id: string
  sourceNodeId: string
  destinationNodeId: string
  createdAt: number
  ttlMs: number
  hopLimit: number
  maxAttempts: number
  retryDelayMs: number
  ackTimeoutMs: number
}

export type MeshFault =
  | {
      at: number
      type: 'node-state'
      nodeId: string
      state: MeshNodeState
    }
  | {
      at: number
      type: 'link-state'
      linkId: string
      enabled: boolean
    }
  | {
      at: number
      type: 'link-patch'
      linkId: string
      patch: Partial<Pick<MeshLinkConfig, 'latencyMs' | 'jitterMs' | 'packetLossPercent' | 'ackLossPercent' | 'duplicatePercent'>>
    }

export interface MeshScenarioExpectation {
  status: MeshSimulationStatus
  summary: string
}

export interface MeshScenario {
  id: string
  name: string
  description: string
  seed: number
  expectation: MeshScenarioExpectation
  nodes: MeshNodeConfig[]
  links: MeshLinkConfig[]
  message: MeshMessageSpec
  faults: MeshFault[]
}

export type MeshTraceEventType =
  | 'message-created'
  | 'attempt-started'
  | 'route-selected'
  | 'route-unavailable'
  | 'frame-sent'
  | 'frame-received'
  | 'frame-dropped'
  | 'duplicate-scheduled'
  | 'duplicate-suppressed'
  | 'message-delivered'
  | 'ack-sent'
  | 'ack-received'
  | 'ack-dropped'
  | 'retry-scheduled'
  | 'node-state-changed'
  | 'link-state-changed'
  | 'link-quality-changed'
  | 'message-expired'
  | 'message-failed'

export interface MeshTraceEvent {
  at: number
  type: MeshTraceEventType
  summary: string
  attempt?: number
  nodeId?: string
  linkId?: string
  frameId?: string
  route?: string[]
}

export interface MeshSimulationMetrics {
  attempts: number
  framesSent: number
  framesReceived: number
  framesDropped: number
  acksSent: number
  acksDropped: number
  retriesScheduled: number
  duplicatesSuppressed: number
  deliveryLatencyMs?: number
  deliveredAt?: number
  acknowledgedAt?: number
  acknowledgementLatencyMs?: number
  finalHopCount?: number
}

export type MeshSimulationStatus =
  | 'acknowledged'
  | 'delivered-unacknowledged'
  | 'failed'
  | 'expired'

export interface MeshSimulationResult {
  scenarioId: string
  scenarioName: string
  seed: number
  messageId: string
  status: MeshSimulationStatus
  delivered: boolean
  acknowledged: boolean
  trace: MeshTraceEvent[]
  metrics: MeshSimulationMetrics
  finalNodeStates: Record<string, MeshNodeState>
  finalLinkStates: Record<string, boolean>
}
