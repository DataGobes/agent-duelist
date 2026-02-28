import type { ArenaTask } from '../tasks/types.js'
import type { TaskResult } from '../providers/types.js'

export interface ScoreResult {
  name: string
  value: number
  details?: unknown
}

export interface ScorerContext {
  task: ArenaTask
  result: TaskResult
}

export type ScorerFn = (ctx: ScorerContext, providerId: string) => ScoreResult

export type BuiltInScorerName = 'latency' | 'cost' | 'correctness'
