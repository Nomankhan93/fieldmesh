import type {
  GatewayDirection,
  GatewayQueueItem,
  GatewayRouteRecord,
  GatewaySeenRecord,
} from './types'

export interface GatewayStore {
  getQueueItem(key: string): Promise<GatewayQueueItem | undefined>
  putQueueItem(item: GatewayQueueItem): Promise<void>
  deleteQueueItem(key: string): Promise<void>
  listQueue(gatewayId: string): Promise<GatewayQueueItem[]>
  getSeen(key: string): Promise<GatewaySeenRecord | undefined>
  putSeen(record: GatewaySeenRecord): Promise<void>
  putRoute(route: GatewayRouteRecord): Promise<void>
  listRoutes(gatewayId?: string): Promise<GatewayRouteRecord[]>
  clearGateway(gatewayId: string): Promise<void>
}

export function gatewayQueueKey(
  gatewayId: string,
  direction: GatewayDirection,
  messageId: string,
): string {
  return `${gatewayId}:${direction}:${messageId}`
}

export function gatewaySeenKey(
  gatewayId: string,
  direction: GatewayDirection,
  messageId: string,
): string {
  return `${gatewayId}:${direction}:${messageId}`
}

export function gatewayRouteKey(userId: string, gatewayId: string): string {
  return `${gatewayId}:${userId}`
}

function cloneQueueItem(item: GatewayQueueItem): GatewayQueueItem {
  return { ...item, payload: new Uint8Array(item.payload) }
}

export class InMemoryGatewayStore implements GatewayStore {
  private readonly queue = new Map<string, GatewayQueueItem>()
  private readonly seen = new Map<string, GatewaySeenRecord>()
  private readonly routes = new Map<string, GatewayRouteRecord>()

  async getQueueItem(key: string): Promise<GatewayQueueItem | undefined> {
    const item = this.queue.get(key)
    return item ? cloneQueueItem(item) : undefined
  }

  async putQueueItem(item: GatewayQueueItem): Promise<void> {
    this.queue.set(item.key, cloneQueueItem(item))
  }

  async deleteQueueItem(key: string): Promise<void> {
    this.queue.delete(key)
  }

  async listQueue(gatewayId: string): Promise<GatewayQueueItem[]> {
    return [...this.queue.values()]
      .filter((item) => item.gatewayId === gatewayId)
      .map(cloneQueueItem)
      .sort((a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key))
  }

  async getSeen(key: string): Promise<GatewaySeenRecord | undefined> {
    const record = this.seen.get(key)
    return record ? { ...record } : undefined
  }

  async putSeen(record: GatewaySeenRecord): Promise<void> {
    this.seen.set(record.key, { ...record })
  }

  async putRoute(route: GatewayRouteRecord): Promise<void> {
    this.routes.set(route.key, { ...route })
  }

  async listRoutes(gatewayId?: string): Promise<GatewayRouteRecord[]> {
    return [...this.routes.values()]
      .filter((route) => !gatewayId || route.gatewayId === gatewayId)
      .map((route) => ({ ...route }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt || a.userId.localeCompare(b.userId))
  }

  async clearGateway(gatewayId: string): Promise<void> {
    for (const [key, item] of this.queue) {
      if (item.gatewayId === gatewayId) this.queue.delete(key)
    }
    for (const [key, record] of this.seen) {
      if (record.gatewayId === gatewayId) this.seen.delete(key)
    }
    for (const [key, route] of this.routes) {
      if (route.gatewayId === gatewayId) this.routes.delete(key)
    }
  }
}
