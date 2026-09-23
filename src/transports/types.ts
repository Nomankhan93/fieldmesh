import type { TransportFrame } from '../core/transport/frame'

export interface TransportCapabilities {
  kind: 'radio' | 'internet' | 'local'
  maxPayloadBytes?: number
}

export interface TransportSendResult {
  acceptedAt: number
  transportMessageId: string
}

export interface FieldMeshTransport {
  readonly name: string
  readonly capabilities: TransportCapabilities
  isAvailable(): boolean
  send(frame: TransportFrame): Promise<TransportSendResult>
  setReceiver(receiver: (frame: TransportFrame) => Promise<void>): void
}
