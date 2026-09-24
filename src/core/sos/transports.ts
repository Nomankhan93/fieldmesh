import type { FieldMeshMessage } from '../message/model'
import { createTransportFrame } from '../transport/frame'
import { encodeSafetyRadioPayload } from './codec'
import type { GatewayAgent } from '../gateway/agent'

export interface SafetyTransportResult {
  received: boolean
  acceptedAt: number
}

export interface SafetyTransportAdapter {
  readonly path: 'internet' | 'radio-gateway-cloud'
  isAvailable(): boolean
  send(message: FieldMeshMessage, now?: number): Promise<SafetyTransportResult>
  reconcile?(message: FieldMeshMessage, now?: number): Promise<'received' | 'pending' | 'expired'>
}

export class SimulatedSafetyInternetAdapter implements SafetyTransportAdapter {
  readonly path = 'internet' as const
  private available: boolean
  private readonly acceptedIds: string[] = []

  constructor(available = true) {
    this.available = available
  }

  isAvailable(): boolean {
    return this.available
  }

  setAvailable(available: boolean): void {
    this.available = available
  }

  getAcceptedIds(): string[] {
    return [...this.acceptedIds]
  }

  async send(message: FieldMeshMessage, now = Date.now()): Promise<SafetyTransportResult> {
    if (!this.available) throw new Error('Phone internet transport is unavailable.')
    if (!this.acceptedIds.includes(message.id)) this.acceptedIds.push(message.id)
    return { received: true, acceptedAt: now }
  }
}

export class GatewaySafetyTransportAdapter implements SafetyTransportAdapter {
  readonly path = 'radio-gateway-cloud' as const
  private readonly agent: GatewayAgent
  private readonly sourceNodeId: string
  private radioAvailable: boolean

  constructor(args: {
    agent: GatewayAgent
    sourceNodeId: string
    radioAvailable?: boolean
  }) {
    this.agent = args.agent
    this.sourceNodeId = args.sourceNodeId
    this.radioAvailable = args.radioAvailable ?? true
  }

  isAvailable(): boolean {
    return this.radioAvailable
  }

  setRadioAvailable(available: boolean): void {
    this.radioAvailable = available
  }

  async send(message: FieldMeshMessage, now = Date.now()): Promise<SafetyTransportResult> {
    if (!this.radioAvailable) throw new Error('Phone radio transport is unavailable.')

    const frame = createTransportFrame({
      messageId: message.id,
      sourceNodeId: this.sourceNodeId,
      destinationNodeId: `gateway:${this.agent.gatewayId}`,
      createdAt: message.createdAt,
      expiresAt: message.expiresAt,
      attempt: 1,
      payload: encodeSafetyRadioPayload(message),
    })

    const result = await this.agent.ingestRadioFrame(frame, now)
    if (result === 'expired') return { received: false, acceptedAt: now }
    if (result === 'forwarded') return { received: true, acceptedAt: now }

    const snapshot = await this.agent.snapshot(now)
    const pending = snapshot.queue.some(
      (item) => item.direction === 'radio-to-cloud' && item.messageId === message.id,
    )
    return { received: !pending, acceptedAt: now }
  }

  async reconcile(message: FieldMeshMessage, now = Date.now()): Promise<'received' | 'pending' | 'expired'> {
    if (message.expiresAt <= now) return 'expired'
    await this.agent.flush(now, true)
    const snapshot = await this.agent.snapshot(now)
    const pending = snapshot.queue.some(
      (item) => item.direction === 'radio-to-cloud' && item.messageId === message.id,
    )
    return pending ? 'pending' : 'received'
  }
}
