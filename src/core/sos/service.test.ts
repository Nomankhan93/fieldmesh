import { describe, expect, it } from 'vitest'
import { SimulatedCloudMailbox, SimulatedGatewayCloudAdapter, SimulatedGatewayRadioAdapter } from '../gateway/adapters'
import { GatewayAgent } from '../gateway/agent'
import { InMemoryGatewayStore } from '../gateway/store'
import { createLocationFix } from '../location/types'
import { FieldSafetyService } from './service'
import { InMemoryFieldSafetyStore } from './store'
import { GatewaySafetyTransportAdapter, SimulatedSafetyInternetAdapter } from './transports'

function harness(args?: {
  internet?: boolean
  phoneRadio?: boolean
  gatewayInternet?: boolean
}) {
  const safetyStore = new InMemoryFieldSafetyStore()
  const mailbox = new SimulatedCloudMailbox()
  const gatewayCloud = new SimulatedGatewayCloudAdapter(args?.gatewayInternet ?? true, mailbox)
  const gatewayAgent = new GatewayAgent(
    'G1',
    new InMemoryGatewayStore(),
    new SimulatedGatewayRadioAdapter(true),
    gatewayCloud,
  )
  const internet = new SimulatedSafetyInternetAdapter(args?.internet ?? true)
  const gateway = new GatewaySafetyTransportAdapter({
    agent: gatewayAgent,
    sourceNodeId: 'radio:user-a',
    radioAvailable: args?.phoneRadio ?? true,
  })
  const service = new FieldSafetyService(safetyStore, internet, gateway)
  return { service, safetyStore, internet, gateway, gatewayCloud, gatewayAgent, mailbox }
}

const fix = createLocationFix({
  id: 'fix-1',
  latitude: 25.36,
  longitude: 69.74,
  accuracy: 9,
  capturedAt: 900,
  source: 'simulated',
})

describe('FieldMesh Location + SOS', () => {
  it('sends an SOS directly over Internet and reaches received state', async () => {
    const { service, internet } = harness({ internet: true, phoneRadio: true })
    const sos = await service.createSos({
      senderUserId: 'user-a',
      category: 'medical',
      location: fix,
      note: 'Need help',
      id: 'msg-internet',
      sosId: 'sos-internet',
      now: 1_000,
    })

    const delivered = await service.dispatchSos(sos.id, 1_100)
    expect(delivered.status).toBe('received')
    expect(delivered.path).toBe('internet')
    expect(internet.getAcceptedIds()).toEqual(['msg-internet'])
  })

  it('allows SOS transmission without GPS', async () => {
    const { service } = harness({ internet: true })
    const sos = await service.createSos({
      senderUserId: 'user-a',
      category: 'lost',
      id: 'msg-no-gps',
      sosId: 'sos-no-gps',
      now: 1_000,
    })

    expect(sos.location).toBeUndefined()
    expect((await service.dispatchSos(sos.id, 1_100)).status).toBe('received')
  })

  it('falls back to Radio → Gateway → Cloud while phone Internet is down', async () => {
    const { service, mailbox } = harness({ internet: false, phoneRadio: true, gatewayInternet: true })
    const sos = await service.createSos({
      senderUserId: 'user-a',
      category: 'security',
      id: 'msg-hybrid',
      sosId: 'sos-hybrid',
      now: 1_000,
    })

    const delivered = await service.dispatchSos(sos.id, 1_100)
    expect(delivered.status).toBe('received')
    expect(delivered.path).toBe('radio-gateway-cloud')
    expect(mailbox.get('msg-hybrid')?.messageId).toBe('msg-hybrid')
  })

  it('keeps SOS transmitted at the durable gateway while gateway Internet is down, then reconciles after recovery', async () => {
    const { service, gatewayCloud, mailbox } = harness({
      internet: false,
      phoneRadio: true,
      gatewayInternet: false,
    })
    const sos = await service.createSos({
      senderUserId: 'user-a',
      category: 'accident',
      id: 'msg-gateway-queue',
      sosId: 'sos-gateway-queue',
      now: 1_000,
    })

    const transmitted = await service.dispatchSos(sos.id, 1_100)
    expect(transmitted.status).toBe('transmitted')
    expect(transmitted.path).toBe('radio-gateway-cloud')
    expect(mailbox.size).toBe(0)

    gatewayCloud.setAvailable(true)
    const recovered = await service.dispatchSos(sos.id, 2_100)
    expect(recovered.status).toBe('received')
    expect(mailbox.get('msg-gateway-queue')?.messageId).toBe('msg-gateway-queue')
  })

  it('queues locally when neither Internet nor phone radio is available and retries after recovery', async () => {
    const { service, internet, gateway } = harness({ internet: false, phoneRadio: false })
    const sos = await service.createSos({
      senderUserId: 'user-a',
      category: 'vehicle',
      id: 'msg-local-queue',
      sosId: 'sos-local-queue',
      now: 1_000,
    })

    expect((await service.dispatchSos(sos.id, 1_100)).status).toBe('queued')
    internet.setAvailable(true)
    gateway.setRadioAvailable(true)
    await service.retryPending(2_000)
    expect((await service.snapshot()).sos[0]?.status).toBe('received')
  })

  it('expires stale queued SOS instead of resurrecting it', async () => {
    const { service } = harness({ internet: false, phoneRadio: false })
    const sos = await service.createSos({
      senderUserId: 'user-a',
      category: 'other',
      id: 'msg-expired',
      sosId: 'sos-expired',
      now: 1_000,
      ttlMs: 500,
    })

    expect((await service.dispatchSos(sos.id, 1_600)).status).toBe('expired')
  })

  it('enforces received → acknowledged → resolved lifecycle', async () => {
    const { service } = harness({ internet: true })
    const sos = await service.createSos({
      senderUserId: 'user-a',
      category: 'medical',
      id: 'msg-lifecycle',
      sosId: 'sos-lifecycle',
      now: 1_000,
    })

    await expect(service.resolve(sos.id, 'Responder', 1_050)).rejects.toThrow()
    await service.dispatchSos(sos.id, 1_100)
    const acknowledged = await service.acknowledge(sos.id, 'Responder 1', 1_200)
    expect(acknowledged.status).toBe('acknowledged')
    const resolved = await service.resolve(sos.id, 'Responder 1', 1_300)
    expect(resolved.status).toBe('resolved')
  })

  it('creates and delivers manual location updates with location priority', async () => {
    const { service } = harness({ internet: true })
    await service.saveLocationFix(fix)
    const share = await service.createLocationShare({
      senderUserId: 'user-a',
      location: fix,
      id: 'location-message-1',
      now: 1_000,
    })

    expect(share.message.priority).toBe('location')
    expect((await service.dispatchLocationShare(share.id, 1_100)).status).toBe('received')
    expect((await service.listLocationFixes())[0]?.id).toBe('fix-1')
  })

  it('retries SOS before older location traffic because emergency has higher priority', async () => {
    const { service, internet } = harness({ internet: false, phoneRadio: false })
    const location = await service.createLocationShare({
      senderUserId: 'user-a',
      location: fix,
      id: 'location-priority',
      now: 900,
    })
    await service.dispatchLocationShare(location.id, 950)

    const sos = await service.createSos({
      senderUserId: 'user-a',
      category: 'security',
      id: 'sos-priority-message',
      sosId: 'sos-priority',
      now: 1_000,
    })
    await service.dispatchSos(sos.id, 1_050)

    internet.setAvailable(true)
    await service.retryPending(2_000)
    expect(internet.getAcceptedIds()).toEqual(['sos-priority-message', 'location-priority'])
  })

  it('records an auditable SOS event timeline', async () => {
    const { service } = harness({ internet: true })
    const sos = await service.createSos({
      senderUserId: 'user-a',
      category: 'medical',
      id: 'msg-events',
      sosId: 'sos-events',
      now: 1_000,
    })
    await service.dispatchSos(sos.id, 1_100)
    await service.acknowledge(sos.id, 'Responder', 1_200)
    await service.resolve(sos.id, 'Responder', 1_300)

    const events = (await service.snapshot()).events.filter((event) => event.sosId === sos.id)
    expect(events.map((event) => event.type)).toEqual([
      'created',
      'transmitted',
      'received',
      'acknowledged',
      'resolved',
    ])
  })
})
