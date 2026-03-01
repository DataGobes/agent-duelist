import type { BenchmarkResult } from '../runner.js'
import { formatCost } from '../utils/format.js'
import {
  type ProviderTaskData,
  type ColumnStats,
  groupResults,
  aggregateProviderTask,
  average,
  computeColumnStats,
  computeMedals,
  providerLabel,
  apiKeyHint,
  rankProviders,
  medalEmoji,
  scorerLabel,
} from './shared.js'

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

// ── Column layout ───────────────────────────────────────────────────────────

interface TableCol {
  label: string
  width: number
  align: 'left' | 'right'
  statsKey?: string
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

  const { tasks, providers, scorerNames, grouped, byProvider, hasErrors, maxRun } = groupResults(results)
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
    const providerData: ProviderTaskData[] = providers.map(providerId =>
      aggregateProviderTask(providerId, grouped, task)
    )

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
        cols.push({ label: scorerLabel(name), width: showSparklines ? 15 : 8, align: 'right', statsKey: name })
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
      const medal = medalEmoji(medals.get(pd.providerId) ?? 'none')
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
      const winnerId = [...medals.entries()].find(([, m]) => m === 'gold')?.[0]
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

