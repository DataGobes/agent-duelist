/**
 * Deep equality check with LLM-friendly tolerance:
 * - Strings: case-insensitive trimmed comparison
 * - Objects: all expected keys must match (extra keys in actual are tolerated)
 * - Arrays: element-wise comparison
 */
export function deepEqual(expected: unknown, actual: unknown): boolean {
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
    return keysExpected.every((key) => key in objActual && deepEqual(objExpected[key], objActual[key]))
  }

  return expected === actual
}
