import type { MeshLinkConfig, MeshNodeConfig, MeshScenario } from './types'

const baseNodes: MeshNodeConfig[] = [
  { id: 'A', label: 'User A', kind: 'user', state: 'online' },
  { id: 'R1', label: 'Relay R1', kind: 'relay', state: 'online' },
  { id: 'R2', label: 'Relay R2', kind: 'relay', state: 'online' },
  { id: 'R3', label: 'Relay R3', kind: 'relay', state: 'online' },
  { id: 'B', label: 'User B', kind: 'user', state: 'online' },
  { id: 'G1', label: 'Gateway', kind: 'gateway', state: 'online' },
]

function directedLink(
  id: string,
  from: string,
  to: string,
  overrides: Partial<Omit<MeshLinkConfig, 'id' | 'from' | 'to'>> = {},
): MeshLinkConfig {
  return {
    id,
    from,
    to,
    enabled: true,
    latencyMs: 120,
    jitterMs: 20,
    packetLossPercent: 0,
    ackLossPercent: 0,
    duplicatePercent: 0,
    ...overrides,
  }
}

function pair(a: string, b: string, overrides: Partial<Omit<MeshLinkConfig, 'id' | 'from' | 'to'>> = {}): MeshLinkConfig[] {
  return [
    directedLink(`${a}-${b}`, a, b, overrides),
    directedLink(`${b}-${a}`, b, a, overrides),
  ]
}

function baseLinks(): MeshLinkConfig[] {
  return [
    ...pair('A', 'R1'),
    ...pair('R1', 'R2'),
    ...pair('R2', 'B'),
    ...pair('R1', 'R3', { latencyMs: 170 }),
    ...pair('R3', 'B', { latencyMs: 170 }),
    ...pair('R3', 'G1', { latencyMs: 150 }),
  ]
}

function scenarioBase(
  id: string,
  name: string,
  description: string,
  seed: number,
  expectedStatus: MeshScenario['expectation']['status'] = 'acknowledged',
  expectationSummary = 'The message should be delivered and acknowledged.',
): MeshScenario {
  return {
    id,
    name,
    description,
    seed,
    expectation: { status: expectedStatus, summary: expectationSummary },
    nodes: baseNodes.map((node) => ({ ...node })),
    links: baseLinks(),
    message: {
      id: `msg-${id}`,
      sourceNodeId: 'A',
      destinationNodeId: 'B',
      createdAt: 0,
      ttlMs: 12_000,
      hopLimit: 6,
      maxAttempts: 4,
      retryDelayMs: 800,
      ackTimeoutMs: 500,
    },
    faults: [],
  }
}

export const MESH_SCENARIOS: readonly MeshScenario[] = [
  scenarioBase(
    'healthy',
    'Healthy multi-hop mesh',
    'A reaches B through an available shortest-hop relay path with no injected failures.',
    101,
    'acknowledged',
    'Healthy routing should deliver the message and return the application delivery ACK.',
  ),
  {
    ...scenarioBase(
      'broken-relay',
      'Broken relay with alternate route',
      'R2 fails before transmission. Routing must avoid it and recover through R3.',
      202,
      'acknowledged',
      'Routing should avoid the failed relay and still complete delivery through the alternate path.',
    ),
    faults: [{ at: 0, type: 'node-state', nodeId: 'R2', state: 'offline' }],
  },
  {
    ...scenarioBase(
      'broken-link',
      'Broken mesh cut',
      'Both paths to B are cut. Repeated attempts must fail without inventing connectivity.',
      303,
      'failed',
      'The destination is intentionally cut off, so all attempts should fail without fabricated connectivity.',
    ),
    message: {
      ...scenarioBase('broken-link-base', '', '', 303).message,
      id: 'msg-broken-link',
      maxAttempts: 3,
    },
    faults: [
      { at: 0, type: 'link-state', linkId: 'R2-B', enabled: false },
      { at: 0, type: 'link-state', linkId: 'R3-B', enabled: false },
    ],
  },
  {
    ...scenarioBase(
      'link-recovery',
      'Partition then recovery',
      'B is initially isolated. The cut heals before a retry, and the queued logical message succeeds.',
      404,
      'acknowledged',
      'A retry after the partition heals should deliver and acknowledge the queued logical message.',
    ),
    faults: [
      { at: 0, type: 'link-state', linkId: 'R2-B', enabled: false },
      { at: 0, type: 'link-state', linkId: 'R3-B', enabled: false },
      { at: 1_300, type: 'link-state', linkId: 'R3-B', enabled: true },
      { at: 1_300, type: 'link-state', linkId: 'B-R3', enabled: true },
    ],
  },
  {
    ...scenarioBase(
      'packet-loss',
      'Severe packet loss',
      'The preferred R2 path drops every forward frame. Routing remains valid, but delivery attempts exhaust.',
      505,
      'failed',
      'The only usable forward path drops every final-hop frame, so delivery should fail.',
    ),
    links: baseLinks().map((link) =>
      link.id === 'R2-B' ? { ...link, packetLossPercent: 100 } : link,
    ),
    faults: [
      { at: 0, type: 'link-state', linkId: 'R1-R3', enabled: false },
      { at: 0, type: 'link-state', linkId: 'R3-R1', enabled: false },
    ],
  },
  {
    ...scenarioBase(
      'ack-loss',
      'ACK loss + deduplication',
      'B persists the first message, the return ACK is lost, A retries, and B suppresses the duplicate logical delivery.',
      606,
      'acknowledged',
      'ACK loss should trigger a retry while duplicate logical delivery is suppressed, then acknowledgement should recover.',
    ),
    links: baseLinks().map((link) =>
      link.id === 'B-R2' ? { ...link, ackLossPercent: 100 } : link,
    ),
    faults: [
      { at: 1_500, type: 'link-patch', linkId: 'B-R2', patch: { ackLossPercent: 0 } },
      { at: 0, type: 'link-state', linkId: 'R1-R3', enabled: false },
      { at: 0, type: 'link-state', linkId: 'R3-R1', enabled: false },
    ],
  },
  {
    ...scenarioBase(
      'duplicate-packet',
      'Duplicate RF packet',
      'The final radio link injects a duplicate frame; only one logical delivery may be persisted.',
      707,
      'acknowledged',
      'The injected RF duplicate must be suppressed while the logical message is delivered exactly once.',
    ),
    links: baseLinks().map((link) =>
      link.id === 'R2-B' ? { ...link, duplicatePercent: 100 } : link,
    ),
    faults: [
      { at: 0, type: 'link-state', linkId: 'R1-R3', enabled: false },
      { at: 0, type: 'link-state', linkId: 'R3-R1', enabled: false },
    ],
  },
  {
    ...scenarioBase(
      'relay-restart',
      'Relay restart and retry',
      'R1 restarts at send time and returns later. No route exists until a retry after recovery.',
      808,
      'acknowledged',
      'The message should wait through relay restart and succeed on a later retry.',
    ),
    faults: [
      { at: 0, type: 'node-state', nodeId: 'R1', state: 'restarting' },
      { at: 1_100, type: 'node-state', nodeId: 'R1', state: 'online' },
    ],
  },
  {
    ...scenarioBase(
      'expiration',
      'Message expiration',
      'The mesh remains partitioned longer than the message TTL; retries stop and the message expires.',
      909,
      'expired',
      'The message TTL should expire before the intentionally late network recovery.',
    ),
    message: {
      ...scenarioBase('expiration-base', '', '', 909).message,
      id: 'msg-expiration',
      ttlMs: 1_700,
      maxAttempts: 6,
    },
    faults: [
      { at: 0, type: 'link-state', linkId: 'R2-B', enabled: false },
      { at: 0, type: 'link-state', linkId: 'R3-B', enabled: false },
      { at: 3_000, type: 'link-state', linkId: 'R3-B', enabled: true },
    ],
  },
]

export function getMeshScenario(id: string): MeshScenario {
  const scenario = MESH_SCENARIOS.find((item) => item.id === id)
  if (!scenario) throw new Error(`Unknown mesh scenario: ${id}`)
  return structuredClone(scenario)
}
