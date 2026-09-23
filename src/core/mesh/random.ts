export interface SeededRandom {
  next(): number
  percent(chance: number): boolean
  signed(maxAbsolute: number): number
}

export function createSeededRandom(seed: number): SeededRandom {
  let state = seed >>> 0

  function next(): number {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    percent(chance: number): boolean {
      if (chance <= 0) return false
      if (chance >= 100) return true
      return next() * 100 < chance
    },
    signed(maxAbsolute: number): number {
      if (maxAbsolute <= 0) return 0
      return Math.round((next() * 2 - 1) * maxAbsolute)
    },
  }
}
