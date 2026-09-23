import type { FieldMeshEnvelope } from '../core/message/types'
import type { FieldMeshTransport, TransportSendResult } from './types'

export interface MockRadioSettings {
  linkUp: boolean
  latencyMs: number
  packetLossPercent: number
}

export class MockRadioTransport implements FieldMeshTransport {
  readonly name = 'mock-radio'
  private receiver?: (envelope: FieldMeshEnvelope) => Promise<void>
  private settings: MockRadioSettings = {
    linkUp: true,
    latencyMs: 300,
    packetLossPercent: 0,
  }

  configure(settings: MockRadioSettings) {
    this.settings = {
      linkUp: settings.linkUp,
      latencyMs: Math.max(0, Math.min(10_000, settings.latencyMs)),
      packetLossPercent: Math.max(0, Math.min(100, settings.packetLossPercent)),
    }
  }

  getSettings(): MockRadioSettings {
    return { ...this.settings }
  }

  isAvailable(): boolean {
    return this.settings.linkUp
  }

  setReceiver(receiver: (envelope: FieldMeshEnvelope) => Promise<void>): void {
    this.receiver = receiver
  }

  async send(envelope: FieldMeshEnvelope): Promise<TransportSendResult> {
    if (!this.settings.linkUp) {
      throw new Error('Simulated radio link is down')
    }

    await new Promise((resolve) => setTimeout(resolve, this.settings.latencyMs))

    if (!this.settings.linkUp) {
      throw new Error('Simulated radio link went down during transmission')
    }

    if (Math.random() * 100 < this.settings.packetLossPercent) {
      throw new Error('Simulated packet loss')
    }

    if (!this.receiver) {
      throw new Error('No simulated radio receiver registered')
    }

    await this.receiver(structuredClone(envelope))

    return {
      acceptedAt: Date.now(),
      transportMessageId: `mock:${envelope.id}`,
    }
  }
}
