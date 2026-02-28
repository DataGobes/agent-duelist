import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { schemaCorrectnessScorer } from './schema-correctness.js'
import type { ArenaTask } from '../tasks/types.js'
import type { TaskResult } from '../providers/types.js'

function ctx(schema: ArenaTask['schema'], output: string | Record<string, unknown>) {
  const task: ArenaTask = { name: 'test', prompt: 'hello', schema }
  const result: TaskResult = { output, latencyMs: 100 }
  return { task, result }
}

describe('schemaCorrectnessScorer', () => {
  const schema = z.object({ company: z.string(), year: z.number() })

  it('returns 1 for valid output matching schema', () => {
    const score = schemaCorrectnessScorer(ctx(schema, { company: 'Acme', year: 2024 }), 'x')
    expect(score.value).toBe(1)
  })

  it('returns 1 when output is a JSON string matching schema', () => {
    const score = schemaCorrectnessScorer(ctx(schema, '{"company":"Acme","year":2024}'), 'x')
    expect(score.value).toBe(1)
  })

  it('returns 0 for output missing required fields', () => {
    const score = schemaCorrectnessScorer(ctx(schema, { company: 'Acme' }), 'x')
    expect(score.value).toBe(0)
  })

  it('returns 0 for invalid JSON string', () => {
    const score = schemaCorrectnessScorer(ctx(schema, 'not json'), 'x')
    expect(score.value).toBe(0)
  })

  it('returns -1 when no schema is defined', () => {
    const score = schemaCorrectnessScorer(ctx(undefined, 'anything'), 'x')
    expect(score.value).toBe(-1)
  })
})
