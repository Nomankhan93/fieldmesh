import type { FieldMeshUserId, RadioNodeId } from '../protocol/ids'
import { gatewayRouteKey, type GatewayStore } from './store'
import type { GatewayRouteRecord } from './types'

export const DEFAULT_GATEWAY_ROUTE_TTL_MS = 30 * 60 * 1000

export class GatewayRoutingRegistry {
  private readonly store: GatewayStore
  private readonly gatewayId: string

  constructor(store: GatewayStore, gatewayId: string) {
    this.store = store
    this.gatewayId = gatewayId
  }

  async learn(args: {
    userId: FieldMeshUserId
    radioNodeId: RadioNodeId
    now?: number
    ttlMs?: number
  }): Promise<GatewayRouteRecord> {
    const now = args.now ?? Date.now()
    const ttlMs = args.ttlMs ?? DEFAULT_GATEWAY_ROUTE_TTL_MS
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Gateway route TTL must be greater than zero')

    const route: GatewayRouteRecord = {
      key: gatewayRouteKey(args.userId, this.gatewayId),
      userId: args.userId,
      gatewayId: this.gatewayId,
      radioNodeId: args.radioNodeId,
      lastSeenAt: now,
      expiresAt: now + ttlMs,
    }
    await this.store.putRoute(route)
    return route
  }

  async resolve(userId: FieldMeshUserId, now = Date.now()): Promise<GatewayRouteRecord | undefined> {
    const routes = await this.store.listRoutes(this.gatewayId)
    return routes.find((route) => route.userId === userId && route.expiresAt > now)
  }

  async list(now = Date.now()): Promise<GatewayRouteRecord[]> {
    const routes = await this.store.listRoutes(this.gatewayId)
    return routes.filter((route) => route.expiresAt > now)
  }
}
