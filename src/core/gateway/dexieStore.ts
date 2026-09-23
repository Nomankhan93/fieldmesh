import { db } from '../../offline/db'
import type { GatewayStore } from './store'
import type { GatewayQueueItem, GatewayRouteRecord, GatewaySeenRecord } from './types'

function cloneQueueItem(item: GatewayQueueItem): GatewayQueueItem {
  return { ...item, payload: new Uint8Array(item.payload) }
}

export class DexieGatewayStore implements GatewayStore {
  async getQueueItem(key: string): Promise<GatewayQueueItem | undefined> {
    const item = await db.gatewayQueue.get(key)
    return item ? cloneQueueItem(item) : undefined
  }

  async putQueueItem(item: GatewayQueueItem): Promise<void> {
    await db.gatewayQueue.put(cloneQueueItem(item))
  }

  async deleteQueueItem(key: string): Promise<void> {
    await db.gatewayQueue.delete(key)
  }

  async listQueue(gatewayId: string): Promise<GatewayQueueItem[]> {
    const items = await db.gatewayQueue.where('gatewayId').equals(gatewayId).toArray()
    return items.map(cloneQueueItem).sort((a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key))
  }

  async getSeen(key: string): Promise<GatewaySeenRecord | undefined> {
    const item = await db.gatewaySeen.get(key)
    return item ? { ...item } : undefined
  }

  async putSeen(record: GatewaySeenRecord): Promise<void> {
    await db.gatewaySeen.put({ ...record })
  }

  async putRoute(route: GatewayRouteRecord): Promise<void> {
    await db.gatewayRoutes.put({ ...route })
  }

  async listRoutes(gatewayId?: string): Promise<GatewayRouteRecord[]> {
    const items = gatewayId
      ? await db.gatewayRoutes.where('gatewayId').equals(gatewayId).toArray()
      : await db.gatewayRoutes.toArray()
    return items.map((item) => ({ ...item })).sort((a, b) => b.lastSeenAt - a.lastSeenAt || a.userId.localeCompare(b.userId))
  }

  async clearGateway(gatewayId: string): Promise<void> {
    await db.transaction('rw', db.gatewayQueue, db.gatewaySeen, db.gatewayRoutes, async () => {
      await db.gatewayQueue.where('gatewayId').equals(gatewayId).delete()
      await db.gatewaySeen.where('gatewayId').equals(gatewayId).delete()
      await db.gatewayRoutes.where('gatewayId').equals(gatewayId).delete()
    })
  }
}
