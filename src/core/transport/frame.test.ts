import { describe, expect, it } from 'vitest'
import { createTransportFrame, isTransportFrameExpired } from './frame'

describe('FieldMesh transport frame', () => {
  it('keeps the logical message ID while each transmission gets its own frame ID', () => {
    const messageId = crypto.randomUUID()
    const expiresAt = 1_800_000_010_000
    const first = createTransportFrame({
      messageId,
      sourceNodeId: 'node-a',
      destinationNodeId: 'node-b',
      createdAt: 1_800_000_000_000,
      expiresAt,
      attempt: 1,
      payload: new Uint8Array([1, 2, 3]),
    })
    const retry = createTransportFrame({
      messageId,
      sourceNodeId: 'node-a',
      destinationNodeId: 'node-b',
      createdAt: 1_800_000_001_000,
      expiresAt,
      attempt: 2,
      payload: new Uint8Array([1, 2, 3]),
    })

    expect(first.messageId).toBe(retry.messageId)
    expect(first.frameId).not.toBe(retry.frameId)
    expect(first.attempt).toBe(1)
    expect(retry.attempt).toBe(2)
  })

  it('reports expiry without changing the frame', () => {
    const frame = createTransportFrame({
      messageId: crypto.randomUUID(),
      sourceNodeId: 'node-a',
      destinationNodeId: 'node-b',
      createdAt: 100,
      expiresAt: 200,
      attempt: 1,
      payload: new Uint8Array([1]),
    })
    expect(isTransportFrameExpired(frame, 199)).toBe(false)
    expect(isTransportFrameExpired(frame, 200)).toBe(true)
  })
})
