import { describe, expect, it } from 'vitest'
import { createTransportFrame, type TransportFrame } from '../core/transport/frame'
import { TransportRouter } from './router'
import type { FieldMeshTransport, TransportSendResult } from './types'

class TestTransport implements FieldMeshTransport {
  readonly capabilities = { kind: 'radio' as const }
  readonly name: string
  private available: boolean
  private receiver?: (frame: TransportFrame) => Promise<void>

  constructor(name: string, available: boolean) {
    this.name = name
    this.available = available
  }

  isAvailable(): boolean {
    return this.available
  }

  setReceiver(receiver: (frame: TransportFrame) => Promise<void>): void {
    this.receiver = receiver
  }

  async send(frame: TransportFrame): Promise<TransportSendResult> {
    if (!this.available) throw new Error('offline')
    if (this.receiver) await this.receiver(frame)
    return { acceptedAt: 123, transportMessageId: frame.frameId }
  }
}

function frame() {
  return createTransportFrame({
    messageId: crypto.randomUUID(),
    sourceNodeId: 'a',
    destinationNodeId: 'b',
    createdAt: 100,
    expiresAt: 200,
    attempt: 1,
    payload: new Uint8Array([1]),
  })
}

describe('TransportRouter', () => {
  it('selects the first eligible available transport without implicit multi-transport retry', async () => {
    const offline = new TestTransport('offline-radio', false)
    const online = new TestTransport('online-radio', true)
    const router = new TransportRouter([offline, online])

    const result = await router.send(frame(), {
      preferred: ['offline-radio', 'online-radio'],
      allowedKinds: ['radio'],
    })
    expect(result.transportName).toBe('online-radio')
  })

  it('fails clearly when no eligible transport is available', () => {
    const router = new TransportRouter([new TestTransport('offline-radio', false)])
    expect(() => router.resolve({ allowedKinds: ['radio'] })).toThrow(/no eligible/i)
  })
})
