import type { BuiltInScorerName, ScorerFn } from './types.js'
import { latencyScorer } from './latency.js'
import { costScorer } from './cost.js'
import { correctnessScorer } from './correctness.js'
import { schemaCorrectnessScorer } from './schema-correctness.js'
import { fuzzySimilarityScorer } from './fuzzy-similarity.js'
import { llmJudgeScorerAsync } from './llm-judge.js'

const builtInScorers: Record<BuiltInScorerName, ScorerFn> = {
  latency: latencyScorer,
  cost: costScorer,
  correctness: correctnessScorer,
  'schema-correctness': schemaCorrectnessScorer,
  'fuzzy-similarity': fuzzySimilarityScorer,
  'llm-judge-correctness': llmJudgeScorerAsync,
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
