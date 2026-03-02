import { describe, it, expect } from 'vitest'
import { correctnessScorer } from './correctness.js'
import type { ArenaTask } from '../tasks/types.js'
import type { TaskResult } from '../providers/types.js'

function ctx(expected: unknown, output: string | Record<string, unknown> | unknown[]) {
  const task: ArenaTask = { name: 'test', prompt: 'hello', expected }
  const result: TaskResult = { output: output as string | Record<string, unknown>, latencyMs: 100 }
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

  it('returns 1 for matching objects regardless of key order', () => {
    const score = correctnessScorer(
      ctx({ company: 'Acme', year: 2024 }, { year: 2024, company: 'Acme' })
    )
    expect(score.value).toBe(1)
  })

  it('returns 1 for matching nested objects regardless of key order', () => {
    const score = correctnessScorer(
      ctx(
        { meta: { b: 2, a: 1 }, name: 'x' },
        { name: 'x', meta: { a: 1, b: 2 } },
      )
    )
    expect(score.value).toBe(1)
  })

  it('returns 1 for matching arrays', () => {
    const score = correctnessScorer(ctx([1, 2, 3], [1, 2, 3]))
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

  it('tolerates extra keys in actual output', () => {
    const score = correctnessScorer(
      ctx({ company: 'Acme' }, { company: 'Acme', extra: 'field', another: 42 })
    )
    expect(score.value).toBe(1)
  })

  it('unwraps single-key object when expected is an array', () => {
    const score = correctnessScorer(
      ctx([1, 2, 3], { items: [1, 2, 3] })
    )
    expect(score.value).toBe(1)
  })

  it('unwraps nested array-of-objects from wrapper', () => {
    const expected = [
      { name: 'Widget', price: 49.99 },
      { name: 'Chair', price: 199.00 },
    ]
    const score = correctnessScorer(
      ctx(expected, { products: [{ name: 'Widget', price: 49.99 }, { name: 'Chair', price: 199.00 }] })
    )
    expect(score.value).toBe(1)
  })

  it('unwraps multi-key object with only one array-valued key', () => {
    const score = correctnessScorer(
      ctx([1, 2], { items: [1, 2], count: 2 })
    )
    expect(score.value).toBe(1)
  })

  it('unwraps schema-echo wrapper (type + items + $schema)', () => {
    const expected = [{ name: 'A' }, { name: 'B' }]
    const score = correctnessScorer(
      ctx(expected, { type: 'array', items: [{ name: 'A' }, { name: 'B' }], $schema: 'https://json-schema.org/...' })
    )
    expect(score.value).toBe(1)
  })

  it('does not unwrap when multiple array-valued keys exist', () => {
    const score = correctnessScorer(
      ctx([1, 2], { items: [1, 2], others: [3, 4] })
    )
    expect(score.value).toBe(0)
  })
})
