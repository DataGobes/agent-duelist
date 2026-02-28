import type { BenchmarkResult } from '../runner.js'

export function consoleReporter(results: BenchmarkResult[]): void {
  if (results.length === 0) {
    console.log('\nNo results to display.\n')
    return
  }

  const tasks = [...new Set(results.map((r) => r.taskName))]
  const providers = [...new Set(results.map((r) => r.providerId))]

  // Derive which scorers are actually present in results
  const scorerNames = [
    ...new Set(results.flatMap((r) => r.scores.map((s) => s.name))),
  ]

  const hasCost = scorerNames.includes('cost')
  const hasErrors = results.some((r) => r.error)

  // Header
  console.log(bold('Agent Arena Results'))
  console.log(dim('─'.repeat(72)))
  console.log('')

  // Per-task breakdown
  for (const task of tasks) {
    console.log(bold(`Task: ${task}`))
    console.log('')

    // Build dynamic header
    const columns: Column[] = [{ label: 'Provider', width: 24 }]
    for (const name of scorerNames) {
      if (name === 'latency') columns.push({ label: 'Latency', width: 10 })
      else if (name === 'cost') {
        columns.push({ label: 'Cost', width: 12 })
        columns.push({ label: 'Tokens', width: 10 })
      } else if (name === 'correctness') columns.push({ label: 'Correct', width: 10 })
      else columns.push({ label: name, width: 10 })
    }
    if (hasErrors) columns.push({ label: 'Status', width: 10 })

    const totalWidth = columns.reduce((sum, c) => sum + c.width, 0)
    console.log(dim(columns.map((c) => pad(c.label, c.width)).join('')))
    console.log(dim('─'.repeat(totalWidth)))

    for (const provider of providers) {
      const taskResults = results.filter(
        (r) => r.taskName === task && r.providerId === provider
      )

      const errorResults = taskResults.filter((r) => r.error)
      const successResults = taskResults.filter((r) => !r.error)

      if (successResults.length === 0 && errorResults.length > 0) {
        // All runs failed for this provider+task
        const cells: string[] = [pad(provider, 24)]
        for (const name of scorerNames) {
          if (name === 'cost') {
            cells.push(pad('—', 12))
            cells.push(pad('—', 10))
          } else {
            cells.push(pad('—', 10))
          }
        }
        if (hasErrors) cells.push(pad('FAIL', 10))
        console.log(cells.join(''))
        continue
      }

      const avgScores = averageScores(successResults)
      const avgDetails = averageDetails(successResults)
      const latencyMs = average(successResults.map((r) => r.raw.latencyMs))

      const cells: string[] = [pad(provider, 24)]
      for (const name of scorerNames) {
        if (name === 'latency') {
          cells.push(pad(latencyMs !== undefined ? `${Math.round(latencyMs)}ms` : '—', 10))
        } else if (name === 'cost') {
          cells.push(pad(formatCost(avgDetails.costUsd), 12))
          cells.push(pad(avgDetails.totalTokens !== undefined ? `${avgDetails.totalTokens}` : '—', 10))
        } else if (name === 'correctness') {
          cells.push(pad(formatCorrectness(avgScores['correctness']), 10))
        } else {
          const val = avgScores[name]
          cells.push(pad(val !== undefined ? val.toFixed(2) : '—', 10))
        }
      }
      if (hasErrors) {
        const failCount = errorResults.length
        cells.push(pad(failCount > 0 ? `${failCount} err` : 'OK', 10))
      }
      console.log(cells.join(''))
    }

    console.log('')
  }

  // Summary
  const errorCount = results.filter((r) => r.error).length
  console.log(dim('─'.repeat(72)))
  console.log(dim(`${results.length} benchmark(s) across ${tasks.length} task(s) and ${providers.length} provider(s)`))
  if (errorCount > 0) {
    console.log(dim(`${errorCount} benchmark(s) failed — see errors below`))
  }
  if (hasCost) {
    console.log(dim('Cost estimates based on published per-token pricing. Run `npx tsx scripts/update-pricing.ts` to refresh.'))
  }
  console.log('')

  // Print errors at the bottom
  if (errorCount > 0) {
    console.log(bold('Errors'))
    console.log(dim('─'.repeat(72)))
    for (const r of results.filter((r) => r.error)) {
      console.log(`  ${r.providerId} × ${r.taskName} (run ${r.run}): ${r.error}`)
    }
    console.log('')
  }
}

interface Column {
  label: string
  width: number
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
      if (score.value < 0) continue
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
