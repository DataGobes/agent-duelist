import { describe, it, expect } from 'vitest'
import { defineArena } from './arena.js'
import type { ArenaProvider } from './providers/types.js'

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

describe('defineArena', () => {
  it('throws if no providers are given', () => {
    expect(() =>
      defineArena({ providers: [], tasks: [{ name: 't', prompt: 'p' }] })
    ).toThrow('At least one provider')
  })

  it('throws if no tasks are given', () => {
    expect(() =>
      defineArena({ providers: [mockProvider('a')], tasks: [] })
    ).toThrow('At least one task')
  })

  it('returns an arena with a run method', () => {
    const arena = defineArena({
      providers: [mockProvider('a')],
      tasks: [{ name: 't', prompt: 'p' }],
    })
    expect(typeof arena.run).toBe('function')
  })

  it('run() returns benchmark results without printing', async () => {
    const arena = defineArena({
      providers: [mockProvider('a')],
      tasks: [{ name: 't', prompt: 'p' }],
      scorers: ['latency'],
    })

    const results = await arena.run()
    expect(results).toHaveLength(1)
    expect(results[0]!.providerId).toBe('a')
    expect(results[0]!.scores.length).toBeGreaterThan(0)
  })

  it('run() calls onResult callback', async () => {
    const arena = defineArena({
      providers: [mockProvider('a')],
      tasks: [{ name: 't', prompt: 'p' }],
      scorers: ['latency'],
    })

    const ids: string[] = []
    await arena.run({ onResult: (r) => ids.push(r.providerId) })
    expect(ids).toEqual(['a'])
  })
})
