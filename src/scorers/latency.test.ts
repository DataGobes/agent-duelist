import { describe, it, expect } from 'vitest'
import { latencyScorer } from './latency.js'
import type { ArenaTask } from '../tasks/types.js'
import type { TaskResult } from '../providers/types.js'

const stubTask: ArenaTask = { name: 'test', prompt: 'hello' }

function stubResult(latencyMs: number): TaskResult {
  return { output: '', latencyMs }
}

describe('latencyScorer', () => {
  it('returns 1.0 for very fast responses (≤500ms)', () => {
    const score = latencyScorer({ task: stubTask, result: stubResult(200) })
    expect(score.value).toBe(1)
  })

  it('returns 0.0 for very slow responses (≥10s)', () => {
    const score = latencyScorer({ task: stubTask, result: stubResult(15_000) })
    expect(score.value).toBe(0)
  })

  it('returns ~0.5 for mid-range latency', () => {
    const score = latencyScorer({ task: stubTask, result: stubResult(5_250) })
    expect(score.value).toBe(0.5)
  })

  it('includes ms in details', () => {
    const score = latencyScorer({ task: stubTask, result: stubResult(1_000) })
    expect(score.details).toEqual({ ms: 1_000 })
  })
})
