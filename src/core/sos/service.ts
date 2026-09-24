import type { FieldMeshUserId } from '../protocol/ids'
import type { LocationFix } from '../location/types'
import {
  compareMessagePriority,
  createLocationMessage,
  createSosMessage,
  type FieldMeshLocationPayload,
  type SosCategory,
} from '../message/model'
import type { FieldSafetyStore } from './store'
import type { SafetyTransportAdapter } from './transports'
import type {
  LocationShareRecord,
  SafetySnapshot,
  SosEvent,
  SosRecord,
  SosStatus,
} from './types'

const SAFETY_CONVERSATION_ID = 'field-safety'

type DispatchKind = 'sos' | 'location'

type DispatchCandidate = {
  kind: DispatchKind
  id: string
  priority: 'emergency' | 'location'
  createdAt: number
}

function toMessageLocation(fix: LocationFix): FieldMeshLocationPayload {
  return {
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    capturedAt: fix.capturedAt,
  }
}

export class FieldSafetyService {
  private readonly store: FieldSafetyStore
  private readonly internet: SafetyTransportAdapter
  private readonly gateway: SafetyTransportAdapter

  constructor(
    store: FieldSafetyStore,
    internet: SafetyTransportAdapter,
    gateway: SafetyTransportAdapter,
  ) {
    this.store = store
    this.internet = internet
    this.gateway = gateway
  }

  async saveLocationFix(fix: LocationFix): Promise<void> {
    await this.store.putLocationFix(fix)
  }

  async createLocationShare(args: {
    senderUserId: FieldMeshUserId
    location: LocationFix
    now?: number
    ttlMs?: number
    id?: string
  }): Promise<LocationShareRecord> {
    const now = args.now ?? Date.now()
    const message = createLocationMessage({
      conversationId: SAFETY_CONVERSATION_ID,
      senderUserId: args.senderUserId,
      location: toMessageLocation(args.location),
      id: args.id,
      now,
      ttlMs: args.ttlMs,
    })
    const record: LocationShareRecord = {
      id: message.id,
      message,
      location: { ...args.location },
      status: 'created',
      createdAt: now,
      updatedAt: now,
    }
    await this.store.putLocationShare(record)
    return record
  }

  async createSos(args: {
    senderUserId: FieldMeshUserId
    category: SosCategory
    note?: string
    location?: LocationFix
    batteryPercent?: number
    now?: number
    ttlMs?: number
    id?: string
    sosId?: string
  }): Promise<SosRecord> {
    const now = args.now ?? Date.now()
    const message = createSosMessage({
      conversationId: SAFETY_CONVERSATION_ID,
      senderUserId: args.senderUserId,
      category: args.category,
      message: args.note,
      location: args.location ? toMessageLocation(args.location) : undefined,
      batteryPercent: args.batteryPercent,
      now,
      ttlMs: args.ttlMs,
      id: args.id,
      sosId: args.sosId,
    })
    const sosId = message.payload.sos?.sosId
    if (!sosId) throw new Error('SOS message did not contain an SOS identity.')

    const record: SosRecord = {
      id: sosId,
      message,
      category: args.category,
      note: args.note?.trim() || undefined,
      location: args.location ? { ...args.location } : undefined,
      batteryPercent: args.batteryPercent,
      status: 'created',
      createdAt: now,
      updatedAt: now,
    }
    await this.store.putSos(record)
    await this.event(record.id, now, 'created', args.location
      ? 'SOS created with a location fix.'
      : 'SOS created without GPS; transmission remains allowed.')
    return record
  }

  async dispatchLocationShare(id: string, now = Date.now()): Promise<LocationShareRecord> {
    const record = await this.requireLocationShare(id)
    if (record.status === 'received' || record.status === 'expired') return record
    if (record.message.expiresAt <= now) {
      const expired = { ...record, status: 'expired' as const, updatedAt: now, lastError: 'Location update expired before delivery.' }
      await this.store.putLocationShare(expired)
      return expired
    }

    if (record.status === 'transmitted' && record.path === 'radio-gateway-cloud' && this.gateway.reconcile) {
      const reconciled = await this.gateway.reconcile(record.message, now)
      if (reconciled === 'received') {
        const received = { ...record, status: 'received' as const, updatedAt: now, receivedAt: now, lastError: undefined }
        await this.store.putLocationShare(received)
        return received
      }
      if (reconciled === 'expired') {
        const expired = { ...record, status: 'expired' as const, updatedAt: now, lastError: 'Location update expired in the gateway queue.' }
        await this.store.putLocationShare(expired)
        return expired
      }
      return record
    }

    const result = await this.tryTransports(record.message, now)
    if (!result) {
      const queued = { ...record, status: 'queued' as const, updatedAt: now, lastError: 'No delivery path is currently available.' }
      await this.store.putLocationShare(queued)
      return queued
    }

    const next: LocationShareRecord = {
      ...record,
      path: result.path,
      status: result.received ? 'received' : 'transmitted',
      updatedAt: now,
      receivedAt: result.received ? now : undefined,
      lastError: result.received ? undefined : 'Accepted by gateway; waiting for gateway Internet recovery.',
    }
    await this.store.putLocationShare(next)
    return next
  }

  async dispatchSos(id: string, now = Date.now()): Promise<SosRecord> {
    let record = await this.requireSos(id)
    if (['received', 'acknowledged', 'resolved', 'expired'].includes(record.status)) return record

    if (record.message.expiresAt <= now) {
      record = await this.transition(record, 'expired', now, 'SOS expired before delivery.')
      return record
    }

    if (record.status === 'transmitted' && record.path === 'radio-gateway-cloud' && this.gateway.reconcile) {
      const reconciled = await this.gateway.reconcile(record.message, now)
      if (reconciled === 'received') {
        return this.transition(record, 'received', now, 'Gateway forwarded SOS to the cloud.', record.path)
      }
      if (reconciled === 'expired') {
        return this.transition(record, 'expired', now, 'SOS expired while waiting in the gateway queue.', record.path)
      }
      return record
    }

    const result = await this.tryTransports(record.message, now)
    if (!result) {
      return this.transition(record, 'queued', now, 'No Internet or radio/gateway path is currently available.')
    }

    record = await this.transition(
      record,
      'transmitted',
      now,
      result.path === 'internet'
        ? 'SOS transmitted over direct Internet.'
        : 'SOS transmitted over radio to the hybrid gateway.',
      result.path,
    )

    if (result.received) {
      record = await this.transition(
        record,
        'received',
        now,
        result.path === 'internet'
          ? 'Cloud endpoint received the SOS.'
          : 'Gateway forwarded the SOS to the cloud endpoint.',
        result.path,
      )
    }
    return record
  }

  async retryPending(now = Date.now()): Promise<SafetySnapshot> {
    const [sos, locationShares] = await Promise.all([
      this.store.listSos(),
      this.store.listLocationShares(),
    ])

    const candidates: DispatchCandidate[] = [
      ...sos
        .filter((record) => ['created', 'queued', 'transmitted'].includes(record.status))
        .map((record) => ({ kind: 'sos' as const, id: record.id, priority: 'emergency' as const, createdAt: record.createdAt })),
      ...locationShares
        .filter((record) => ['created', 'queued', 'transmitted'].includes(record.status))
        .map((record) => ({ kind: 'location' as const, id: record.id, priority: 'location' as const, createdAt: record.createdAt })),
    ].sort((a, b) => compareMessagePriority(a.priority, b.priority) || a.createdAt - b.createdAt)

    for (const candidate of candidates) {
      if (candidate.kind === 'sos') await this.dispatchSos(candidate.id, now)
      else await this.dispatchLocationShare(candidate.id, now)
    }
    return this.snapshot()
  }

  async acknowledge(id: string, responder: string, now = Date.now()): Promise<SosRecord> {
    const record = await this.requireSos(id)
    if (record.status !== 'received') throw new Error('SOS must be received before responder acknowledgement.')
    const next: SosRecord = {
      ...record,
      status: 'acknowledged',
      acknowledgedAt: now,
      acknowledgedBy: responder.trim() || 'Responder',
      updatedAt: now,
      lastError: undefined,
    }
    await this.store.putSos(next)
    await this.event(id, now, 'acknowledged', `Acknowledged by ${next.acknowledgedBy}.`, record.path)
    return next
  }

  async resolve(id: string, resolver: string, now = Date.now()): Promise<SosRecord> {
    const record = await this.requireSos(id)
    if (record.status !== 'acknowledged') throw new Error('SOS must be acknowledged before it can be resolved.')
    const next: SosRecord = {
      ...record,
      status: 'resolved',
      resolvedAt: now,
      resolvedBy: resolver.trim() || record.acknowledgedBy || 'Responder',
      updatedAt: now,
      lastError: undefined,
    }
    await this.store.putSos(next)
    await this.event(id, now, 'resolved', `Resolved by ${next.resolvedBy}.`, record.path)
    return next
  }

  async snapshot(): Promise<SafetySnapshot> {
    const [sos, locationShares, events] = await Promise.all([
      this.store.listSos(),
      this.store.listLocationShares(),
      this.store.listSosEvents(),
    ])
    return { sos, locationShares, events }
  }

  async listLocationFixes(): Promise<LocationFix[]> {
    return this.store.listLocationFixes()
  }

  async clear(): Promise<void> {
    await this.store.clear()
  }

  private async tryTransports(message: SosRecord['message'], now: number): Promise<{
    path: 'internet' | 'radio-gateway-cloud'
    received: boolean
  } | null> {
    if (this.internet.isAvailable()) {
      try {
        const result = await this.internet.send(message, now)
        return { path: 'internet', received: result.received }
      } catch {
        // Fall through to radio/gateway if the direct Internet path failed.
      }
    }

    if (this.gateway.isAvailable()) {
      try {
        const result = await this.gateway.send(message, now)
        return { path: 'radio-gateway-cloud', received: result.received }
      } catch {
        return null
      }
    }

    return null
  }

  private async transition(
    record: SosRecord,
    status: SosStatus,
    now: number,
    summary: string,
    path = record.path,
  ): Promise<SosRecord> {
    const next: SosRecord = {
      ...record,
      status,
      path,
      updatedAt: now,
      receivedAt: status === 'received' ? now : record.receivedAt,
      lastError: status === 'queued' || status === 'failed' || status === 'expired' ? summary : undefined,
    }
    await this.store.putSos(next)
    await this.event(record.id, now, status, summary, path)
    return next
  }

  private async event(
    sosId: string,
    at: number,
    type: SosEvent['type'],
    summary: string,
    path?: 'internet' | 'radio-gateway-cloud',
  ): Promise<void> {
    await this.store.addSosEvent({
      id: crypto.randomUUID(),
      sosId,
      at,
      type,
      summary,
      path,
    })
  }

  private async requireSos(id: string): Promise<SosRecord> {
    const record = await this.store.getSos(id)
    if (!record) throw new Error(`SOS ${id} was not found.`)
    return record
  }

  private async requireLocationShare(id: string): Promise<LocationShareRecord> {
    const record = await this.store.getLocationShare(id)
    if (!record) throw new Error(`Location share ${id} was not found.`)
    return record
  }
}
