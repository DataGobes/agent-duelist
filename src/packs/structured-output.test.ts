import { describe, it, expect } from 'vitest'
import { structuredOutputPack } from './structured-output.js'
import type { ZodSchema } from 'zod'

describe('structured-output pack', () => {
  it('has exactly 6 tasks', () => {
    expect(structuredOutputPack.tasks).toHaveLength(6)
  })

  it('every task has prompt, expected, and schema defined', () => {
    for (const task of structuredOutputPack.tasks) {
      expect(task.prompt, `${task.name} missing prompt`).toBeTruthy()
      expect(task.expected, `${task.name} missing expected`).toBeDefined()
      expect(task.schema, `${task.name} missing schema`).toBeDefined()
    }
  })

  it('every task name starts with "so:"', () => {
    for (const task of structuredOutputPack.tasks) {
      expect(task.name).toMatch(/^so:/)
    }
  })

  it('schemas validate their expected values', () => {
    for (const task of structuredOutputPack.tasks) {
      const schema = task.schema as ZodSchema
      const result = schema.safeParse(task.expected)
      expect(result.success, `${task.name} schema rejects its own expected value: ${JSON.stringify((result as any).error?.issues)}`).toBe(true)
    }
  })

  it('no task prompt exceeds 1000 characters', () => {
    for (const task of structuredOutputPack.tasks) {
      expect(task.prompt.length, `${task.name} prompt is ${task.prompt.length} chars`).toBeLessThanOrEqual(1000)
    }
  })

  it('has correct pack metadata', () => {
    expect(structuredOutputPack.name).toBe('structured-output')
    expect(structuredOutputPack.label).toBe('Structured Output')
    expect(structuredOutputPack.scorers).toContain('correctness')
    expect(structuredOutputPack.scorers).toContain('schema-correctness')
  })
})
