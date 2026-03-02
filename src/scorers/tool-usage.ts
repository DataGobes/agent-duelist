import type { ScorerFn } from './types.js'
import { deepEqual } from '../utils/deep-equal.js'

/**
 * Tool-usage scorer — evaluates tool calling accuracy.
 *
 * When task.expected is an object and tools are configured, checks both
 * tool selection and argument correctness:
 *   1.0 — correct tool called with matching arguments
 *   0.5 — correct tool called but arguments don't match
 *   0.0 — wrong tool or no tool called
 *
 * When task.expected is a string (or undefined), only checks if the
 * first configured tool was invoked (1 or 0). Returns -1 (N/A) when
 * no tools are configured on the task.
 */
export const toolUsageScorer: ScorerFn = ({ task, result }) => {
  if (!task.tools?.length) {
    return { name: 'tool-usage', value: -1, details: { reason: 'no tools configured on task' } }
  }

  const calls = result.toolCalls ?? []
  const expectedIsObject = task.expected !== undefined &&
    typeof task.expected === 'object' && task.expected !== null &&
    !Array.isArray(task.expected)

  // Object expected → check tool selection + argument correctness
  if (expectedIsObject) {
    const matchingCall = calls.find((c) => {
      const toolDef = task.tools!.find(t => t.name === c.name)
      if (!toolDef) return false
      return deepEqual(task.expected!, c.arguments)
    })

    if (matchingCall) {
      return {
        name: 'tool-usage',
        value: 1,
        details: { matchedTool: matchingCall.name, arguments: matchingCall.arguments, toolCalls: calls },
      }
    }

    // Partial credit: a tool was called whose arguments share keys with expected
    // (indicates the right tool was selected but with wrong values)
    const expectedKeys = Object.keys(task.expected as Record<string, unknown>)
    const partialMatch = calls.find((c) => {
      if (typeof c.arguments !== 'object' || c.arguments === null) return false
      const argKeys = Object.keys(c.arguments as Record<string, unknown>)
      return expectedKeys.some(k => argKeys.includes(k))
    })

    if (partialMatch) {
      return {
        name: 'tool-usage',
        value: 0.5,
        details: {
          reason: 'correct tool but wrong arguments',
          expected: task.expected,
          actual: partialMatch.arguments,
          toolCalls: calls,
        },
      }
    }

    return {
      name: 'tool-usage',
      value: 0,
      details: { reason: 'no matching tool call', expected: task.expected, toolCalls: calls },
    }
  }

  // String/undefined expected → simple tool name check (legacy behavior)
  const expectedToolName = task.tools[0]!.name
  const usedTool = calls.some((c) => c.name === expectedToolName)

  return {
    name: 'tool-usage',
    value: usedTool ? 1 : 0,
    details: { expectedToolName, usedTool, toolCalls: calls },
  }
}
