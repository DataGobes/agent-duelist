import { describe, it, expect } from 'vitest'
import { runBenchmarks } from './runner.js'
import type { ArenaProvider } from './providers/types.js'
import type { ArenaTask } from './tasks/types.js'
import { latencyScorer } from './scorers/latency.js'
import { correctnessScorer } from './scorers/correctness.js'

function mockProvider(id: string, output: string | Record<string, unknown>): ArenaProvider {
  return {
    id,
    name: 'Mock',
    model: 'mock-1',
    async run() {
      return { output, latencyMs: 100 }
    },
  }
}

describe('runBenchmarks', () => {
  it('runs all provider × task combinations', async () => {
    const providers = [mockProvider('a', 'hello'), mockProvider('b', 'hello')]
    const tasks: ArenaTask[] = [
      { name: 'task1', prompt: 'say hello', expected: 'hello' },
      { name: 'task2', prompt: 'say hi' },
    ]

    const results = await runBenchmarks({
      providers,
      tasks,
      scorers: [latencyScorer, correctnessScorer],
      runs: 1,
    })

    expect(results).toHaveLength(4) // 2 providers × 2 tasks
    expect(results[0]!.providerId).toBe('a')
    expect(results[0]!.taskName).toBe('task1')
  })

  it('respects the runs parameter', async () => {
    const results = await runBenchmarks({
      providers: [mockProvider('a', 'ok')],
      tasks: [{ name: 't', prompt: 'test' }],
      scorers: [latencyScorer],
      runs: 3,
    })

    expect(results).toHaveLength(3)
    expect(results.map((r) => r.run)).toEqual([1, 2, 3])
  })

  it('calls onResult callback for each result', async () => {
    const received: string[] = []

    await runBenchmarks({
      providers: [mockProvider('a', 'x')],
      tasks: [{ name: 't', prompt: 'test' }],
      scorers: [latencyScorer],
      runs: 1,
      onResult: (r) => received.push(r.providerId),
    })

    expect(received).toEqual(['a'])
  })
})
