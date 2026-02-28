import type { BenchmarkResult } from '../runner.js'

export function jsonReporter(results: BenchmarkResult[]): string {
  return JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      summary: buildSummary(results),
      results,
    },
    null,
    2
  )
}

function buildSummary(results: BenchmarkResult[]) {
  const tasks = [...new Set(results.map((r) => r.taskName))]
  const providers = [...new Set(results.map((r) => r.providerId))]

  return {
    totalBenchmarks: results.length,
    tasks: tasks.length,
    providers: providers.length,
    providerIds: providers,
    taskNames: tasks,
  }
}
