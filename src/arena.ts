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
}

export interface Arena {
  config: ArenaConfig
  run(): Promise<BenchmarkResult[]>
}

export function defineArena(config: ArenaConfig): Arena {
  if (config.providers.length === 0) {
    throw new Error('At least one provider is required')
  }
  if (config.tasks.length === 0) {
    throw new Error('At least one task is required')
  }

  const scorerNames = config.scorers ?? ['latency', 'cost', 'correctness']
  const scorerFns = resolveScorers(scorerNames)
  const runs = config.runs ?? 1

  return {
    config,

    async run(): Promise<BenchmarkResult[]> {
      const results = await runBenchmarks({
        providers: config.providers,
        tasks: config.tasks,
        scorers: scorerFns,
        runs,
        onResult(result) {
          const scores = result.scores.map((s) => `${s.name}=${s.value}`).join(' ')
          console.log(`  ${result.providerId} × ${result.taskName}: ${scores}`)
        },
      })

      console.log('')
      consoleReporter(results)

      return results
    },
  }
}

// Also export reporters for programmatic use
export { consoleReporter, jsonReporter }
