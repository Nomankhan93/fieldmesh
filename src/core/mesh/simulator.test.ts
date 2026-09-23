import { describe, expect, it } from 'vitest'
import { getMeshScenario } from './scenarios'
import { runMeshSimulation } from './simulator'

function traceTypes(id: string): string[] {
  return runMeshSimulation(getMeshScenario(id)).trace.map((event) => event.type)
}

describe('Advanced Mesh Failure Simulator', () => {
  it('delivers a healthy multi-hop message and receives an application delivery ACK', () => {
    const result = runMeshSimulation(getMeshScenario('healthy'))
    expect(result.status).toBe('acknowledged')
    expect(result.delivered).toBe(true)
    expect(result.acknowledged).toBe(true)
    expect(result.metrics.finalHopCount).toBeGreaterThanOrEqual(3)
    expect(result.metrics.deliveryLatencyMs).toBeDefined()
    expect(result.metrics.acknowledgementLatencyMs).toBeDefined()
    expect(result.metrics.acknowledgementLatencyMs).toBeGreaterThan(result.metrics.deliveryLatencyMs ?? 0)
  })

  it('routes around a failed relay when an alternate path exists', () => {
    const result = runMeshSimulation(getMeshScenario('broken-relay'))
    const selected = result.trace.find((event) => event.type === 'route-selected')
    expect(result.status).toBe('acknowledged')
    expect(selected?.route).toEqual(['A', 'R1', 'R3', 'B'])
  })

  it('fails when the destination is cut off and no route can recover', () => {
    const result = runMeshSimulation(getMeshScenario('broken-link'))
    expect(result.status).toBe('failed')
    expect(result.delivered).toBe(false)
    expect(traceTypes('broken-link')).toContain('route-unavailable')
  })

  it('recovers from a partition on a later retry', () => {
    const result = runMeshSimulation(getMeshScenario('link-recovery'))
    expect(result.status).toBe('acknowledged')
    expect(result.metrics.retriesScheduled).toBeGreaterThan(0)
    expect(result.trace.some((event) => event.type === 'link-state-changed' && event.at === 1300)).toBe(true)
  })

  it('models severe packet loss without claiming delivery', () => {
    const result = runMeshSimulation(getMeshScenario('packet-loss'))
    expect(result.status).toBe('failed')
    expect(result.metrics.framesDropped).toBeGreaterThan(0)
    expect(result.delivered).toBe(false)
  })

  it('retries after ACK loss and suppresses duplicate logical delivery', () => {
    const result = runMeshSimulation(getMeshScenario('ack-loss'))
    expect(result.status).toBe('acknowledged')
    expect(result.metrics.acksDropped).toBeGreaterThan(0)
    expect(result.metrics.retriesScheduled).toBeGreaterThan(0)
    expect(result.metrics.duplicatesSuppressed).toBeGreaterThan(0)
    expect(result.trace.filter((event) => event.type === 'message-delivered')).toHaveLength(1)
  })

  it('suppresses an injected duplicate RF frame', () => {
    const result = runMeshSimulation(getMeshScenario('duplicate-packet'))
    expect(result.status).toBe('acknowledged')
    expect(result.metrics.duplicatesSuppressed).toBeGreaterThan(0)
    expect(result.trace.filter((event) => event.type === 'message-delivered')).toHaveLength(1)
  })

  it('recovers after a relay restart', () => {
    const result = runMeshSimulation(getMeshScenario('relay-restart'))
    expect(result.status).toBe('acknowledged')
    expect(result.metrics.retriesScheduled).toBeGreaterThan(0)
    expect(result.finalNodeStates.R1).toBe('online')
  })

  it('expires a queued message before a late network recovery', () => {
    const result = runMeshSimulation(getMeshScenario('expiration'))
    expect(result.status).toBe('expired')
    expect(result.delivered).toBe(false)
    expect(result.trace.some((event) => event.type === 'message-expired')).toBe(true)
  })

  it('replays deterministically for the same scenario and seed', () => {
    const scenario = getMeshScenario('healthy')
    scenario.links = scenario.links.map((link) => ({
      ...link,
      jitterMs: 75,
      packetLossPercent: 12,
      duplicatePercent: 8,
    }))

    const first = runMeshSimulation(scenario)
    const second = runMeshSimulation(structuredClone(scenario))
    expect(second).toEqual(first)
  })

  it('keeps every built-in baseline scenario aligned with its declared expectation', () => {
    for (const scenarioId of [
      'healthy',
      'broken-relay',
      'broken-link',
      'link-recovery',
      'packet-loss',
      'ack-loss',
      'duplicate-packet',
      'relay-restart',
      'expiration',
    ]) {
      const scenario = getMeshScenario(scenarioId)
      const result = runMeshSimulation(scenario)
      expect(result.status, scenario.name).toBe(scenario.expectation.status)
    }
  })

})
