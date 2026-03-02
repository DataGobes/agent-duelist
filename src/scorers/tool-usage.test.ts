import { describe, it, expect } from 'vitest'
import { toolUsageScorer } from './tool-usage.js'
import { z } from 'zod'
import type { ArenaTask } from '../tasks/types.js'
import type { TaskResult } from '../providers/types.js'

function ctx(task: ArenaTask, result: TaskResult) {
  return { task, result }
}

const weatherTool = {
  name: 'getWeather',
  description: 'Get weather',
  parameters: z.object({ city: z.string() }),
}

describe('toolUsageScorer — simple mode (string/undefined expected)', () => {
  it('returns 1 when the expected tool was called', () => {
    const task: ArenaTask = { name: 'test', prompt: 'get weather', tools: [weatherTool] }
    const result: TaskResult = {
      output: 'It is 20°C',
      latencyMs: 100,
      toolCalls: [{ name: 'getWeather', arguments: { city: 'Amsterdam' }, result: { tempC: 20 } }],
    }
    expect(toolUsageScorer(ctx(task, result), 'test').value).toBe(1)
  })

  it('returns 0 when the expected tool was not called', () => {
    const task: ArenaTask = { name: 'test', prompt: 'get weather', tools: [weatherTool] }
    const result: TaskResult = { output: 'I do not know', latencyMs: 100, toolCalls: [] }
    expect(toolUsageScorer(ctx(task, result), 'test').value).toBe(0)
  })

  it('returns 0 when toolCalls is undefined', () => {
    const task: ArenaTask = { name: 'test', prompt: 'get weather', tools: [weatherTool] }
    const result: TaskResult = { output: 'no tools used', latencyMs: 100 }
    expect(toolUsageScorer(ctx(task, result), 'test').value).toBe(0)
  })

  it('returns -1 when no tools are configured on the task', () => {
    const task: ArenaTask = { name: 'test', prompt: 'hello' }
    const result: TaskResult = { output: 'hi', latencyMs: 100 }
    expect(toolUsageScorer(ctx(task, result), 'test').value).toBe(-1)
  })

  it('returns 1 for string expected when tool was called', () => {
    const task: ArenaTask = { name: 'test', prompt: 'get weather', tools: [weatherTool], expected: 'sunny' }
    const result: TaskResult = {
      output: 'sunny',
      latencyMs: 100,
      toolCalls: [{ name: 'getWeather', arguments: { city: 'Paris' } }],
    }
    expect(toolUsageScorer(ctx(task, result), 'test').value).toBe(1)
  })
})

describe('toolUsageScorer — argument checking (object expected)', () => {
  it('returns 1.0 when tool + arguments match', () => {
    const task: ArenaTask = {
      name: 'test',
      prompt: 'weather in Tokyo',
      tools: [weatherTool],
      expected: { city: 'Tokyo' },
    }
    const result: TaskResult = {
      output: 'cloudy',
      latencyMs: 100,
      toolCalls: [{ name: 'getWeather', arguments: { city: 'Tokyo' } }],
    }
    expect(toolUsageScorer(ctx(task, result), 'test').value).toBe(1)
  })

  it('returns 0.5 when right tool but wrong arguments', () => {
    const task: ArenaTask = {
      name: 'test',
      prompt: 'weather in Tokyo',
      tools: [weatherTool],
      expected: { city: 'Tokyo' },
    }
    const result: TaskResult = {
      output: 'rainy',
      latencyMs: 100,
      toolCalls: [{ name: 'getWeather', arguments: { city: 'London' } }],
    }
    const score = toolUsageScorer(ctx(task, result), 'test')
    expect(score.value).toBe(0.5)
  })

  it('returns 0 when no tool was called', () => {
    const task: ArenaTask = {
      name: 'test',
      prompt: 'weather in Tokyo',
      tools: [weatherTool],
      expected: { city: 'Tokyo' },
    }
    const result: TaskResult = { output: 'dunno', latencyMs: 100, toolCalls: [] }
    expect(toolUsageScorer(ctx(task, result), 'test').value).toBe(0)
  })

  it('returns 0 when wrong tool was called', () => {
    const task: ArenaTask = {
      name: 'test',
      prompt: 'convert currency',
      tools: [
        weatherTool,
        {
          name: 'convertCurrency',
          description: 'Convert currency',
          parameters: z.object({ amount: z.number(), from: z.string(), to: z.string() }),
        },
      ],
      expected: { amount: 100, from: 'USD', to: 'EUR' },
    }
    const result: TaskResult = {
      output: 'weather',
      latencyMs: 100,
      toolCalls: [{ name: 'getWeather', arguments: { city: 'Paris' } }],
    }
    expect(toolUsageScorer(ctx(task, result), 'test').value).toBe(0)
  })

  it('tolerates extra keys in actual arguments (1.0)', () => {
    const task: ArenaTask = {
      name: 'test',
      prompt: 'weather in Tokyo',
      tools: [weatherTool],
      expected: { city: 'Tokyo' },
    }
    const result: TaskResult = {
      output: 'cloudy',
      latencyMs: 100,
      toolCalls: [{ name: 'getWeather', arguments: { city: 'Tokyo', units: 'celsius' } }],
    }
    expect(toolUsageScorer(ctx(task, result), 'test').value).toBe(1)
  })

  it('matches across multiple tool calls', () => {
    const task: ArenaTask = {
      name: 'test',
      prompt: 'convert currency',
      tools: [
        weatherTool,
        {
          name: 'convertCurrency',
          description: 'Convert currency',
          parameters: z.object({ amount: z.number(), from: z.string(), to: z.string() }),
        },
      ],
      expected: { amount: 150, from: 'USD', to: 'EUR' },
    }
    const result: TaskResult = {
      output: '138.75 EUR',
      latencyMs: 100,
      toolCalls: [
        { name: 'getWeather', arguments: { city: 'Paris' } },
        { name: 'convertCurrency', arguments: { amount: 150, from: 'USD', to: 'EUR' } },
      ],
    }
    expect(toolUsageScorer(ctx(task, result), 'test').value).toBe(1)
  })
})
