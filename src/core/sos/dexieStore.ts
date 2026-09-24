import { db } from '../../offline/db'
import type { LocationFix } from '../location/types'
import type { FieldSafetyStore } from './store'
import type { LocationShareRecord, SosEvent, SosRecord } from './types'

export class DexieFieldSafetyStore implements FieldSafetyStore {
  async putLocationFix(fix: LocationFix): Promise<void> {
    await db.locationFixes.put({ ...fix })
  }

  async listLocationFixes(): Promise<LocationFix[]> {
    return db.locationFixes.orderBy('capturedAt').reverse().toArray()
  }

  async putLocationShare(record: LocationShareRecord): Promise<void> {
    await db.locationShares.put(structuredClone(record))
  }

  async getLocationShare(id: string): Promise<LocationShareRecord | undefined> {
    const record = await db.locationShares.get(id)
    return record ? structuredClone(record) : undefined
  }

  async listLocationShares(): Promise<LocationShareRecord[]> {
    const records = await db.locationShares.orderBy('createdAt').reverse().toArray()
    return records.map((record) => structuredClone(record))
  }

  async putSos(record: SosRecord): Promise<void> {
    await db.sosRecords.put(structuredClone(record))
  }

  async getSos(id: string): Promise<SosRecord | undefined> {
    const record = await db.sosRecords.get(id)
    return record ? structuredClone(record) : undefined
  }

  async listSos(): Promise<SosRecord[]> {
    const records = await db.sosRecords.orderBy('createdAt').reverse().toArray()
    return records.map((record) => structuredClone(record))
  }

  async addSosEvent(event: SosEvent): Promise<void> {
    await db.sosEvents.put({ ...event })
  }

  async listSosEvents(): Promise<SosEvent[]> {
    return db.sosEvents.orderBy('at').toArray()
  }

  async clear(): Promise<void> {
    await db.transaction(
      'rw',
      db.locationFixes,
      db.locationShares,
      db.sosRecords,
      db.sosEvents,
      async () => {
        await db.locationFixes.clear()
        await db.locationShares.clear()
        await db.sosRecords.clear()
        await db.sosEvents.clear()
      },
    )
  }
}
