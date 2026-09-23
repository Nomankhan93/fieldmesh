export type FieldMeshUserId = string
export type FieldMeshDeviceId = string
export type RadioNodeId = string
export type TransportNodeId = string
export type MessageId = string
export type TransportFrameId = string
export type DeliveryAttemptId = string

export type SimulatorUserId = 'user-a' | 'user-b'
export type SimulatorNodeId = `sim-node:${SimulatorUserId}`

export function simulatorNodeIdForUser(userId: SimulatorUserId): SimulatorNodeId {
  return `sim-node:${userId}`
}
