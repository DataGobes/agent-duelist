import type { ScorerFn } from './types.js'

export const toolUsageScorer: ScorerFn = ({ task, result }) => {
  const expectedToolName = task.tools?.[0]?.name
  if (!expectedToolName) {
    return { name: 'tool-usage', value: -1, details: { reason: 'no tools configured on task' } }
  }

  const usedTool = result.toolCalls?.some((c) => c.name === expectedToolName) ?? false

  return {
    name: 'tool-usage',
    value: usedTool ? 1 : 0,
    details: { expectedToolName, usedTool, toolCalls: result.toolCalls ?? [] },
  }
}
