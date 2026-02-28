import type { ScorerFn } from './types.js'

/**
 * Simple exact-match correctness for v0.1.
 *
 * For strings: case-insensitive trimmed comparison.
 * For objects: key-order-independent deep equality.
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
  if (a === b) return true

  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim().toLowerCase() === b.trim().toLowerCase()
  }

  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((val, i) => deepEqual(val, b[i]))
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const objA = a as Record<string, unknown>
    const objB = b as Record<string, unknown>
    const keysA = Object.keys(objA)
    const keysB = Object.keys(objB)
    if (keysA.length !== keysB.length) return false
    return keysA.every((key) => key in objB && deepEqual(objA[key], objB[key]))
  }

  return a === b
}
