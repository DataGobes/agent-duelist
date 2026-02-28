import type { ScorerFn } from './types.js'

export const schemaCorrectnessScorer: ScorerFn = ({ task, result }) => {
  if (!task.schema) {
    return { name: 'schema-correctness', value: -1, details: { reason: 'no schema defined' } }
  }

  let data = result.output
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data) as Record<string, unknown>
    } catch {
      return {
        name: 'schema-correctness',
        value: 0,
        details: { reason: 'output is not valid JSON' },
      }
    }
  }

  const parsed = task.schema.safeParse(data)

  return {
    name: 'schema-correctness',
    value: parsed.success ? 1 : 0,
    details: parsed.success
      ? { valid: true }
      : { valid: false, errors: parsed.error.issues.map((i) => i.message) },
  }
}
