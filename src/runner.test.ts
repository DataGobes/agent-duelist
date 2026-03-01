import { describe, it, expect, vi } from 'vitest'
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

function failingProvider(id: string): ArenaProvider {
  return {
    id,
    name: 'Failing',
    model: 'fail-1',
    async run() {
      throw new Error('API key invalid')
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

  it('catches provider errors without aborting other benchmarks', async () => {
    const results = await runBenchmarks({
      providers: [failingProvider('bad'), mockProvider('good', 'ok')],
      tasks: [{ name: 't', prompt: 'test' }],
      scorers: [latencyScorer],
      runs: 1,
    })

    expect(results).toHaveLength(2)
    expect(results[0]!.error).toBe('API key invalid')
    expect(results[0]!.scores).toEqual([])
    expect(results[1]!.error).toBeUndefined()
    expect(results[1]!.scores.length).toBeGreaterThan(0)
  })

  it('records error message for non-Error throws', async () => {
    const provider: ArenaProvider = {
      id: 'weird',
      name: 'Weird',
      model: 'x',
      async run() {
        throw 'string error'
      },
    }

    const results = await runBenchmarks({
      providers: [provider],
      tasks: [{ name: 't', prompt: 'test' }],
      scorers: [latencyScorer],
      runs: 1,
    })

    expect(results[0]!.error).toBe('string error')
  })

  it('marks hung provider calls as timed out at configured duration', async () => {
    vi.useFakeTimers()
    let signalAborted = false
    const provider: ArenaProvider = {
      id: 'hang',
      name: 'Hang',
      model: 'hang-1',
      async run(input) {
        return new Promise((_resolve, reject) => {
          input.signal?.addEventListener('abort', () => {
            signalAborted = input.signal?.aborted ?? false
            reject(new Error('aborted'))
          })
        })
      },
    }

    const runPromise = runBenchmarks({
      providers: [provider],
      tasks: [{ name: 't', prompt: 'test' }],
      scorers: [latencyScorer],
      runs: 1,
      timeout: 500,
    })

    await vi.advanceTimersByTimeAsync(500)
    const results = await runPromise
    vi.useRealTimers()

    expect(results[0]!.error).toBe('Request timed out after 500ms')
    expect(signalAborted).toBe(true)
  })
})
