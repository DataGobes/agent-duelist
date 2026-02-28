import { describe, it, expect } from 'vitest'
import { toolUsageScorer } from './tool-usage.js'
import { z } from 'zod'
import type { ArenaTask } from '../tasks/types.js'
import type { TaskResult } from '../providers/types.js'

function ctx(task: ArenaTask, result: TaskResult) {
  return { task, result }
}

describe('toolUsageScorer', () => {
  it('returns 1 when the expected tool was called', () => {
    const task: ArenaTask = {
      name: 'test',
      prompt: 'get weather',
      tools: [{
        name: 'getWeather',
        description: 'Get weather',
        parameters: z.object({ city: z.string() }),
      }],
    }
    const result: TaskResult = {
      output: 'It is 20°C',
      latencyMs: 100,
      toolCalls: [{ name: 'getWeather', arguments: { city: 'Amsterdam' }, result: { tempC: 20 } }],
    }

    const score = toolUsageScorer(ctx(task, result), 'test')
    expect(score.value).toBe(1)
  })

  it('returns 0 when the expected tool was not called', () => {
    const task: ArenaTask = {
      name: 'test',
      prompt: 'get weather',
      tools: [{
        name: 'getWeather',
        description: 'Get weather',
        parameters: z.object({ city: z.string() }),
      }],
    }
    const result: TaskResult = {
      output: 'I do not know',
      latencyMs: 100,
      toolCalls: [],
    }

    const score = toolUsageScorer(ctx(task, result), 'test')
    expect(score.value).toBe(0)
  })

  it('returns 0 when toolCalls is undefined', () => {
    const task: ArenaTask = {
      name: 'test',
      prompt: 'get weather',
      tools: [{
        name: 'getWeather',
        description: 'Get weather',
        parameters: z.object({ city: z.string() }),
      }],
    }
    const result: TaskResult = { output: 'no tools used', latencyMs: 100 }

    const score = toolUsageScorer(ctx(task, result), 'test')
    expect(score.value).toBe(0)
  })

  it('returns -1 when no tools are configured on the task', () => {
    const task: ArenaTask = { name: 'test', prompt: 'hello' }
    const result: TaskResult = { output: 'hi', latencyMs: 100 }

    const score = toolUsageScorer(ctx(task, result), 'test')
    expect(score.value).toBe(-1)
  })
})
