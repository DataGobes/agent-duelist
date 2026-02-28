import type { BenchmarkResult } from '../runner.js'

export function consoleReporter(results: BenchmarkResult[]): void {
  if (results.length === 0) {
    console.log('\nNo results to display.\n')
    return
  }

  const tasks = [...new Set(results.map((r) => r.taskName))]
  const providers = [...new Set(results.map((r) => r.providerId))]

  // Header
  console.log('')
  console.log(bold('Agent Arena Results'))
  console.log(dim('─'.repeat(68)))
  console.log('')

  // Per-task breakdown
  for (const task of tasks) {
    console.log(bold(`Task: ${task}`))
    console.log('')

    const headerRow = [
      pad('Provider', 24),
      pad('Correct', 10),
      pad('Latency', 10),
      pad('Cost', 12),
      pad('Tokens', 12),
    ].join('')
    console.log(dim(headerRow))
    console.log(dim('─'.repeat(68)))

    for (const provider of providers) {
      const taskResults = results.filter(
        (r) => r.taskName === task && r.providerId === provider
      )

      const avgScores = averageScores(taskResults)
      const avgDetails = averageDetails(taskResults)
      const latencyMs = average(taskResults.map((r) => r.raw.latencyMs))

      const correctness = avgScores['correctness']
      const costUsd = avgDetails.costUsd
      const totalTokens = avgDetails.totalTokens

      const row = [
        pad(provider, 24),
        pad(formatCorrectness(correctness), 10),
        pad(latencyMs !== undefined ? `${Math.round(latencyMs)}ms` : '—', 10),
        pad(formatCost(costUsd), 12),
        pad(totalTokens !== undefined ? `${totalTokens}` : '—', 12),
      ].join('')

      console.log(row)
    }

    console.log('')
  }

  // Summary
  console.log(dim('─'.repeat(68)))
  console.log(dim(`${results.length} benchmark(s) across ${tasks.length} task(s) and ${providers.length} provider(s)`))
  console.log(dim('Cost estimates based on published per-token pricing. Run `agent-arena update-pricing` to refresh.'))
  console.log('')
}

interface AggregatedDetails {
  costUsd: number | undefined
  totalTokens: number | undefined
}

function averageScores(results: BenchmarkResult[]): Record<string, number> {
  const sums: Record<string, number> = {}
  const counts: Record<string, number> = {}

  for (const result of results) {
    for (const score of result.scores) {
      if (score.value < 0) continue // skip unavailable scores (e.g. cost = -1)
      sums[score.name] = (sums[score.name] ?? 0) + score.value
      counts[score.name] = (counts[score.name] ?? 0) + 1
    }
  }

  const avgs: Record<string, number> = {}
  for (const name of Object.keys(sums)) {
    avgs[name] = sums[name]! / counts[name]!
  }
  return avgs
}

function averageDetails(results: BenchmarkResult[]): AggregatedDetails {
  let costSum = 0
  let costCount = 0
  let tokenSum = 0
  let tokenCount = 0

  for (const result of results) {
    const costScore = result.scores.find((s) => s.name === 'cost')
    const details = costScore?.details as {
      estimatedUsd?: number | null
      totalTokens?: number
    } | undefined

    if (details?.estimatedUsd != null) {
      costSum += details.estimatedUsd
      costCount++
    }
    if (details?.totalTokens != null) {
      tokenSum += details.totalTokens
      tokenCount++
    }
  }

  return {
    costUsd: costCount > 0 ? costSum / costCount : undefined,
    totalTokens: tokenCount > 0 ? Math.round(tokenSum / tokenCount) : undefined,
  }
}

function average(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function formatCorrectness(value: number | undefined): string {
  if (value === undefined) return '—'
  return `${Math.round(value * 100)}%`
}

function formatCost(usd: number | undefined): string {
  if (usd === undefined) return '—'
  if (usd < 0.00001) return `~$${(usd * 1_000_000).toFixed(1)}µ`
  if (usd < 0.001) return `~$${(usd * 1000).toFixed(3)}m`
  return `~$${usd.toFixed(4)}`
}

function pad(str: string, width: number): string {
  return str.padEnd(width)
}

function bold(str: string): string {
  return `\x1b[1m${str}\x1b[0m`
}

function dim(str: string): string {
  return `\x1b[2m${str}\x1b[0m`
}
