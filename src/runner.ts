import type { ArenaProvider } from './providers/types.js'
import type { ArenaTask } from './tasks/types.js'
import type { ScoreResult, ScorerFn } from './scorers/types.js'

export interface BenchmarkResult {
  providerId: string
  taskName: string
  run: number
  scores: ScoreResult[]
  raw: {
    output: string | Record<string, unknown>
    latencyMs: number
    usage?: { promptTokens?: number; completionTokens?: number }
  }
}

export interface RunOptions {
  providers: ArenaProvider[]
  tasks: ArenaTask[]
  scorers: ScorerFn[]
  runs: number
  onResult?: (result: BenchmarkResult) => void
}

export async function runBenchmarks(options: RunOptions): Promise<BenchmarkResult[]> {
  const { providers, tasks, scorers, runs, onResult } = options
  const results: BenchmarkResult[] = []

  for (const task of tasks) {
    for (const provider of providers) {
      for (let run = 1; run <= runs; run++) {
        const taskResult = await provider.run({
          prompt: task.prompt,
          schema: task.schema,
        })

        const scores = scorers.map((scorer) =>
          scorer({ task, result: taskResult }, provider.id)
        )

        const result: BenchmarkResult = {
          providerId: provider.id,
          taskName: task.name,
          run,
          scores,
          raw: {
            output: taskResult.output,
            latencyMs: taskResult.latencyMs,
            usage: taskResult.usage,
          },
        }

        results.push(result)
        onResult?.(result)
      }
    }
  }

  return results
}
