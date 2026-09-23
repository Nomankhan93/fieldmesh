import type { FieldMeshEnvelope } from '../core/message/types'

export interface TransportSendResult {
  acceptedAt: number
  transportMessageId: string
}

export interface FieldMeshTransport {
  readonly name: string
  isAvailable(): boolean
  send(envelope: FieldMeshEnvelope): Promise<TransportSendResult>
  setReceiver(receiver: (envelope: FieldMeshEnvelope) => Promise<void>): void
}
