import type { TransportFrame } from '../core/transport/frame'
import type { FieldMeshTransport, TransportSendResult } from './types'

export interface TransportRoutePolicy {
  preferred?: readonly string[]
  allowedKinds?: readonly FieldMeshTransport['capabilities']['kind'][]
}

export interface RoutedSendResult {
  transportName: string
  result: TransportSendResult
}

export class TransportRouter {
  private readonly transports = new Map<string, FieldMeshTransport>()
  private receiver?: (frame: TransportFrame) => Promise<void>

  constructor(transports: readonly FieldMeshTransport[] = []) {
    for (const transport of transports) this.register(transport)
  }

  register(transport: FieldMeshTransport): void {
    if (this.transports.has(transport.name)) {
      throw new Error(`Transport already registered: ${transport.name}`)
    }
    this.transports.set(transport.name, transport)
    if (this.receiver) transport.setReceiver(this.receiver)
  }

  setReceiver(receiver: (frame: TransportFrame) => Promise<void>): void {
    this.receiver = receiver
    for (const transport of this.transports.values()) {
      transport.setReceiver(receiver)
    }
  }

  resolve(policy: TransportRoutePolicy = {}): FieldMeshTransport {
    const preferred = policy.preferred ?? [...this.transports.keys()]
    for (const name of preferred) {
      const transport = this.transports.get(name)
      if (!transport) continue
      if (policy.allowedKinds && !policy.allowedKinds.includes(transport.capabilities.kind)) continue
      if (transport.isAvailable()) return transport
    }

    throw new Error('No eligible FieldMesh transport is currently available')
  }

  async send(frame: TransportFrame, policy: TransportRoutePolicy = {}): Promise<RoutedSendResult> {
    const transport = this.resolve(policy)
    return {
      transportName: transport.name,
      result: await transport.send(frame),
    }
  }
}
