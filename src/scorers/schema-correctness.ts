import type { ScorerFn } from './types.js'

export const schemaCorrectnessScorer: ScorerFn = ({ task, result }) => {
  if (!task.schema) {
    return { name: 'schema-correctness', value: -1, details: { reason: 'no schema defined' } }
  }

  let data: unknown = result.output
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return {
        name: 'schema-correctness',
        value: 0,
        details: { reason: 'output is not valid JSON' },
      }
    }
  }

  let parsed = task.schema.safeParse(data)

  // If validation fails and data is an object wrapping a single array,
  // try unwrapping — handles json_object mode forcing arrays into objects.
  if (!parsed.success && !Array.isArray(data) && typeof data === 'object' && data !== null) {
    const arrayEntries = Object.entries(data as Record<string, unknown>).filter(([, v]) => Array.isArray(v))
    if (arrayEntries.length === 1) {
      const unwrapped = task.schema.safeParse(arrayEntries[0]![1])
      if (unwrapped.success) parsed = unwrapped
    }
  }

  return {
    name: 'schema-correctness',
    value: parsed.success ? 1 : 0,
    details: parsed.success
      ? { valid: true }
      : { valid: false, errors: parsed.error.issues.map((i) => i.message) },
  }
}
