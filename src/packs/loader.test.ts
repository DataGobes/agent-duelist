import { describe, it, expect } from 'vitest'
import { buildPackConfig } from './loader.js'
import type { ArenaProvider } from '../providers/types.js'

function mockProvider(id: string): ArenaProvider {
  return {
    id,
    name: 'Mock',
    model: 'mock-1',
    async run() {
      return { output: 'test', latencyMs: 100 }
    },
  }
}

describe('buildPackConfig', () => {
  it('builds config from a single pack', () => {
    const config = buildPackConfig({
      packs: ['structured-output'],
      providers: [mockProvider('a')],
    })

    expect(config.providers).toHaveLength(1)
    expect(config.tasks.length).toBe(6)
    expect(config.scorers!.length).toBeGreaterThan(0)
    expect(config.runs).toBe(1)
  })

  it('passes providers through unchanged', () => {
    const providers = [mockProvider('a'), mockProvider('b')]
    const config = buildPackConfig({
      packs: ['structured-output'],
      providers,
    })

    expect(config.providers).toBe(providers)
  })

  it('defaults runs to 1', () => {
    const config = buildPackConfig({
      packs: ['structured-output'],
      providers: [mockProvider('a')],
    })

    expect(config.runs).toBe(1)
  })

  it('respects custom runs value', () => {
    const config = buildPackConfig({
      packs: ['structured-output'],
      providers: [mockProvider('a')],
      runs: 3,
    })

    expect(config.runs).toBe(3)
  })

  it('dedupes scorers when loading the same pack twice', () => {
    // Loading the same pack twice — scorers should be deduped
    const config = buildPackConfig({
      packs: ['structured-output', 'structured-output'],
      providers: [mockProvider('a')],
    })

    const scorerCounts = new Map<string, number>()
    for (const s of config.scorers!) {
      scorerCounts.set(s, (scorerCounts.get(s) ?? 0) + 1)
    }
    for (const [name, count] of scorerCounts) {
      expect(count, `scorer "${name}" should appear only once`).toBe(1)
    }
  })

  it('concatenates tasks across packs', () => {
    // Same pack twice = 12 tasks (6 + 6)
    const config = buildPackConfig({
      packs: ['structured-output', 'structured-output'],
      providers: [mockProvider('a')],
    })

    expect(config.tasks).toHaveLength(12)
  })
})
