import type { ScorerFn } from './types.js'

/**
 * Simple exact-match correctness for v0.1.
 *
 * For strings: case-insensitive trimmed comparison.
 * For objects: deep equality of JSON-serialized forms.
 * Returns 1 (match) or 0 (no match / no expected value).
 */
export const correctnessScorer: ScorerFn = ({ task, result }) => {
  if (task.expected === undefined) {
    return { name: 'correctness', value: 0.5, details: { reason: 'no expected value' } }
  }

  const match = deepEqual(task.expected, result.output)

  return {
    name: 'correctness',
    value: match ? 1 : 0,
    details: { expected: task.expected, actual: result.output },
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim().toLowerCase() === b.trim().toLowerCase()
  }
  return JSON.stringify(a) === JSON.stringify(b)
}
