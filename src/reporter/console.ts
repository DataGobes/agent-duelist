import type { BenchmarkResult } from '../runner.js'
import { formatCost } from '../utils/format.js'

// ── ANSI color palette ──────────────────────────────────────────────────────

const reset = '\x1b[0m'
const boldCode = '\x1b[1m'
const dimCode = '\x1b[2m'
const green = '\x1b[32m'
const red = '\x1b[31m'
const yellow = '\x1b[33m'
const cyan = '\x1b[36m'
const brightGreen = '\x1b[92m'
const brightWhite = '\x1b[97m'

function bold(s: string) { return `${boldCode}${s}${reset}` }
function dim(s: string) { return `${dimCode}${s}${reset}` }

// ── String utilities ────────────────────────────────────────────────────────

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

/** Display width accounting for wide emoji (medals, trophy = 2 columns) */
function displayWidth(s: string): number {
  const stripped = stripAnsi(s)
  let width = 0
  for (const ch of stripped) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x1F000) width += 2
    else if (code >= 0x2600 && code <= 0x27BF) width += 2
    else width += 1
  }
  return width
}

/** Pad string to target display width, accounting for ANSI codes and wide chars */
function padCell(str: string, targetWidth: number, align: 'left' | 'right'): string {
  const dw = displayWidth(str)
  const padding = Math.max(0, targetWidth - dw)
  if (align === 'right') return ' '.repeat(padding) + str
  return str + ' '.repeat(padding)
}

// ── Sparkline bar ───────────────────────────────────────────────────────────

interface SparkBarParts { fill: string; track: string }

function sparkBar(ratio: number, width: number = 8): SparkBarParts {
  const clamped = Math.max(0, Math.min(1, ratio))
  const fillLen = Math.round(clamped * width)
  const fill = '▓'.repeat(fillLen)
  const track = '░'.repeat(width - fillLen)
  return { fill, track }
}

// ── Box-drawing ─────────────────────────────────────────────────────────────

type LinePosition = 'top' | 'header' | 'bottom' | 'merge'

function drawTableLine(widths: number[], position: LinePosition): string {
  const totalInner = widths.reduce((sum, w) => sum + w + 2, 0) + widths.length - 1

  if (position === 'bottom') {
    return dim(`└${'─'.repeat(totalInner)}┘`)
  }
  if (position === 'merge') {
    return dim(`├${'─'.repeat(totalInner)}┤`)
  }

  const segments = widths.map(w => '─'.repeat(w + 2))
  if (position === 'top') {
    return dim(`┌${segments.join('┬')}┐`)
  }
  // header separator
  return dim(`├${segments.join('┼')}┤`)
}

function drawTableRow(
  cells: string[],
  widths: number[],
  aligns: ('left' | 'right')[]
): string {
  const parts = cells.map((cell, i) =>
    ' ' + padCell(cell, widths[i]!, aligns[i]!) + ' '
  )
  return dim('│') + parts.join(dim('│')) + dim('│')
}

/** Single-cell row spanning the full table width */
function drawSpanRow(content: string, widths: number[]): string {
  const totalInner = widths.reduce((sum, w) => sum + w + 2, 0) + widths.length - 1
  const dw = displayWidth(content)
  const padding = Math.max(0, totalInner - dw - 1)
  return dim('│') + ' ' + content + ' '.repeat(padding) + dim('│')
}

// ── Column statistics & ranking ─────────────────────────────────────────────

interface ColumnStats {
  values: Map<string, number | undefined>
  best: number | undefined
  worst: number | undefined
}

interface ProviderTaskData {
  providerId: string
  avgScores: Record<string, number>
  avgDetails: AggregatedDetails
  latencyMs: number | undefined
  allErrors: boolean
  errorCount: number
}

interface TableCol {
  label: string
  width: number
  align: 'left' | 'right'
  statsKey?: string
}

function computeColumnStats(
  providerData: ProviderTaskData[],
  scorerNames: string[]
): Map<string, ColumnStats> {
  const stats = new Map<string, ColumnStats>()
  const valid = providerData.filter(p => !p.allErrors)

  if (scorerNames.includes('latency')) {
    const values = new Map<string, number | undefined>()
    for (const p of providerData) {
      values.set(p.providerId, p.allErrors ? undefined : p.latencyMs)
    }
    const nums = valid.map(p => p.latencyMs).filter((v): v is number => v !== undefined)
    stats.set('latency', {
      values,
      best: nums.length > 0 ? Math.min(...nums) : undefined,
      worst: nums.length > 0 ? Math.max(...nums) : undefined,

    })
  }

  if (scorerNames.includes('cost')) {
    const costValues = new Map<string, number | undefined>()
    const tokenValues = new Map<string, number | undefined>()
    for (const p of providerData) {
      costValues.set(p.providerId, p.allErrors ? undefined : p.avgDetails.costUsd)
      tokenValues.set(p.providerId, p.allErrors ? undefined : p.avgDetails.totalTokens)
    }
    const costNums = valid.map(p => p.avgDetails.costUsd).filter((v): v is number => v !== undefined)
    const tokenNums = valid.map(p => p.avgDetails.totalTokens).filter((v): v is number => v !== undefined)
    stats.set('cost', {
      values: costValues,
      best: costNums.length > 0 ? Math.min(...costNums) : undefined,
      worst: costNums.length > 0 ? Math.max(...costNums) : undefined,

    })
    stats.set('tokens', {
      values: tokenValues,
      best: tokenNums.length > 0 ? Math.min(...tokenNums) : undefined,
      worst: tokenNums.length > 0 ? Math.max(...tokenNums) : undefined,

    })
  }

  for (const name of scorerNames) {
    if (name === 'latency' || name === 'cost') continue
    const values = new Map<string, number | undefined>()
    for (const p of providerData) {
      values.set(p.providerId, p.allErrors ? undefined : p.avgScores[name])
    }
    const nums = valid.map(p => p.avgScores[name]).filter((v): v is number => v !== undefined)
    stats.set(name, {
      values,
      best: nums.length > 0 ? Math.max(...nums) : undefined,
      worst: nums.length > 0 ? Math.min(...nums) : undefined,

    })
  }

  return stats
}

function colorByRank(
  text: string,
  value: number | undefined,
  colStats: ColumnStats,
  providerCount: number
): string {
  if (value === undefined) return dim('—')
  if (providerCount < 2) return text
  if (colStats.best === undefined || colStats.worst === undefined) return text
  if (colStats.best === colStats.worst) return text

  if (value === colStats.best) return `${brightGreen}${boldCode}${text}${reset}`
  if (value === colStats.worst) return `${red}${text}${reset}`
  return `${yellow}${text}${reset}`
}

type Medal = '🥇' | '🥈' | '🥉' | ''

function computeMedals(
  columnStats: Map<string, ColumnStats>,
  providerIds: string[]
): Map<string, Medal> {
  const medals = new Map<string, Medal>()

  if (providerIds.length < 2) {
    for (const id of providerIds) medals.set(id, '')
    return medals
  }

  // Count column wins per provider
  const wins = new Map<string, number>()
  for (const id of providerIds) wins.set(id, 0)

  for (const [, colStats] of columnStats) {
    if (colStats.best === undefined) continue
    // Only award a win when exactly one provider holds the best value
    const bestProviders = [...colStats.values.entries()]
      .filter(([, v]) => v !== undefined && v === colStats.best)
    if (bestProviders.length === 1) {
      wins.set(bestProviders[0]![0], (wins.get(bestProviders[0]![0]) ?? 0) + 1)
    }
  }

  // If nobody won anything, skip medals
  const totalWins = [...wins.values()].reduce((a, b) => a + b, 0)
  if (totalWins === 0) {
    for (const id of providerIds) medals.set(id, '')
    return medals
  }

  // Sort by wins descending, then alphabetically for stability
  const sorted = [...wins.entries()].sort((a, b) =>
    b[1] - a[1] || a[0].localeCompare(b[0])
  )

  const medalList: Medal[] = ['🥇', '🥈', '🥉']
  let rank = 0
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]![1] < sorted[i - 1]![1]) {
      rank = i
    }
    // No medal for providers with zero column wins
    const hasWins = sorted[i]![1] > 0
    medals.set(sorted[i]![0], hasWins && rank < medalList.length ? medalList[rank]! : '')
  }

  return medals
}

// ── Main reporter ───────────────────────────────────────────────────────────

export interface ConsoleReporterOptions {
  sparklines?: boolean
}

export function consoleReporter(results: BenchmarkResult[], options?: ConsoleReporterOptions): void {
  const showSparklines = options?.sparklines ?? true
  if (results.length === 0) {
    console.log('\nNo results to display.\n')
    return
  }

  // Single-pass grouping: collect tasks, providers, scorers, and group results
  const taskSet = new Set<string>()
  const providerSet = new Set<string>()
  const scorerSet = new Set<string>()
  const grouped = new Map<string, BenchmarkResult[]>() // "task::provider" → results
  const byProvider = new Map<string, BenchmarkResult[]>()
  let hasErrors = false
  let maxRun = 0

  for (const r of results) {
    taskSet.add(r.taskName)
    providerSet.add(r.providerId)
    for (const s of r.scores) scorerSet.add(s.name)
    if (r.error) hasErrors = true
    if (r.run > maxRun) maxRun = r.run

    const key = `${r.taskName}::${r.providerId}`
    let group = grouped.get(key)
    if (!group) { group = []; grouped.set(key, group) }
    group.push(r)

    let provGroup = byProvider.get(r.providerId)
    if (!provGroup) { provGroup = []; byProvider.set(r.providerId, provGroup) }
    provGroup.push(r)
  }

  const tasks = [...taskSet]
  const providers = [...providerSet]
  const scorerNames = [...scorerSet]
  const hasCost = scorerNames.includes('cost')
  const multi = providers.length >= 2

  // Title
  const runsPerCell = maxRun
  const runLabel = runsPerCell > 1 ? `  ${dim(`(${runsPerCell} runs each)`)}` : ''
  console.log('')
  console.log(`  ${brightWhite}${boldCode}⬡  Agent Duelist${reset}${runLabel}`)
  console.log(`  ${dim('━'.repeat(72))}`)
  console.log('')

  // Per-task tables
  for (const task of tasks) {
    console.log(`  ${bold(`Task: ${task}`)}`)
    console.log('')

    // Gather per-provider data for this task (using pre-grouped map)
    const providerData: ProviderTaskData[] = providers.map(providerId => {
      const taskResults = grouped.get(`${task}::${providerId}`) ?? []
      const errorResults = taskResults.filter(r => r.error)
      const successResults = taskResults.filter(r => !r.error)

      if (successResults.length === 0) {
        return {
          providerId,
          avgScores: {},
          avgDetails: { costUsd: undefined, totalTokens: undefined },
          latencyMs: undefined,
          allErrors: errorResults.length > 0,
          errorCount: errorResults.length,
        }
      }

      return {
        providerId,
        avgScores: averageScores(successResults),
        avgDetails: averageDetails(successResults),
        latencyMs: average(successResults.map(r => r.raw.latencyMs)),
        allErrors: false,
        errorCount: errorResults.length,
      }
    })

    // Compute column stats and medals
    const columnStats = computeColumnStats(providerData, scorerNames)
    const medals = computeMedals(columnStats, providers)

    // Build columns — provider width is dynamic, score columns accommodate sparklines
    const maxProviderLen = Math.max(...providers.map(id => id.length))
    const providerWidth = Math.min(35, Math.max(22, maxProviderLen + 5))

    const cols: TableCol[] = [
      { label: 'Provider', width: providerWidth, align: 'left' }
    ]

    for (const name of scorerNames) {
      if (name === 'latency') {
        cols.push({ label: 'Latency', width: 10, align: 'right', statsKey: 'latency' })
      } else if (name === 'cost') {
        cols.push({ label: 'Cost', width: 12, align: 'right', statsKey: 'cost' })
        cols.push({ label: 'Tokens', width: 9, align: 'right', statsKey: 'tokens' })
      } else {
        const label = name === 'correctness' ? 'Match'
          : name === 'schema-correctness' ? 'Schema'
          : name === 'fuzzy-similarity' ? 'Fuzzy'
          : name === 'llm-judge-correctness' ? 'Judge'
          : name === 'tool-usage' ? 'Tool'
          : name
        cols.push({ label, width: showSparklines ? 15 : 8, align: 'right', statsKey: name })
      }
    }

    if (hasErrors) {
      cols.push({ label: 'Status', width: 8, align: 'left' })
    }

    const widths = cols.map(c => c.width)
    const aligns = cols.map(c => c.align)

    // ┌ top border ┐
    console.log(`  ${drawTableLine(widths, 'top')}`)

    // │ header row │
    const headerCells = cols.map(c => bold(c.label))
    console.log(`  ${drawTableRow(headerCells, widths, aligns)}`)

    // ├ header separator ┤
    console.log(`  ${drawTableLine(widths, 'header')}`)

    // │ data rows │
    for (const pd of providerData) {
      const medal = medals.get(pd.providerId) ?? ''
      const providerCell = medal ? `${medal} ${pd.providerId}` : pd.providerId
      const cells: string[] = [providerCell]

      if (pd.allErrors) {
        // All runs failed — dashes everywhere
        for (const col of cols.slice(1)) {
          if (col.label === 'Status') {
            cells.push(`${red}FAIL${reset}`)
          } else {
            cells.push(dim('—'))
          }
        }
      } else {
        for (const col of cols.slice(1)) {
          if (col.label === 'Status') {
            cells.push(
              pd.errorCount > 0
                ? `${yellow}${pd.errorCount} err${reset}`
                : `${green}OK${reset}`
            )
            continue
          }

          const statsKey = col.statsKey!
          const colStats = columnStats.get(statsKey)

          if (statsKey === 'latency') {
            const ms = pd.latencyMs
            if (ms === undefined) {
              cells.push(dim('—'))
            } else {
              const text = `${Math.round(ms)}ms`
              cells.push(colStats ? colorByRank(text, ms, colStats, providers.length) : text)
            }
          } else if (statsKey === 'cost') {
            const cost = pd.avgDetails.costUsd
            if (cost === undefined) {
              cells.push(dim('—'))
            } else {
              const text = formatCost(cost)
              cells.push(colStats ? colorByRank(text, cost, colStats, providers.length) : text)
            }
          } else if (statsKey === 'tokens') {
            const tokens = pd.avgDetails.totalTokens
            if (tokens === undefined) {
              cells.push(dim('—'))
            } else {
              const text = `${tokens}`
              cells.push(colStats ? colorByRank(text, tokens, colStats, providers.length) : text)
            }
          } else {
            // Score column (0-1 scale) with optional sparkline bar
            const val = pd.avgScores[statsKey]
            if (val === undefined) {
              cells.push(dim('—'))
            } else {
              const pctStr = `${Math.round(val * 100)}%`.padStart(4)
              let coloredPct: string
              if (multi && colStats) {
                coloredPct = colorByRank(pctStr, val, colStats, providers.length)
              } else {
                // Single provider: threshold-based coloring
                if (val >= 0.8) coloredPct = `${green}${pctStr}${reset}`
                else if (val >= 0.5) coloredPct = `${yellow}${pctStr}${reset}`
                else coloredPct = `${red}${pctStr}${reset}`
              }
              if (showSparklines) {
                const { fill, track } = sparkBar(val)
                const barColor = val >= 0.8 ? green : val >= 0.5 ? yellow : red
                cells.push(`${coloredPct} ${barColor}${fill}${reset}${dim(track)}`)
              } else {
                cells.push(coloredPct)
              }
            }
          }
        }
      }

      console.log(`  ${drawTableRow(cells, widths, aligns)}`)
    }

    // Winner row (2+ providers, at least one success)
    if (multi && providerData.some(p => !p.allErrors)) {
      const winnerId = [...medals.entries()].find(([, m]) => m === '🥇')?.[0]
      if (winnerId) {
        console.log(`  ${drawTableLine(widths, 'merge')}`)
        const winnerText = `${brightGreen}${boldCode}🏆  Winner: ${winnerId}${reset} ${dim(providerLabel(winnerId))}`
        console.log(`  ${drawSpanRow(winnerText, widths)}`)
      }
    }

    // └ bottom border ┘
    console.log(`  ${drawTableLine(widths, 'bottom')}`)
    console.log('')
  }

  // Summary
  printSummary(results, providers, byProvider)

  // Errors — deduplicate by provider + error message and add hints
  const errorResults = results.filter((r) => r.error)
  if (errorResults.length > 0) {
    console.log(`  ${bold('Errors')}`)
    console.log(`  ${dim('━'.repeat(72))}`)

    const seen = new Set<string>()
    for (const r of errorResults) {
      const key = `${r.providerId}::${r.error}`
      if (seen.has(key)) continue
      seen.add(key)

      const count = errorResults.filter((e) => e.providerId === r.providerId && e.error === r.error).length
      const suffix = count > 1 ? ` (×${count})` : ''
      console.log(`  ${red}✖${reset} ${r.providerId}: ${r.error}${suffix}`)

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

// ── Summary section ─────────────────────────────────────────────────────────

function printSummary(results: BenchmarkResult[], providers: string[], byProvider: Map<string, BenchmarkResult[]>) {
  const successResults = results.filter((r) => !r.error)
  if (successResults.length === 0) return

  // Pre-compute success results per provider from the grouped map
  const successByProvider = new Map<string, BenchmarkResult[]>()
  for (const id of providers) {
    successByProvider.set(id, (byProvider.get(id) ?? []).filter((r) => !r.error))
  }

  console.log(`  ${bold('Summary')}`)
  console.log(`  ${dim('━'.repeat(72))}`)
  console.log('')

  const single = providers.length === 1

  // Best correctness (prefer llm-judge, fallback to correctness)
  const correctnessKey = successResults.some((r) => r.scores.some((s) => s.name === 'llm-judge-correctness' && s.value >= 0))
    ? 'llm-judge-correctness'
    : 'correctness'

  const byCorrectness = rankProviders(successByProvider, providers, correctnessKey)
  if (byCorrectness) {
    const medal = single ? `${cyan}◆${reset}` : '🥇'
    const pctStr = `${Math.round(byCorrectness.avg * 100)}%`
    if (single) {
      console.log(`  ${medal} Avg correctness:  ${brightGreen}${boldCode}${pctStr}${reset}`)
    } else {
      console.log(`  ${medal} Most correct:  ${bold(byCorrectness.id)} ${dim(providerLabel(byCorrectness.id))}  ${brightGreen}${boldCode}${pctStr}${reset}`)
    }
  }

  // Fastest
  const byLatency = providers
    .map((id) => {
      const runs = successByProvider.get(id) ?? []
      const avg = average(runs.map((r) => r.raw.latencyMs))
      return { id, avg: avg ?? Infinity }
    })
    .sort((a, b) => a.avg - b.avg)[0]

  if (byLatency && byLatency.avg !== Infinity) {
    const medal = single ? `${cyan}◆${reset}` : '🥇'
    const msStr = `${Math.round(byLatency.avg)}ms`
    if (single) {
      console.log(`  ${medal} Avg latency:     ${brightGreen}${boldCode}${msStr}${reset}`)
    } else {
      console.log(`  ${medal} Fastest:       ${bold(byLatency.id)} ${dim(providerLabel(byLatency.id))}  ${brightGreen}${boldCode}${msStr}${reset}`)
    }
  }

  // Cheapest
  const byCost = providers
    .map((id) => {
      const runs = successByProvider.get(id) ?? []
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
    const medal = single ? `${cyan}◆${reset}` : '🥇'
    const costStr = formatCost(byCost.avg)
    if (single) {
      console.log(`  ${medal} Avg cost:        ${brightGreen}${boldCode}${costStr}${reset}`)
    } else {
      console.log(`  ${medal} Cheapest:      ${bold(byCost.id)} ${dim(providerLabel(byCost.id))}  ${brightGreen}${boldCode}${costStr}${reset}`)
    }
  }

  // Overall winner (2+ providers) — most category wins
  if (!single) {
    const wins = new Map<string, number>()
    for (const id of providers) wins.set(id, 0)

    if (byCorrectness) wins.set(byCorrectness.id, (wins.get(byCorrectness.id) ?? 0) + 1)
    if (byLatency && byLatency.avg !== Infinity) wins.set(byLatency.id, (wins.get(byLatency.id) ?? 0) + 1)
    if (byCost?.avg !== undefined) wins.set(byCost.id, (wins.get(byCost.id) ?? 0) + 1)

    const maxWins = Math.max(...wins.values())
    if (maxWins > 0) {
      const topProviders = [...wins.entries()].filter(([, w]) => w === maxWins)
      console.log('')
      if (topProviders.length === 1) {
        const [winnerId, winCount] = topProviders[0]!
        console.log(`  🏆 Overall:      ${brightGreen}${boldCode}${winnerId}${reset} ${dim(providerLabel(winnerId))}  ${dim(`(${winCount}/3 categories)`)}`)
      } else {
        const names = topProviders.map(([id]) => bold(id)).join(dim(', '))
        console.log(`  🏆 Overall:      ${names}  ${dim(`(tied at ${maxWins}/3)`)}`)
      }
    }
  }

  console.log('')
}

// ── Pure data functions (unchanged) ─────────────────────────────────────────

function rankProviders(successByProvider: Map<string, BenchmarkResult[]>, providers: string[], scorerName: string) {
  const ranked = providers
    .map((id) => {
      const runs = successByProvider.get(id) ?? []
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
    case 'google': return 'Set: export GOOGLE_API_KEY=...'
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
