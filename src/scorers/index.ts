import type { BuiltInScorerName, ScorerFn } from './types.js'
import { latencyScorer } from './latency.js'
import { costScorer } from './cost.js'
import { correctnessScorer } from './correctness.js'
import { schemaCorrectnessScorer } from './schema-correctness.js'
import { fuzzySimilarityScorer } from './fuzzy-similarity.js'
import { createLlmJudgeScorer } from './llm-judge.js'
import { toolUsageScorer } from './tool-usage.js'

const staticScorers: Partial<Record<BuiltInScorerName, ScorerFn>> = {
  latency: latencyScorer,
  cost: costScorer,
  correctness: correctnessScorer,
  'schema-correctness': schemaCorrectnessScorer,
  'fuzzy-similarity': fuzzySimilarityScorer,
  'tool-usage': toolUsageScorer,
}

export function resolveScorers(names: BuiltInScorerName[], judgeModel?: string, timeoutMs?: number): ScorerFn[] {
  return names.map((name) => {
    if (name === 'llm-judge-correctness') {
      return createLlmJudgeScorer(judgeModel, timeoutMs)
    }
    const scorer = staticScorers[name]
    if (!scorer) {
      throw new Error(`Unknown scorer: "${name}"`)
    }
    return scorer
  })
}

export type { BuiltInScorerName, ScorerFn, ScoreResult, ScorerContext } from './types.js'
