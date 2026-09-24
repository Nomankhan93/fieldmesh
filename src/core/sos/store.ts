import type { LocationFix } from '../location/types'
import type { LocationShareRecord, SosEvent, SosRecord } from './types'

export interface FieldSafetyStore {
  putLocationFix(fix: LocationFix): Promise<void>
  listLocationFixes(): Promise<LocationFix[]>
  putLocationShare(record: LocationShareRecord): Promise<void>
  getLocationShare(id: string): Promise<LocationShareRecord | undefined>
  listLocationShares(): Promise<LocationShareRecord[]>
  putSos(record: SosRecord): Promise<void>
  getSos(id: string): Promise<SosRecord | undefined>
  listSos(): Promise<SosRecord[]>
  addSosEvent(event: SosEvent): Promise<void>
  listSosEvents(): Promise<SosEvent[]>
  clear(): Promise<void>
}

function cloneLocationFix(fix: LocationFix): LocationFix {
  return { ...fix }
}

function cloneLocationShare(record: LocationShareRecord): LocationShareRecord {
  return {
    ...record,
    location: cloneLocationFix(record.location),
    message: {
      ...record.message,
      payload: {
        ...record.message.payload,
        location: record.message.payload.location ? { ...record.message.payload.location } : undefined,
        sos: record.message.payload.sos
          ? {
              ...record.message.payload.sos,
              location: record.message.payload.sos.location
                ? { ...record.message.payload.sos.location }
                : undefined,
            }
          : undefined,
      },
    },
  }
}

function cloneSos(record: SosRecord): SosRecord {
  return {
    ...record,
    location: record.location ? cloneLocationFix(record.location) : undefined,
    message: {
      ...record.message,
      payload: {
        ...record.message.payload,
        location: record.message.payload.location ? { ...record.message.payload.location } : undefined,
        sos: record.message.payload.sos
          ? {
              ...record.message.payload.sos,
              location: record.message.payload.sos.location
                ? { ...record.message.payload.sos.location }
                : undefined,
            }
          : undefined,
      },
    },
  }
}

export class InMemoryFieldSafetyStore implements FieldSafetyStore {
  private readonly locationFixes = new Map<string, LocationFix>()
  private readonly locationShares = new Map<string, LocationShareRecord>()
  private readonly sos = new Map<string, SosRecord>()
  private readonly events: SosEvent[] = []

  async putLocationFix(fix: LocationFix): Promise<void> {
    this.locationFixes.set(fix.id, cloneLocationFix(fix))
  }

  async listLocationFixes(): Promise<LocationFix[]> {
    return [...this.locationFixes.values()]
      .map(cloneLocationFix)
      .sort((a, b) => b.capturedAt - a.capturedAt)
  }

  async putLocationShare(record: LocationShareRecord): Promise<void> {
    this.locationShares.set(record.id, cloneLocationShare(record))
  }

  async getLocationShare(id: string): Promise<LocationShareRecord | undefined> {
    const record = this.locationShares.get(id)
    return record ? cloneLocationShare(record) : undefined
  }

  async listLocationShares(): Promise<LocationShareRecord[]> {
    return [...this.locationShares.values()]
      .map(cloneLocationShare)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  async putSos(record: SosRecord): Promise<void> {
    this.sos.set(record.id, cloneSos(record))
  }

  async getSos(id: string): Promise<SosRecord | undefined> {
    const record = this.sos.get(id)
    return record ? cloneSos(record) : undefined
  }

  async listSos(): Promise<SosRecord[]> {
    return [...this.sos.values()]
      .map(cloneSos)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  async addSosEvent(event: SosEvent): Promise<void> {
    this.events.push({ ...event })
  }

  async listSosEvents(): Promise<SosEvent[]> {
    return this.events.map((event) => ({ ...event })).sort((a, b) => a.at - b.at)
  }

  async clear(): Promise<void> {
    this.locationFixes.clear()
    this.locationShares.clear()
    this.sos.clear()
    this.events.length = 0
  }
}
