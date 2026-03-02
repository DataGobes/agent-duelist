import { describe, it, expect } from 'vitest'
import { reasoningPack } from './reasoning.js'
import type { ZodSchema } from 'zod'

describe('reasoning pack', () => {
  it('has exactly 5 tasks', () => {
    expect(reasoningPack.tasks).toHaveLength(5)
  })

  it('every task name starts with "rs:"', () => {
    for (const task of reasoningPack.tasks) {
      expect(task.name).toMatch(/^rs:/)
    }
  })

  it('every task has prompt, expected, and schema defined', () => {
    for (const task of reasoningPack.tasks) {
      expect(task.prompt, `${task.name} missing prompt`).toBeTruthy()
      expect(task.expected, `${task.name} missing expected`).toBeDefined()
      expect(task.schema, `${task.name} missing schema`).toBeDefined()
    }
  })

  it('schemas validate their expected values', () => {
    for (const task of reasoningPack.tasks) {
      const schema = task.schema as ZodSchema
      const result = schema.safeParse(task.expected)
      expect(result.success, `${task.name} schema rejects its own expected value: ${JSON.stringify((result as any).error?.issues)}`).toBe(true)
    }
  })

  it('rs:saas-mrr-calc expected MRR is correct (210×49 + 115×149 = 27425)', () => {
    const task = reasoningPack.tasks.find(t => t.name === 'rs:saas-mrr-calc')
    expect((task!.expected as any).mrr).toBe(27425)
    // Verify: 200 basic - 30 upgraded + 40 new = 210 basic, 85 + 30 = 115 pro
    expect(210 * 49 + 115 * 149).toBe(27425)
  })

  it('rs:data-interpretation fullYearRevenue is 9.5', () => {
    const task = reasoningPack.tasks.find(t => t.name === 'rs:data-interpretation')
    expect((task!.expected as any).fullYearRevenue).toBe(9.5)
    expect(2.1 + 2.4 + 2.2 + 2.8).toBe(9.5)
  })

  it('rs:critical-path totalMinutes is 16', () => {
    const task = reasoningPack.tasks.find(t => t.name === 'rs:critical-path')
    expect((task!.expected as any).totalMinutes).toBe(16)
    // Build(3) + Integration(8) + Staging(2) + Smoke(3) = 16
    expect(3 + 8 + 2 + 3).toBe(16)
  })

  it('rs:pricing-rules expected values are correct', () => {
    const task = reasoningPack.tasks.find(t => t.name === 'rs:pricing-rules')
    const expected = task!.expected as Array<{ id: string; finalPrice: number }>
    expect(expected.find(c => c.id === 'B')!.finalPrice).toBe(59.5)
    expect(expected.find(c => c.id === 'C')!.finalPrice).toBe(50)
    // Verify B: 100 * 0.70 * 0.85 = 59.5
    expect(100 * 0.70 * 0.85).toBe(59.5)
  })

  it('has correct pack metadata', () => {
    expect(reasoningPack.name).toBe('reasoning')
    expect(reasoningPack.label).toBe('Reasoning')
    expect(reasoningPack.scorers).toContain('correctness')
  })
})
