import type { BenchmarkResult } from '../runner.js'

// ANSI color helpers
const reset = '\x1b[0m'
const boldCode = '\x1b[1m'
const dimCode = '\x1b[2m'
const green = '\x1b[32m'
const red = '\x1b[31m'
const yellow = '\x1b[33m'
const cyan = '\x1b[36m'

function bold(s: string) { return `${boldCode}${s}${reset}` }
function dim(s: string) { return `${dimCode}${s}${reset}` }
function colorScore(value: number): string {
  const pct = Math.round(value * 100)
  const str = `${pct}%`
  if (value >= 0.8) return `${green}${str}${reset}`
  if (value >= 0.5) return `${yellow}${str}${reset}`
  return `${red}${str}${reset}`
}

export function consoleReporter(results: BenchmarkResult[]): void {
  if (results.length === 0) {
    console.log('\nNo results to display.\n')
    return
  }

  const tasks = [...new Set(results.map((r) => r.taskName))]
  const providers = [...new Set(results.map((r) => r.providerId))]
  const scorerNames = [...new Set(results.flatMap((r) => r.scores.map((s) => s.name)))]
  const hasCost = scorerNames.includes('cost')
  const hasErrors = results.some((r) => r.error)

  // Title — include run count so readers know results are aggregated
  const runsPerCell = Math.max(...results.map((r) => r.run))
  const runLabel = runsPerCell > 1 ? ` (${runsPerCell} runs each)` : ''
  console.log('')
  console.log(`  ${bold(`⬡ Agent Arena Results${runLabel}`)}`)
  console.log(`  ${dim('─'.repeat(70))}`)
  console.log('')

  // Per-task tables
  for (const task of tasks) {
    console.log(`  ${bold(`Task: ${task}`)}`)

    // Build columns
    const cols: Col[] = [{ label: 'Provider', width: 22, align: 'left' }]
    for (const name of scorerNames) {
      if (name === 'latency') cols.push({ label: 'Latency', width: 10, align: 'right' })
      else if (name === 'cost') {
        cols.push({ label: 'Cost', width: 12, align: 'right' })
        cols.push({ label: 'Tokens', width: 9, align: 'right' })
      }
      else if (name === 'correctness') cols.push({ label: 'Match', width: 8, align: 'right' })
      else if (name === 'schema-correctness') cols.push({ label: 'Schema', width: 8, align: 'right' })
      else if (name === 'fuzzy-similarity') cols.push({ label: 'Fuzzy', width: 8, align: 'right' })
      else if (name === 'llm-judge-correctness') cols.push({ label: 'Judge', width: 8, align: 'right' })
      else cols.push({ label: name, width: 10, align: 'right' })
    }
    if (hasErrors) cols.push({ label: 'Status', width: 8, align: 'left' })

    const totalWidth = cols.reduce((sum, c) => sum + c.width + 2, 0)
    console.log(`  ${dim(cols.map((c) => pad(c.label, c.width + 2, c.align)).join(''))}`)
    console.log(`  ${dim('─'.repeat(totalWidth))}`)

    for (const provider of providers) {
      const taskResults = results.filter(
        (r) => r.taskName === task && r.providerId === provider
      )
      const errorResults = taskResults.filter((r) => r.error)
      const successResults = taskResults.filter((r) => !r.error)

      if (successResults.length === 0 && errorResults.length > 0) {
        const cells = [pad(provider, 24, 'left')]
        for (const name of scorerNames) {
          if (name === 'cost') {
            cells.push(pad('—', 14, 'right'))
            cells.push(pad('—', 11, 'right'))
          } else cells.push(pad('—', cols.find((c) => c.label !== 'Provider')!.width + 2, 'right'))
        }
        if (hasErrors) cells.push(`  ${red}FAIL${reset}`)
        console.log(`  ${cells.join('')}`)
        continue
      }

      const avgScores = averageScores(successResults)
      const avgDetails = averageDetails(successResults)
      const latencyMs = average(successResults.map((r) => r.raw.latencyMs))

      const cells: string[] = [pad(provider, 24, 'left')]

      for (const name of scorerNames) {
        if (name === 'latency') {
          cells.push(pad(latencyMs !== undefined ? `${Math.round(latencyMs)}ms` : '—', 12, 'right'))
        } else if (name === 'cost') {
          cells.push(pad(formatCost(avgDetails.costUsd), 14, 'right'))
          cells.push(pad(avgDetails.totalTokens !== undefined ? `${avgDetails.totalTokens}` : '—', 11, 'right'))
        } else {
          const val = avgScores[name]
          if (val === undefined) cells.push(pad('—', 10, 'right'))
          else cells.push(pad(colorScore(val), 10 + colorLen(colorScore(val)), 'right'))
        }
      }

      if (hasErrors) {
        const failCount = errorResults.length
        cells.push(failCount > 0 ? `  ${yellow}${failCount} err${reset}` : `  ${green}OK${reset}`)
      }

      console.log(`  ${cells.join('')}`)
    }

    console.log('')
  }

  // Summary section
  printSummary(results, providers)

  // Errors — deduplicate by provider + error message and add hints
  const errorResults = results.filter((r) => r.error)
  if (errorResults.length > 0) {
    console.log(`  ${bold('Errors')}`)
    console.log(`  ${dim('─'.repeat(70))}`)

    // Deduplicate: same provider + same error only shown once
    const seen = new Set<string>()
    for (const r of errorResults) {
      const key = `${r.providerId}::${r.error}`
      if (seen.has(key)) continue
      seen.add(key)

      const count = errorResults.filter((e) => e.providerId === r.providerId && e.error === r.error).length
      const suffix = count > 1 ? ` (×${count})` : ''
      console.log(`  ${red}✗${reset} ${r.providerId}: ${r.error}${suffix}`)

      // Hint for common API key issues
      const hint = apiKeyHint(r.providerId, r.error ?? '')
      if (hint) console.log(`    ${dim(hint)}`)
    }
    console.log('')
  }

  if (hasCost) {
    console.log(dim(`  Costs estimated from OpenRouter pricing catalog. Run npx tsx scripts/update-pricing.ts to refresh.`))
    console.log('')
  }
}

function printSummary(results: BenchmarkResult[], providers: string[]) {
  const successResults = results.filter((r) => !r.error)
  if (successResults.length === 0) return

  console.log(`  ${dim('─'.repeat(70))}`)
  console.log(`  ${bold('Summary')}`)
  console.log('')

  const single = providers.length === 1

  // Best correctness (prefer llm-judge, fallback to correctness)
  const correctnessKey = successResults.some((r) => r.scores.some((s) => s.name === 'llm-judge-correctness' && s.value >= 0))
    ? 'llm-judge-correctness'
    : 'correctness'

  const byCorrectness = rankProviders(successResults, providers, correctnessKey)
  if (byCorrectness) {
    const label = single ? 'Avg correctness' : `Most correct: ${bold(byCorrectness.id)} ${dim(providerLabel(byCorrectness.id))}`
    console.log(`  ${cyan}◆${reset} ${label} (avg ${colorScore(byCorrectness.avg)})`)
  }

  // Fastest
  const byLatency = providers
    .map((id) => {
      const runs = successResults.filter((r) => r.providerId === id)
      const avg = average(runs.map((r) => r.raw.latencyMs))
      return { id, avg: avg ?? Infinity }
    })
    .sort((a, b) => a.avg - b.avg)[0]

  if (byLatency && byLatency.avg !== Infinity) {
    const label = single ? 'Avg latency' : `Fastest: ${bold(byLatency.id)} ${dim(providerLabel(byLatency.id))}`
    console.log(`  ${cyan}◆${reset} ${label} (avg ${Math.round(byLatency.avg)}ms)`)
  }

  // Cheapest
  const byCost = providers
    .map((id) => {
      const runs = successResults.filter((r) => r.providerId === id)
      const costs = runs
        .map((r) => {
          const s = r.scores.find((s) => s.name === 'cost')
          return s && s.value >= 0 ? s.value : undefined
        })
        .filter((c): c is number => c !== undefined)
      const avg = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : undefined
      return { id, avg }
    })
    .filter((p) => p.avg !== undefined)
    .sort((a, b) => a.avg! - b.avg!)[0]

  if (byCost?.avg !== undefined) {
    const label = single ? 'Avg cost' : `Cheapest: ${bold(byCost.id)} ${dim(providerLabel(byCost.id))}`
    console.log(`  ${cyan}◆${reset} ${label} (avg ${formatCost(byCost.avg)})`)
  }

  console.log('')
}

function rankProviders(results: BenchmarkResult[], providers: string[], scorerName: string) {
  const ranked = providers
    .map((id) => {
      const runs = results.filter((r) => r.providerId === id)
      const scores = runs
        .flatMap((r) => r.scores.filter((s) => s.name === scorerName && s.value >= 0))
        .map((s) => s.value)
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined
      return { id, avg }
    })
    .filter((p) => p.avg !== undefined)
    .sort((a, b) => b.avg! - a.avg!)

  return ranked[0] ? { id: ranked[0].id, avg: ranked[0].avg! } : undefined
}

interface Col {
  label: string
  width: number
  align: 'left' | 'right'
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

function formatCost(usd: number | undefined): string {
  if (usd === undefined) return '—'
  if (usd === 0) return '$0.00'
  if (usd >= 0.01) return `~$${usd.toFixed(2)}`
  // Adaptive precision: always 2 significant figures, always in dollars
  const digits = Math.max(4, -Math.floor(Math.log10(usd)) + 1)
  return `~$${usd.toFixed(digits).replace(/0+$/, '')}`
}

function pad(str: string, width: number, align: 'left' | 'right'): string {
  if (align === 'right') return str.padStart(width)
  return str.padEnd(width)
}

// ANSI escape codes add invisible characters — this calculates the extra length
function colorLen(str: string): number {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '')
  return str.length - stripped.length
}

function apiKeyHint(providerId: string, error: string): string | undefined {
  const lower = error.toLowerCase()
  const isAuthError = lower.includes('api key') || lower.includes('401') ||
    lower.includes('unauthorized') || lower.includes('authentication') ||
    lower.includes('incorrect api key') || lower.includes('apikey')

  if (!isAuthError) return undefined

  const prefix = providerId.split('/')[0]
  switch (prefix) {
    case 'openai': return 'Set: export OPENAI_API_KEY=sk-...'
    case 'azure': return 'Set: export AZURE_OPENAI_API_KEY=... and AZURE_OPENAI_ENDPOINT=...'
    case 'anthropic': return 'Set: export ANTHROPIC_API_KEY=sk-ant-...'
    default: return `Check the API key for ${providerId}`
  }
}

function providerLabel(providerId: string): string {
  const prefix = providerId.split('/')[0]
  switch (prefix) {
    case 'azure': return '(OpenAI via Azure)'
    case 'openai': return '(OpenAI)'
    case 'anthropic': return '(Anthropic)'
    case 'google': return '(Google)'
    case 'mistral': return '(Mistral)'
    case 'meta': return '(Meta)'
    case 'deepseek': return '(DeepSeek)'
    case 'cohere': return '(Cohere)'
    case 'qwen': return '(Qwen)'
    case 'xai': return '(xAI)'
    case 'minimax': return '(MiniMax)'
    case 'moonshot': return '(Moonshot / Kimi)'
    case 'perplexity': return '(Perplexity)'
    case 'amazon': return '(Amazon)'
    case 'nvidia': return '(NVIDIA)'
    case 'microsoft': return '(Microsoft)'
    case 'ai21': return '(AI21 Labs)'
    case 'bytedance': return '(ByteDance)'
    case 'together': return '(Together AI)'
    case 'fireworks': return '(Fireworks AI)'
    case 'groq': return '(Groq)'
    case 'cerebras': return '(Cerebras)'
    default: return `(${prefix})`
  }
}
