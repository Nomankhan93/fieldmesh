import { describe, expect, it } from 'vitest'
import type { MessageId } from '../protocol/ids'
import { createTransportFrame } from '../transport/frame'
import {
  SimulatedCloudMailbox,
  SimulatedGatewayCloudAdapter,
  SimulatedGatewayRadioAdapter,
} from './adapters'
import { GatewayAgent } from './agent'
import { InMemoryGatewayStore } from './store'

const encoder = new TextEncoder()

function radioFrame(messageId: MessageId = crypto.randomUUID(), now = 1_000) {
  return createTransportFrame({
    messageId,
    sourceNodeId: 'radio:user-a',
    destinationNodeId: 'gateway:G1',
    createdAt: now,
    expiresAt: now + 60_000,
    attempt: 1,
    payload: encoder.encode('hello from radio'),
  })
}

function cloudMessage(messageId: MessageId = crypto.randomUUID(), now = 1_000) {
  return {
    messageId,
    destinationUserId: 'user-b',
    createdAt: now,
    expiresAt: now + 60_000,
    payload: encoder.encode('hello from cloud'),
  }
}

describe('Hybrid Gateway Agent', () => {
  it('forwards radio ingress to the cloud while preserving the logical message ID', async () => {
    const store = new InMemoryGatewayStore()
    const mailbox = new SimulatedCloudMailbox()
    const cloud = new SimulatedGatewayCloudAdapter(true, mailbox)
    const radio = new SimulatedGatewayRadioAdapter(true)
    const agent = new GatewayAgent('G1', store, radio, cloud)
    const frame = radioFrame('msg-radio-cloud')

    expect(await agent.ingestRadioFrame(frame, 1_100)).toBe('forwarded')
    expect(mailbox.get(frame.messageId)?.messageId).toBe(frame.messageId)
    expect((await agent.snapshot(1_100)).uplinkQueueDepth).toBe(0)
  })

  it('durably queues radio ingress while internet is down and flushes after recovery', async () => {
    const store = new InMemoryGatewayStore()
    const mailbox = new SimulatedCloudMailbox()
    const cloud = new SimulatedGatewayCloudAdapter(false, mailbox)
    const radio = new SimulatedGatewayRadioAdapter(true)
    const agent = new GatewayAgent('G1', store, radio, cloud)
    const frame = radioFrame('msg-uplink-recovery')

    expect(await agent.ingestRadioFrame(frame, 1_100)).toBe('queued')
    expect((await agent.snapshot(1_100)).uplinkQueueDepth).toBe(1)

    cloud.setAvailable(true)
    await agent.flush(2_100)
    expect(mailbox.get(frame.messageId)?.messageId).toBe(frame.messageId)
    expect((await agent.snapshot(2_100)).uplinkQueueDepth).toBe(0)
  })

  it('restores a pending uplink after gateway-agent restart when the store survives', async () => {
    const store = new InMemoryGatewayStore()
    const mailbox = new SimulatedCloudMailbox()
    const firstCloud = new SimulatedGatewayCloudAdapter(false, mailbox)
    const firstAgent = new GatewayAgent('G1', store, new SimulatedGatewayRadioAdapter(true), firstCloud)
    const frame = radioFrame('msg-restart')

    await firstAgent.ingestRadioFrame(frame, 1_100)
    expect((await firstAgent.snapshot(1_100)).uplinkQueueDepth).toBe(1)

    const restartedCloud = new SimulatedGatewayCloudAdapter(true, mailbox)
    const restarted = new GatewayAgent('G1', store, new SimulatedGatewayRadioAdapter(true), restartedCloud)
    await restarted.flush(2_100)

    expect(mailbox.get(frame.messageId)?.messageId).toBe(frame.messageId)
    expect((await restarted.snapshot(2_100)).uplinkQueueDepth).toBe(0)
  })

  it('forwards cloud downlink to a learned radio route', async () => {
    const store = new InMemoryGatewayStore()
    const radio = new SimulatedGatewayRadioAdapter(true)
    const agent = new GatewayAgent('G1', store, radio, new SimulatedGatewayCloudAdapter(true))
    await agent.learnRoute({ userId: 'user-b', radioNodeId: 'radio:user-b', now: 900, ttlMs: 60_000 })
    const message = cloudMessage('msg-cloud-radio')

    expect(await agent.ingestCloudMessage(message, 1_100)).toBe('forwarded')
    const sent = radio.getSentFrames()
    expect(sent).toHaveLength(1)
    expect(sent[0].messageId).toBe(message.messageId)
    expect(sent[0].destinationNodeId).toBe('radio:user-b')
  })

  it('queues cloud downlink while radio is offline and flushes after radio recovery', async () => {
    const store = new InMemoryGatewayStore()
    const radio = new SimulatedGatewayRadioAdapter(false)
    const agent = new GatewayAgent('G1', store, radio, new SimulatedGatewayCloudAdapter(true))
    await agent.learnRoute({ userId: 'user-b', radioNodeId: 'radio:user-b', now: 900, ttlMs: 60_000 })
    const message = cloudMessage('msg-downlink-recovery')

    expect(await agent.ingestCloudMessage(message, 1_100)).toBe('queued')
    expect((await agent.snapshot(1_100)).downlinkQueueDepth).toBe(1)

    radio.setAvailable(true)
    await agent.flush(2_100)
    expect(radio.getSentFrames().map((frame) => frame.messageId)).toContain(message.messageId)
    expect((await agent.snapshot(2_100)).downlinkQueueDepth).toBe(0)
  })

  it('keeps a cloud downlink queued until a radio route becomes available', async () => {
    const store = new InMemoryGatewayStore()
    const radio = new SimulatedGatewayRadioAdapter(true)
    const agent = new GatewayAgent('G1', store, radio, new SimulatedGatewayCloudAdapter(true))
    const message = cloudMessage('msg-route-later')

    expect(await agent.ingestCloudMessage(message, 1_100)).toBe('queued')
    expect(radio.getSentFrames()).toHaveLength(0)

    await agent.learnRoute({ userId: 'user-b', radioNodeId: 'radio:user-b', now: 1_500, ttlMs: 60_000 })
    await agent.flush(2_100)
    expect(radio.getSentFrames()).toHaveLength(1)
    expect(radio.getSentFrames()[0].messageId).toBe(message.messageId)
  })

  it('suppresses duplicate ingress both while queued and after forwarding', async () => {
    const store = new InMemoryGatewayStore()
    const cloud = new SimulatedGatewayCloudAdapter(false)
    const agent = new GatewayAgent('G1', store, new SimulatedGatewayRadioAdapter(true), cloud)
    const frame = radioFrame('msg-dedupe')

    expect(await agent.ingestRadioFrame(frame, 1_100)).toBe('queued')
    expect(await agent.ingestRadioFrame(frame, 1_200)).toBe('duplicate')

    cloud.setAvailable(true)
    await agent.flush(2_100)
    expect(await agent.ingestRadioFrame(frame, 2_200)).toBe('duplicate')

    const snapshot = await agent.snapshot(2_200)
    expect(snapshot.metrics.duplicatesSuppressed).toBe(2)
  })

  it('allows multiple gateways to upload one logical message without duplicating the shared cloud mailbox', async () => {
    const mailbox = new SimulatedCloudMailbox()
    const messageId = 'msg-multi-gateway'
    const frame = radioFrame(messageId)
    const g1 = new GatewayAgent(
      'G1',
      new InMemoryGatewayStore(),
      new SimulatedGatewayRadioAdapter(true),
      new SimulatedGatewayCloudAdapter(true, mailbox),
    )
    const g2 = new GatewayAgent(
      'G2',
      new InMemoryGatewayStore(),
      new SimulatedGatewayRadioAdapter(true),
      new SimulatedGatewayCloudAdapter(true, mailbox),
    )

    await g1.ingestRadioFrame(frame, 1_100)
    await g2.ingestRadioFrame(frame, 1_120)
    expect(mailbox.size).toBe(1)
    expect(mailbox.get(messageId)?.messageId).toBe(messageId)
  })

  it('expires queued traffic instead of forwarding stale data after recovery', async () => {
    const store = new InMemoryGatewayStore()
    const cloud = new SimulatedGatewayCloudAdapter(false)
    const agent = new GatewayAgent('G1', store, new SimulatedGatewayRadioAdapter(true), cloud)
    const frame = createTransportFrame({
      messageId: 'msg-expired-gateway',
      sourceNodeId: 'radio:user-a',
      destinationNodeId: 'gateway:G1',
      createdAt: 1_000,
      expiresAt: 1_500,
      attempt: 1,
      payload: encoder.encode('short ttl'),
    })

    expect(await agent.ingestRadioFrame(frame, 1_100)).toBe('queued')
    cloud.setAvailable(true)
    await agent.flush(2_100)
    const snapshot = await agent.snapshot(2_100)
    expect(snapshot.uplinkQueueDepth).toBe(0)
    expect(snapshot.metrics.expired).toBe(1)
  })

  it('does not resolve an expired routing-registry entry', async () => {
    const store = new InMemoryGatewayStore()
    const agent = new GatewayAgent(
      'G1',
      store,
      new SimulatedGatewayRadioAdapter(true),
      new SimulatedGatewayCloudAdapter(true),
    )
    await agent.learnRoute({ userId: 'user-b', radioNodeId: 'radio:user-b', now: 1_000, ttlMs: 500 })

    expect(await agent.routes.resolve('user-b', 1_400)).toBeDefined()
    expect(await agent.routes.resolve('user-b', 1_501)).toBeUndefined()
  })
})
