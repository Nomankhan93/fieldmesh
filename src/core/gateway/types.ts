import type { FieldMeshUserId, MessageId, RadioNodeId, TransportNodeId } from '../protocol/ids'

export type GatewayDirection = 'radio-to-cloud' | 'cloud-to-radio'
export type GatewayQueueState = 'queued' | 'forwarding' | 'retrying'

export interface GatewayConnectivity {
  radioAvailable: boolean
  internetAvailable: boolean
}

export interface GatewayQueueItem {
  key: string
  gatewayId: string
  direction: GatewayDirection
  messageId: MessageId
  sourceNodeId?: TransportNodeId
  destinationNodeId?: TransportNodeId
  destinationUserId?: FieldMeshUserId
  createdAt: number
  expiresAt: number
  nextAttemptAt: number
  retryCount: number
  state: GatewayQueueState
  lastFailureReason?: string
  payload: Uint8Array
}

export interface GatewaySeenRecord {
  key: string
  gatewayId: string
  direction: GatewayDirection
  messageId: MessageId
  seenAt: number
}

export interface GatewayRouteRecord {
  key: string
  userId: FieldMeshUserId
  gatewayId: string
  radioNodeId: RadioNodeId
  lastSeenAt: number
  expiresAt: number
}

export interface GatewayCloudUpload {
  gatewayId: string
  messageId: MessageId
  sourceNodeId?: TransportNodeId
  destinationNodeId?: TransportNodeId
  createdAt: number
  expiresAt: number
  payload: Uint8Array
}

export interface GatewayCloudDownlink {
  messageId: MessageId
  destinationUserId: FieldMeshUserId
  createdAt: number
  expiresAt: number
  payload: Uint8Array
}

export type GatewayTraceEventType =
  | 'radio-ingress'
  | 'cloud-ingress'
  | 'queued'
  | 'duplicate-suppressed'
  | 'forward-started'
  | 'cloud-forwarded'
  | 'radio-forwarded'
  | 'forward-failed'
  | 'retry-scheduled'
  | 'expired'
  | 'route-resolved'
  | 'route-unavailable'
  | 'connectivity-changed'

export interface GatewayTraceEvent {
  at: number
  type: GatewayTraceEventType
  summary: string
  direction?: GatewayDirection
  messageId?: MessageId
  queueKey?: string
  route?: string
}

export interface GatewayMetrics {
  radioIngress: number
  cloudIngress: number
  cloudForwarded: number
  radioForwarded: number
  duplicatesSuppressed: number
  retriesScheduled: number
  expired: number
  failures: number
}

export interface GatewaySnapshot {
  gatewayId: string
  connectivity: GatewayConnectivity
  uplinkQueueDepth: number
  downlinkQueueDepth: number
  queue: GatewayQueueItem[]
  routes: GatewayRouteRecord[]
  metrics: GatewayMetrics
  trace: GatewayTraceEvent[]
}

export type GatewayIngressResult = 'forwarded' | 'queued' | 'duplicate' | 'expired'
