import type { ScorerFn } from './types.js'

/**
 * Correctness scorer for LLM output evaluation.
 *
 * For strings: case-insensitive trimmed comparison.
 * For objects: checks all expected keys exist with matching values (extra keys in actual are tolerated).
 * For arrays: if actual is an object wrapping a single array, unwraps it before comparing.
 * Returns 1 (match), 0 (no match), or 0.5 (no expected value defined).
 */
export const correctnessScorer: ScorerFn = ({ task, result }) => {
  if (task.expected === undefined) {
    return { name: 'correctness', value: 0.5, details: { reason: 'no expected value' } }
  }

  const actual = normalizeOutput(task.expected, result.output)
  const match = deepEqual(task.expected, actual)

  return {
    name: 'correctness',
    value: match ? 1 : 0,
    details: { expected: task.expected, actual: result.output },
  }
}

/**
 * Normalize model output to align with the expected shape.
 * Handles two common cases where json_object mode forces array responses
 * into wrapper objects:
 * - Single-key wrapper: { "products": [...] }
 * - Schema-echo wrapper: { "type": "array", "items": [...], "$schema": "..." }
 *
 * Strategy: if expected is an array and actual is an object, find all keys
 * whose value is an array. If exactly one exists, unwrap it.
 */
function normalizeOutput(expected: unknown, actual: unknown): unknown {
  if (Array.isArray(expected) && !Array.isArray(actual) && typeof actual === 'object' && actual !== null) {
    const entries = Object.entries(actual as Record<string, unknown>)
    const arrayEntries = entries.filter(([, v]) => Array.isArray(v))
    if (arrayEntries.length === 1) {
      return arrayEntries[0]![1]
    }
  }
  return actual
}

function deepEqual(expected: unknown, actual: unknown): boolean {
  if (expected === actual) return true

  if (typeof expected === 'string' && typeof actual === 'string') {
    return expected.trim().toLowerCase() === actual.trim().toLowerCase()
  }

  if (typeof expected !== typeof actual) return false
  if (expected === null || actual === null) return expected === actual

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return false
    return expected.every((val, i) => deepEqual(val, actual[i]))
  }

  if (typeof expected === 'object' && typeof actual === 'object') {
    const objExpected = expected as Record<string, unknown>
    const objActual = actual as Record<string, unknown>
    const keysExpected = Object.keys(objExpected)
    // Check that all expected keys exist in actual with matching values.
    // Extra keys in actual are tolerated — LLMs often add unrequested fields.
    return keysExpected.every((key) => key in objActual && deepEqual(objExpected[key], objActual[key]))
  }

  return expected === actual
}
