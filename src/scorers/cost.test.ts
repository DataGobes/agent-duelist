import { describe, it, expect } from 'vitest'
import { costScorer } from './cost.js'
import type { ArenaTask } from '../tasks/types.js'
import type { TaskResult } from '../providers/types.js'

const stubTask: ArenaTask = { name: 'test', prompt: 'hello' }

function ctx(promptTokens: number, completionTokens: number) {
  const result: TaskResult = {
    output: '',
    latencyMs: 100,
    usage: { promptTokens, completionTokens },
  }
  return { task: stubTask, result }
}

describe('costScorer', () => {
  it('returns real USD estimate for a known model', () => {
    const score = costScorer(ctx(100, 50), 'openai/gpt-4o')
    expect(score.value).toBeGreaterThan(0)
    expect((score.details as { estimatedUsd: number }).estimatedUsd).toBeGreaterThan(0)
  })

  it('returns -1 value for unknown models', () => {
    const score = costScorer(ctx(100, 50), 'unknown/model-xyz')
    expect(score.value).toBe(-1)
    expect((score.details as { note: string }).note).toContain('No pricing data')
  })

  it('resolves azure/* deployments to openai/* pricing', () => {
    const score = costScorer(ctx(100, 50), 'azure/gpt-5-mini')
    expect(score.value).toBeGreaterThan(0)
    expect((score.details as { estimatedUsd: number }).estimatedUsd).toBeGreaterThan(0)
  })

  it('always includes token counts in details', () => {
    const score = costScorer(ctx(200, 100), 'openai/gpt-4o')
    const details = score.details as { promptTokens: number; completionTokens: number; totalTokens: number }
    expect(details.promptTokens).toBe(200)
    expect(details.completionTokens).toBe(100)
    expect(details.totalTokens).toBe(300)
  })
})
