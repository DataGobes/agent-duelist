import { describe, it, expect } from 'vitest'
import { toolCallingPack } from './tool-calling.js'

describe('tool-calling pack', () => {
  it('has exactly 4 tasks', () => {
    expect(toolCallingPack.tasks).toHaveLength(4)
  })

  it('every task name starts with "tc:"', () => {
    for (const task of toolCallingPack.tasks) {
      expect(task.name).toMatch(/^tc:/)
    }
  })

  it('every task has tools defined', () => {
    for (const task of toolCallingPack.tasks) {
      expect(task.tools, `${task.name} missing tools`).toBeDefined()
      expect(task.tools!.length, `${task.name} has no tool definitions`).toBeGreaterThan(0)
    }
  })

  it('all tool handlers return without throwing', async () => {
    const sampleArgs: Record<string, unknown> = {
      getWeather: { city: 'Paris' },
      searchRestaurants: { cuisine: 'Italian', location: 'Portland', radiusMiles: 2, minRating: 4, openNow: true },
      convertCurrency: { amount: 100, from: 'USD', to: 'EUR' },
      translateText: { text: 'hello', targetLang: 'es' },
      calculateTip: { billAmount: 50, tipPercent: 20 },
    }
    for (const task of toolCallingPack.tasks) {
      for (const tool of task.tools ?? []) {
        const args = sampleArgs[tool.name] ?? {}
        await expect(Promise.resolve(tool.handler!(args))).resolves.toBeDefined()
      }
    }
  })

  it('all tool parameters are valid Zod schemas', () => {
    for (const task of toolCallingPack.tasks) {
      for (const tool of task.tools ?? []) {
        expect(typeof tool.parameters.safeParse).toBe('function')
      }
    }
  })

  it('has correct pack metadata', () => {
    expect(toolCallingPack.name).toBe('tool-calling')
    expect(toolCallingPack.label).toBe('Tool Calling')
    expect(toolCallingPack.scorers).toContain('tool-usage')
    expect(toolCallingPack.scorers).not.toContain('correctness')
  })
})
