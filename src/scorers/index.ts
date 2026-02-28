import type { BuiltInScorerName, ScorerFn } from './types.js'
import { latencyScorer } from './latency.js'
import { costScorer } from './cost.js'
import { correctnessScorer } from './correctness.js'

const builtInScorers: Record<BuiltInScorerName, ScorerFn> = {
  latency: latencyScorer,
  cost: costScorer,
  correctness: correctnessScorer,
}

export function resolveScorers(names: BuiltInScorerName[]): ScorerFn[] {
  return names.map((name) => {
    const scorer = builtInScorers[name]
    if (!scorer) {
      throw new Error(`Unknown scorer: "${name}"`)
    }
    return scorer
  })
}

export type { BuiltInScorerName, ScorerFn, ScoreResult, ScorerContext } from './types.js'
