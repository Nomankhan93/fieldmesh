import type { FieldMeshMessage, SosCategory } from '../message/model'
import type { LocationFix } from '../location/types'

export type FieldDeliveryPath = 'internet' | 'radio-gateway-cloud'
export type LocationShareStatus = 'created' | 'queued' | 'transmitted' | 'received' | 'expired' | 'failed'
export type SosStatus = 'created' | 'queued' | 'transmitted' | 'received' | 'acknowledged' | 'resolved' | 'expired' | 'failed'

export interface LocationShareRecord {
  id: string
  message: FieldMeshMessage
  location: LocationFix
  status: LocationShareStatus
  path?: FieldDeliveryPath
  createdAt: number
  updatedAt: number
  receivedAt?: number
  lastError?: string
}

export interface SosRecord {
  id: string
  message: FieldMeshMessage
  category: SosCategory
  note?: string
  location?: LocationFix
  batteryPercent?: number
  status: SosStatus
  path?: FieldDeliveryPath
  createdAt: number
  updatedAt: number
  receivedAt?: number
  acknowledgedAt?: number
  acknowledgedBy?: string
  resolvedAt?: number
  resolvedBy?: string
  lastError?: string
}

export type SosEventType =
  | 'created'
  | 'queued'
  | 'transmitted'
  | 'received'
  | 'acknowledged'
  | 'resolved'
  | 'expired'
  | 'failed'

export interface SosEvent {
  id: string
  sosId: string
  at: number
  type: SosEventType
  summary: string
  path?: FieldDeliveryPath
}

export interface SafetySnapshot {
  sos: SosRecord[]
  locationShares: LocationShareRecord[]
  events: SosEvent[]
}
