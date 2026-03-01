import type { ArenaProvider, ToolCall } from './providers/types.js'
import type { ArenaTask } from './tasks/types.js'
import type { ScoreResult, ScorerFn } from './scorers/types.js'

export interface BenchmarkResult {
  providerId: string
  taskName: string
  run: number
  scores: ScoreResult[]
  error?: string
  raw: {
    output: string | Record<string, unknown>
    latencyMs: number
    usage?: { promptTokens?: number; completionTokens?: number }
    toolCalls?: ToolCall[]
  }
}

const DEFAULT_TIMEOUT_MS = 60_000

export interface RunOptions {
  providers: ArenaProvider[]
  tasks: ArenaTask[]
  scorers: ScorerFn[]
  runs: number
  timeout?: number
  onResult?: (result: BenchmarkResult) => void
}

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`Request timed out after ${ms}ms`))
    }, ms)
    run(controller.signal).then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

export async function runBenchmarks(options: RunOptions): Promise<BenchmarkResult[]> {
  const { providers, tasks, scorers, runs, onResult } = options
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS

  // Build all provider × task combinations for parallel execution
  const combinations = tasks.flatMap((task, taskIdx) =>
    providers.map((provider, providerIdx) => ({ task, taskIdx, provider, providerIdx }))
  )

  // Run combinations in parallel; runs within each combination stay sequential
  const nested = await Promise.all(
    combinations.map(async ({ task, taskIdx, provider, providerIdx }) => {
      const comboResults: (BenchmarkResult & { _taskIdx: number; _providerIdx: number })[] = []

      for (let run = 1; run <= runs; run++) {
        let result: BenchmarkResult

        try {
          const taskResult = await withTimeout((signal) => provider.run({
              prompt: task.prompt,
              schema: task.schema,
              tools: task.tools,
              signal,
            }), timeout)

          const scores = await Promise.all(
            scorers.map((scorer) => scorer({ task, result: taskResult }, provider.id))
          )

          result = {
            providerId: provider.id,
            taskName: task.name,
            run,
            scores,
            raw: {
              output: taskResult.output,
              latencyMs: taskResult.latencyMs,
              usage: taskResult.usage,
              toolCalls: taskResult.toolCalls,
            },
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)

          result = {
            providerId: provider.id,
            taskName: task.name,
            run,
            scores: [],
            error: message,
            raw: { output: '', latencyMs: 0 },
          }
        }

        comboResults.push({ ...result, _taskIdx: taskIdx, _providerIdx: providerIdx })
        onResult?.(result)
      }

      return comboResults
    })
  )

  // Flatten and sort to match original ordering: task → provider → run
  return nested
    .flat()
    .sort((a, b) => a._taskIdx - b._taskIdx || a._providerIdx - b._providerIdx || a.run - b.run)
    .map(({ _taskIdx: _, _providerIdx: __, ...result }) => result)
}
