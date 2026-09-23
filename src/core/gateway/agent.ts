import type { FieldMeshUserId } from '../protocol/ids'
import { createTransportFrame, type TransportFrame } from '../transport/frame'
import type { GatewayCloudAdapter, GatewayRadioAdapter } from './adapters'
import { GatewayRoutingRegistry } from './routing'
import {
  gatewayQueueKey,
  gatewaySeenKey,
  type GatewayStore,
} from './store'
import type {
  GatewayCloudDownlink,
  GatewayConnectivity,
  GatewayIngressResult,
  GatewayMetrics,
  GatewayQueueItem,
  GatewaySnapshot,
  GatewayTraceEvent,
} from './types'

const DEFAULT_RETRY_DELAY_MS = 1_000

function createMetrics(): GatewayMetrics {
  return {
    radioIngress: 0,
    cloudIngress: 0,
    cloudForwarded: 0,
    radioForwarded: 0,
    duplicatesSuppressed: 0,
    retriesScheduled: 0,
    expired: 0,
    failures: 0,
  }
}

export class GatewayAgent {
  readonly gatewayId: string
  readonly routes: GatewayRoutingRegistry
  private readonly store: GatewayStore
  private readonly radio: GatewayRadioAdapter
  private readonly cloud: GatewayCloudAdapter
  private readonly trace: GatewayTraceEvent[] = []
  private readonly metrics = createMetrics()

  constructor(
    gatewayId: string,
    store: GatewayStore,
    radio: GatewayRadioAdapter,
    cloud: GatewayCloudAdapter,
  ) {
    this.gatewayId = gatewayId
    this.store = store
    this.radio = radio
    this.cloud = cloud
    this.routes = new GatewayRoutingRegistry(store, gatewayId)
  }

  getConnectivity(): GatewayConnectivity {
    return {
      radioAvailable: this.radio.isAvailable(),
      internetAvailable: this.cloud.isAvailable(),
    }
  }

  async learnRoute(args: {
    userId: FieldMeshUserId
    radioNodeId: string
    now?: number
    ttlMs?: number
  }): Promise<void> {
    await this.routes.learn(args)
  }

  recordConnectivityChange(now = Date.now()): void {
    const connectivity = this.getConnectivity()
    this.pushTrace({
      at: now,
      type: 'connectivity-changed',
      summary: `Connectivity changed: radio ${connectivity.radioAvailable ? 'online' : 'offline'}, internet ${connectivity.internetAvailable ? 'online' : 'offline'}.`,
    })
  }

  async ingestRadioFrame(frame: TransportFrame, now = Date.now()): Promise<GatewayIngressResult> {
    this.metrics.radioIngress += 1
    this.pushTrace({
      at: now,
      type: 'radio-ingress',
      summary: `Radio frame received for logical message ${frame.messageId}.`,
      direction: 'radio-to-cloud',
      messageId: frame.messageId,
    })

    return this.enqueueAndForward({
      direction: 'radio-to-cloud',
      messageId: frame.messageId,
      sourceNodeId: frame.sourceNodeId,
      destinationNodeId: frame.destinationNodeId,
      createdAt: frame.createdAt,
      expiresAt: frame.expiresAt,
      payload: frame.payload,
    }, now)
  }

  async ingestCloudMessage(message: GatewayCloudDownlink, now = Date.now()): Promise<GatewayIngressResult> {
    this.metrics.cloudIngress += 1
    this.pushTrace({
      at: now,
      type: 'cloud-ingress',
      summary: `Cloud message received for ${message.destinationUserId}.`,
      direction: 'cloud-to-radio',
      messageId: message.messageId,
    })

    return this.enqueueAndForward({
      direction: 'cloud-to-radio',
      messageId: message.messageId,
      destinationUserId: message.destinationUserId,
      createdAt: message.createdAt,
      expiresAt: message.expiresAt,
      payload: message.payload,
    }, now)
  }

  async flush(now = Date.now(), force = false): Promise<void> {
    const queue = await this.store.listQueue(this.gatewayId)
    for (const item of queue) {
      if (!force && item.nextAttemptAt > now) continue
      await this.forward(item, now)
    }
  }

  async snapshot(now = Date.now()): Promise<GatewaySnapshot> {
    const queue = await this.store.listQueue(this.gatewayId)
    const routes = await this.routes.list(now)
    return {
      gatewayId: this.gatewayId,
      connectivity: this.getConnectivity(),
      uplinkQueueDepth: queue.filter((item) => item.direction === 'radio-to-cloud').length,
      downlinkQueueDepth: queue.filter((item) => item.direction === 'cloud-to-radio').length,
      queue,
      routes,
      metrics: { ...this.metrics },
      trace: this.trace.map((event) => ({ ...event })),
    }
  }

  async reset(): Promise<void> {
    await this.store.clearGateway(this.gatewayId)
    this.trace.length = 0
    Object.assign(this.metrics, createMetrics())
  }

  private async enqueueAndForward(
    args: Omit<GatewayQueueItem, 'key' | 'gatewayId' | 'nextAttemptAt' | 'retryCount' | 'state'>,
    now: number,
  ): Promise<GatewayIngressResult> {
    if (args.expiresAt <= now) {
      this.metrics.expired += 1
      this.pushTrace({
        at: now,
        type: 'expired',
        summary: `Message ${args.messageId} expired before gateway forwarding.`,
        direction: args.direction,
        messageId: args.messageId,
      })
      return 'expired'
    }

    const key = gatewayQueueKey(this.gatewayId, args.direction, args.messageId)
    const seenKey = gatewaySeenKey(this.gatewayId, args.direction, args.messageId)
    const [queued, seen] = await Promise.all([
      this.store.getQueueItem(key),
      this.store.getSeen(seenKey),
    ])

    if (queued || seen) {
      this.metrics.duplicatesSuppressed += 1
      this.pushTrace({
        at: now,
        type: 'duplicate-suppressed',
        summary: `Duplicate ${args.direction} ingress suppressed for ${args.messageId}.`,
        direction: args.direction,
        messageId: args.messageId,
        queueKey: key,
      })
      return 'duplicate'
    }

    const item: GatewayQueueItem = {
      ...args,
      key,
      gatewayId: this.gatewayId,
      nextAttemptAt: now,
      retryCount: 0,
      state: 'queued',
      payload: new Uint8Array(args.payload),
    }
    await this.store.putQueueItem(item)
    this.pushTrace({
      at: now,
      type: 'queued',
      summary: `${args.direction} message ${args.messageId} stored in the durable gateway queue.`,
      direction: args.direction,
      messageId: args.messageId,
      queueKey: key,
    })

    return this.forward(item, now)
  }

  private async forward(item: GatewayQueueItem, now: number): Promise<GatewayIngressResult> {
    if (item.expiresAt <= now) {
      await this.store.deleteQueueItem(item.key)
      this.metrics.expired += 1
      this.pushTrace({
        at: now,
        type: 'expired',
        summary: `Queued ${item.direction} message ${item.messageId} expired.`,
        direction: item.direction,
        messageId: item.messageId,
        queueKey: item.key,
      })
      return 'expired'
    }

    const unavailable = item.direction === 'radio-to-cloud'
      ? !this.cloud.isAvailable()
      : !this.radio.isAvailable()
    if (unavailable) {
      await this.scheduleRetry(item, now, item.direction === 'radio-to-cloud'
        ? 'Internet/cloud unavailable'
        : 'Radio unavailable')
      return 'queued'
    }

    const forwarding: GatewayQueueItem = { ...item, state: 'forwarding' }
    await this.store.putQueueItem(forwarding)
    this.pushTrace({
      at: now,
      type: 'forward-started',
      summary: `Forwarding ${item.messageId} via ${item.direction}.`,
      direction: item.direction,
      messageId: item.messageId,
      queueKey: item.key,
    })

    try {
      if (item.direction === 'radio-to-cloud') {
        await this.cloud.upload({
          gatewayId: this.gatewayId,
          messageId: item.messageId,
          sourceNodeId: item.sourceNodeId,
          destinationNodeId: item.destinationNodeId,
          createdAt: item.createdAt,
          expiresAt: item.expiresAt,
          payload: item.payload,
        })
        this.metrics.cloudForwarded += 1
        this.pushTrace({
          at: now,
          type: 'cloud-forwarded',
          summary: `Logical message ${item.messageId} accepted by cloud mailbox.`,
          direction: item.direction,
          messageId: item.messageId,
          queueKey: item.key,
        })
      } else {
        if (!item.destinationUserId) throw new Error('Cloud downlink is missing destination user identity')
        const route = await this.routes.resolve(item.destinationUserId, now)
        if (!route || route.gatewayId !== this.gatewayId) {
          this.pushTrace({
            at: now,
            type: 'route-unavailable',
            summary: `No active radio route for ${item.destinationUserId}.`,
            direction: item.direction,
            messageId: item.messageId,
            queueKey: item.key,
          })
          await this.scheduleRetry(item, now, 'No active radio route for destination user')
          return 'queued'
        }

        this.pushTrace({
          at: now,
          type: 'route-resolved',
          summary: `${item.destinationUserId} resolved to ${route.radioNodeId} through ${route.gatewayId}.`,
          direction: item.direction,
          messageId: item.messageId,
          queueKey: item.key,
          route: `${item.destinationUserId} → ${route.gatewayId} → ${route.radioNodeId}`,
        })

        const frame = createTransportFrame({
          messageId: item.messageId,
          sourceNodeId: `gateway:${this.gatewayId}`,
          destinationNodeId: route.radioNodeId,
          createdAt: now,
          expiresAt: item.expiresAt,
          attempt: item.retryCount + 1,
          payload: item.payload,
        })
        await this.radio.send(frame)
        this.metrics.radioForwarded += 1
        this.pushTrace({
          at: now,
          type: 'radio-forwarded',
          summary: `Logical message ${item.messageId} emitted to radio node ${route.radioNodeId}.`,
          direction: item.direction,
          messageId: item.messageId,
          queueKey: item.key,
          route: `${this.gatewayId} → ${route.radioNodeId}`,
        })
      }

      await Promise.all([
        this.store.deleteQueueItem(item.key),
        this.store.putSeen({
          key: gatewaySeenKey(this.gatewayId, item.direction, item.messageId),
          gatewayId: this.gatewayId,
          direction: item.direction,
          messageId: item.messageId,
          seenAt: now,
        }),
      ])
      return 'forwarded'
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown gateway forwarding error'
      this.metrics.failures += 1
      this.pushTrace({
        at: now,
        type: 'forward-failed',
        summary: `Forwarding failed for ${item.messageId}: ${reason}.`,
        direction: item.direction,
        messageId: item.messageId,
        queueKey: item.key,
      })
      await this.scheduleRetry(item, now, reason)
      return 'queued'
    }
  }

  private async scheduleRetry(item: GatewayQueueItem, now: number, reason: string): Promise<void> {
    const retryCount = item.retryCount + 1
    const backoff = Math.min(30_000, DEFAULT_RETRY_DELAY_MS * 2 ** Math.min(retryCount - 1, 5))
    await this.store.putQueueItem({
      ...item,
      state: 'retrying',
      retryCount,
      nextAttemptAt: now + backoff,
      lastFailureReason: reason,
    })
    this.metrics.retriesScheduled += 1
    this.pushTrace({
      at: now,
      type: 'retry-scheduled',
      summary: `Retry ${retryCount} scheduled in ${backoff}ms: ${reason}.`,
      direction: item.direction,
      messageId: item.messageId,
      queueKey: item.key,
    })
  }

  private pushTrace(event: GatewayTraceEvent): void {
    this.trace.push(event)
  }
}
