import type { ArenaProvider } from './providers/types.js'
import type { ArenaTask } from './tasks/types.js'
import type { BuiltInScorerName } from './scorers/types.js'
import { resolveScorers } from './scorers/index.js'
import { runBenchmarks, type BenchmarkResult } from './runner.js'
import { consoleReporter } from './reporter/console.js'
import { jsonReporter } from './reporter/json.js'

export interface ArenaConfig {
  providers: ArenaProvider[]
  tasks: ArenaTask[]
  scorers?: BuiltInScorerName[]
  runs?: number
  /** Model to use for llm-judge-correctness (e.g. 'gemini-3.1-pro-preview'). Falls back to DUELIST_JUDGE_MODEL env var, then gpt-5-mini. */
  judgeModel?: string
}

export interface RunOptions {
  /** Called after each individual benchmark completes */
  onResult?: (result: BenchmarkResult) => void
}

export interface Arena {
  config: ArenaConfig
  run(options?: RunOptions): Promise<BenchmarkResult[]>
}

export function defineArena(config: ArenaConfig): Arena {
  if (config.providers.length === 0) {
    throw new Error('At least one provider is required')
  }
  if (config.tasks.length === 0) {
    throw new Error('At least one task is required')
  }

  const scorerNames = config.scorers ?? ['latency', 'cost', 'correctness']
  const scorerFns = resolveScorers(scorerNames, config.judgeModel)
  const runs = config.runs ?? 1

  return {
    config,

    async run(options?: RunOptions): Promise<BenchmarkResult[]> {
      return runBenchmarks({
        providers: config.providers,
        tasks: config.tasks,
        scorers: scorerFns,
        runs,
        onResult: options?.onResult,
      })
    },
  }
}

// Also export reporters for programmatic use
export { consoleReporter, jsonReporter }
