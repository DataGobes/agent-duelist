import { describe, it, expect } from 'vitest'
import { fuzzySimilarityScorer } from './fuzzy-similarity.js'
import type { ArenaTask } from '../tasks/types.js'
import type { TaskResult } from '../providers/types.js'

function ctx(expected: unknown, output: string | Record<string, unknown>) {
  const task: ArenaTask = { name: 'test', prompt: 'hello', expected }
  const result: TaskResult = { output, latencyMs: 100 }
  return { task, result }
}

describe('fuzzySimilarityScorer', () => {
  it('returns 1 for identical strings', () => {
    const score = fuzzySimilarityScorer(ctx('hello world', 'hello world'), 'x')
    expect(score.value).toBe(1)
  })

  it('returns 1 for identical strings regardless of case', () => {
    const score = fuzzySimilarityScorer(ctx('Hello World', 'hello world'), 'x')
    expect(score.value).toBe(1)
  })

  it('returns high similarity for mostly overlapping text', () => {
    const score = fuzzySimilarityScorer(ctx('the quick brown fox', 'the quick brown dog'), 'x')
    expect(score.value).toBeGreaterThan(0.5)
  })

  it('returns 0 for completely different strings', () => {
    const score = fuzzySimilarityScorer(ctx('hello', 'goodbye'), 'x')
    expect(score.value).toBe(0)
  })

  it('works with object expected values (serialized)', () => {
    const score = fuzzySimilarityScorer(
      ctx({ company: 'Acme' }, { company: 'Acme' }),
      'x',
    )
    expect(score.value).toBe(1)
  })

  it('returns -1 when no expected value', () => {
    const score = fuzzySimilarityScorer(ctx(undefined, 'anything'), 'x')
    expect(score.value).toBe(-1)
  })
})
