import type { TransportFrame } from '../transport/frame'
import type { GatewayCloudUpload } from './types'

export interface GatewayRadioAdapter {
  readonly name: string
  isAvailable(): boolean
  send(frame: TransportFrame): Promise<{ acceptedAt: number; transportMessageId: string }>
}

export interface GatewayCloudAdapter {
  readonly name: string
  isAvailable(): boolean
  upload(message: GatewayCloudUpload): Promise<{ acceptedAt: number; cloudMessageId: string; duplicate: boolean }>
}

export class SimulatedCloudMailbox {
  private readonly messages = new Map<string, GatewayCloudUpload>()

  accept(message: GatewayCloudUpload): boolean {
    if (this.messages.has(message.messageId)) return false
    this.messages.set(message.messageId, { ...message, payload: new Uint8Array(message.payload) })
    return true
  }

  get size(): number {
    return this.messages.size
  }

  get(messageId: string): GatewayCloudUpload | undefined {
    const message = this.messages.get(messageId)
    return message ? { ...message, payload: new Uint8Array(message.payload) } : undefined
  }

  list(): GatewayCloudUpload[] {
    return [...this.messages.values()].map((message) => ({ ...message, payload: new Uint8Array(message.payload) }))
  }
}

export class SimulatedGatewayCloudAdapter implements GatewayCloudAdapter {
  readonly name = 'simulated-cloud'
  private available: boolean
  private readonly mailbox: SimulatedCloudMailbox

  constructor(available: boolean, mailbox = new SimulatedCloudMailbox()) {
    this.available = available
    this.mailbox = mailbox
  }

  isAvailable(): boolean {
    return this.available
  }

  setAvailable(available: boolean): void {
    this.available = available
  }

  getMailbox(): SimulatedCloudMailbox {
    return this.mailbox
  }

  async upload(message: GatewayCloudUpload): Promise<{ acceptedAt: number; cloudMessageId: string; duplicate: boolean }> {
    if (!this.available) throw new Error('Gateway internet/cloud transport is unavailable')
    const inserted = this.mailbox.accept(message)
    return {
      acceptedAt: Date.now(),
      cloudMessageId: message.messageId,
      duplicate: !inserted,
    }
  }
}

export class SimulatedGatewayRadioAdapter implements GatewayRadioAdapter {
  readonly name = 'simulated-radio'
  private readonly sentFrames: TransportFrame[] = []
  private available: boolean

  constructor(available: boolean) {
    this.available = available
  }

  isAvailable(): boolean {
    return this.available
  }

  setAvailable(available: boolean): void {
    this.available = available
  }

  getSentFrames(): TransportFrame[] {
    return this.sentFrames.map((frame) => ({ ...frame, payload: new Uint8Array(frame.payload) }))
  }

  async send(frame: TransportFrame): Promise<{ acceptedAt: number; transportMessageId: string }> {
    if (!this.available) throw new Error('Gateway radio transport is unavailable')
    this.sentFrames.push({ ...frame, payload: new Uint8Array(frame.payload) })
    return { acceptedAt: Date.now(), transportMessageId: frame.frameId }
  }
}
