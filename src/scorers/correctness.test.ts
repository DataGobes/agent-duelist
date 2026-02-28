import { describe, it, expect } from 'vitest'
import { correctnessScorer } from './correctness.js'
import type { ArenaTask } from '../tasks/types.js'
import type { TaskResult } from '../providers/types.js'

function ctx(expected: unknown, output: string | Record<string, unknown>) {
  const task: ArenaTask = { name: 'test', prompt: 'hello', expected }
  const result: TaskResult = { output, latencyMs: 100 }
  return { task, result }
}

describe('correctnessScorer', () => {
  it('returns 1 for exact string match (case-insensitive)', () => {
    const score = correctnessScorer(ctx('hello world', 'Hello World'))
    expect(score.value).toBe(1)
  })

  it('returns 0 for string mismatch', () => {
    const score = correctnessScorer(ctx('hello', 'goodbye'))
    expect(score.value).toBe(0)
  })

  it('returns 1 for matching objects', () => {
    const score = correctnessScorer(ctx({ company: 'Acme' }, { company: 'Acme' }))
    expect(score.value).toBe(1)
  })

  it('returns 0 for mismatched objects', () => {
    const score = correctnessScorer(ctx({ company: 'Acme' }, { company: 'Beta' }))
    expect(score.value).toBe(0)
  })

  it('returns 0.5 when no expected value is given', () => {
    const task: ArenaTask = { name: 'test', prompt: 'hello' }
    const result: TaskResult = { output: 'anything', latencyMs: 100 }
    const score = correctnessScorer({ task, result })
    expect(score.value).toBe(0.5)
  })
})
