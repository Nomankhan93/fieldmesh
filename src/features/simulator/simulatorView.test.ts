import { describe, expect, it } from 'vitest'
import { getMeshScenario } from '../../core/mesh/scenarios'
import { runMeshSimulation } from '../../core/mesh/simulator'
import {
  buildLinkGroups,
  buildNodeStats,
  filterTrace,
  getPreferredRoute,
  routePairKeys,
  unorderedPairKey,
} from './simulatorView'

describe('simulator visualization helpers', () => {
  it('groups directional links into one visual edge and preserves final link state', () => {
    const scenario = getMeshScenario('healthy')
    const result = runMeshSimulation(scenario)
    const groups = buildLinkGroups(scenario.links, result.finalLinkStates, result.trace)
    const edge = groups.find((group) => group.id === unorderedPairKey('A', 'R1'))
    expect(edge?.directionIds).toEqual(expect.arrayContaining(['A-R1', 'R1-A']))
    expect(edge?.state).toBe('online')
    expect(edge?.framesSent).toBeGreaterThan(0)
  })

  it('identifies the delivered route for topology highlighting', () => {
    const result = runMeshSimulation(getMeshScenario('broken-relay'))
    const route = getPreferredRoute(result)
    expect(route).toEqual(['A', 'R1', 'R3', 'B'])
    expect(routePairKeys(route)).toContain(unorderedPairKey('R1', 'R3'))
  })

  it('filters the timeline by semantic category and search text', () => {
    const result = runMeshSimulation(getMeshScenario('ack-loss'))
    const ackEvents = filterTrace(result.trace, 'acks', '')
    const lossEvents = filterTrace(result.trace, 'all', 'lost')
    expect(ackEvents.length).toBeGreaterThan(0)
    expect(ackEvents.every((event) => event.type.startsWith('ack-'))).toBe(true)
    expect(lossEvents.some((event) => event.type === 'ack-dropped')).toBe(true)
  })

  it('computes node inspector activity from trace and topology', () => {
    const scenario = getMeshScenario('healthy')
    const result = runMeshSimulation(scenario)
    const relay = scenario.nodes.find((node) => node.id === 'R1')
    expect(relay).toBeDefined()
    if (!relay) return
    const stats = buildNodeStats(relay, scenario, result)
    expect(stats.framesSent).toBeGreaterThan(0)
    expect(stats.framesReceived).toBeGreaterThan(0)
    expect(stats.events).toBeGreaterThan(0)
  })
})
