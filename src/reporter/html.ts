import type { BenchmarkResult } from '../runner.js'
import { formatCost } from '../utils/format.js'
import {
  type ProviderTaskData,
  type Medal,
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

// ── XSS prevention ──────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Main reporter ───────────────────────────────────────────────────

export function htmlReporter(results: BenchmarkResult[]): string {
  if (results.length === 0) {
    return emptyReport()
  }

  const { tasks, providers, scorerNames, grouped, byProvider, maxRun } = groupResults(results)
  const hasCost = scorerNames.includes('cost')
  const multi = providers.length >= 2
  const runsLabel = maxRun > 1 ? `${maxRun} runs each` : '1 run'

  // Build per-task table data
  const taskSections = tasks.map(task => {
    const providerData = providers.map(id => aggregateProviderTask(id, grouped, task))
    const columnStats = computeColumnStats(providerData, scorerNames)
    const medals = computeMedals(columnStats, providers)
    const winnerId = multi
      ? [...medals.entries()].find(([, m]) => m === 'gold')?.[0]
      : undefined
    return { task, providerData, columnStats, medals, winnerId }
  })

  // Summary stats
  const successResults = results.filter(r => !r.error)
  const successByProvider = new Map<string, BenchmarkResult[]>()
  for (const id of providers) {
    successByProvider.set(id, (byProvider.get(id) ?? []).filter(r => !r.error))
  }

  const correctnessKey = successResults.some(r =>
    r.scores.some(s => s.name === 'llm-judge-correctness' && s.value >= 0)
  ) ? 'llm-judge-correctness' : 'correctness'

  const byCorrectness = rankProviders(successByProvider, providers, correctnessKey)
  const byLatency = providers
    .map(id => {
      const runs = successByProvider.get(id) ?? []
      const avg = average(runs.map(r => r.raw.latencyMs))
      return { id, avg: avg ?? Infinity }
    })
    .sort((a, b) => a.avg - b.avg)[0]

  const byCost = providers
    .map(id => {
      const runs = successByProvider.get(id) ?? []
      const costs = runs
        .map(r => {
          const s = r.scores.find(s => s.name === 'cost')
          return s && s.value >= 0 ? s.value : undefined
        })
        .filter((c): c is number => c !== undefined)
      const avg = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : undefined
      return { id, avg }
    })
    .filter(p => p.avg !== undefined)
    .sort((a, b) => a.avg! - b.avg!)[0]

  // Overall winner
  let overallWinner: string | undefined
  if (multi) {
    const wins = new Map<string, number>()
    for (const id of providers) wins.set(id, 0)
    if (byCorrectness) wins.set(byCorrectness.id, (wins.get(byCorrectness.id) ?? 0) + 1)
    if (byLatency && byLatency.avg !== Infinity) wins.set(byLatency.id, (wins.get(byLatency.id) ?? 0) + 1)
    if (byCost?.avg !== undefined) wins.set(byCost.id, (wins.get(byCost.id) ?? 0) + 1)
    const maxWins = Math.max(...wins.values())
    if (maxWins > 0) {
      const tops = [...wins.entries()].filter(([, w]) => w === maxWins)
      if (tops.length === 1) overallWinner = tops[0]![0]
    }
  }

  // Error details
  const errorResults = results.filter(r => r.error)
  const deduped = dedupeErrors(errorResults)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Duelist Report</title>
<meta name="description" content="LLM provider benchmark results — ${providers.length} provider${providers.length !== 1 ? 's' : ''}, ${tasks.length} task${tasks.length !== 1 ? 's' : ''}">
<meta property="og:title" content="Agent Duelist Report">
<meta property="og:description" content="LLM provider benchmark: ${providers.map(esc).join(' vs ')}">
<meta property="og:type" content="website">
${renderStyle()}
</head>
<body>
<div class="bg-mesh"><div class="bg-mesh-extra"></div></div>
<div class="report">

${renderHeader(runsLabel, providers.length, tasks.length)}

${tasks.length > 1 ? renderTabs(tasks) : ''}

<main>
${taskSections.map((s, i) => renderTaskSection(
    s.task, s.providerData, s.columnStats, s.medals, s.winnerId,
    scorerNames, hasCost, multi, i
  )).join('\n')}
</main>

${renderSummary(byCorrectness, byLatency, byCost, overallWinner, multi)}

${deduped.length > 0 ? renderErrors(deduped) : ''}

${renderFooter()}

</div>
${renderScript(tasks.length)}
</body>
</html>`
}

// ── Empty report ────────────────────────────────────────────────────

function emptyReport(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Duelist Report</title>
${renderStyle()}
</head>
<body>
<div class="bg-mesh"><div class="bg-mesh-extra"></div></div>
<div class="report">
${renderHeader('0 runs', 0, 0)}
<main><p class="empty-msg">No results to display.</p></main>
${renderFooter()}
</div>
</body>
</html>`
}

// ── Error deduplication ─────────────────────────────────────────────

interface DedupedError {
  providerId: string
  error: string
  count: number
  hint?: string
}

function dedupeErrors(errorResults: BenchmarkResult[]): DedupedError[] {
  const seen = new Map<string, DedupedError>()
  for (const r of errorResults) {
    const key = `${r.providerId}::${r.error}`
    const existing = seen.get(key)
    if (existing) {
      existing.count++
    } else {
      seen.set(key, {
        providerId: r.providerId,
        error: r.error ?? 'Unknown error',
        count: 1,
        hint: apiKeyHint(r.providerId, r.error ?? ''),
      })
    }
  }
  return [...seen.values()]
}

// ── Render: style ───────────────────────────────────────────────────

function renderStyle(): string {
  return `<style>
:root {
  --bg: #0f172a;
  --bg-deep: #020617;
  --panel: rgba(15, 23, 42, 0.85);
  --accent: #f59e0b;
  --accent-soft: rgba(245, 158, 11, 0.15);
  --text: #e2e8f0;
  --muted: #94a3b8;
  --border: rgba(148, 163, 184, 0.15);
  --green: #22c55e;
  --red: #ef4444;
  --yellow: #eab308;
  --radius: 12px;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace;
  --sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  font-family: var(--sans);
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}
body { padding: 24px; display: flex; justify-content: center; }

/* Animated gradient mesh */
.bg-mesh {
  position: fixed; inset: 0; z-index: 0;
  overflow: hidden; pointer-events: none;
}
.bg-mesh::before, .bg-mesh::after {
  content: ""; position: absolute; border-radius: 50%;
  filter: blur(120px); opacity: 0.4;
}
.bg-mesh::before {
  width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(245,158,11,0.18), transparent 70%);
  top: -10%; left: -5%;
  animation: meshDrift1 18s ease-in-out infinite alternate;
}
.bg-mesh::after {
  width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%);
  bottom: -10%; right: -5%;
  animation: meshDrift2 22s ease-in-out infinite alternate;
}
.bg-mesh-extra {
  position: absolute; width: 400px; height: 400px;
  border-radius: 50%; filter: blur(100px); opacity: 0.3;
  background: radial-gradient(circle, rgba(56,189,248,0.12), transparent 70%);
  top: 50%; left: 60%;
  animation: meshDrift3 15s ease-in-out infinite alternate;
}
@keyframes meshDrift1 { from { transform: translate(0,0) scale(1); } to { transform: translate(80px,60px) scale(1.15); } }
@keyframes meshDrift2 { from { transform: translate(0,0) scale(1); } to { transform: translate(-60px,-50px) scale(1.1); } }
@keyframes meshDrift3 { from { transform: translate(0,0) scale(1); } to { transform: translate(-40px,40px) scale(1.2); } }

/* Report container */
.report {
  position: relative; z-index: 1;
  width: 100%; max-width: 960px;
}

/* Header */
.report-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px 0; margin-bottom: 8px;
}
.report-brand {
  display: flex; align-items: center; gap: 10px;
  text-decoration: none; color: var(--muted);
  font-weight: 600; font-size: 14px;
  letter-spacing: 0.04em; text-transform: uppercase;
}
.report-brand:hover { color: var(--text); }
.brand-icon {
  width: 32px; height: 32px; border-radius: 8px;
  background: linear-gradient(135deg, var(--accent-soft), rgba(245,158,11,0.05));
  border: 1px solid rgba(245,158,11,0.3);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px;
}
.report-meta {
  font-size: 12px; color: var(--muted);
  text-align: right; line-height: 1.6;
}

/* Task tabs */
.task-tabs {
  display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap;
}
.task-tab {
  padding: 6px 16px; border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent; color: var(--muted);
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: all 150ms ease;
}
.task-tab:hover { border-color: rgba(245,158,11,0.3); color: var(--text); }
.task-tab.active {
  background: var(--accent-soft);
  border-color: rgba(245,158,11,0.4);
  color: var(--accent);
}

/* Task sections */
.task-section { display: none; }
.task-section.active { display: block; }
.task-name {
  font-size: 18px; font-weight: 600;
  margin-bottom: 12px; letter-spacing: -0.01em;
}

/* Results table */
.results-table {
  width: 100%; border-collapse: collapse;
  font-size: 13px; margin-bottom: 16px;
  border-radius: var(--radius); overflow: hidden;
  border: 1px solid var(--border);
}
.results-table th, .results-table td {
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}
.results-table th {
  background: rgba(0,0,0,0.3);
  font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--muted); cursor: pointer;
  user-select: none; white-space: nowrap;
}
.results-table th:hover { color: var(--text); }
.results-table th .sort-arrow { margin-left: 4px; font-size: 10px; }
.results-table tbody tr {
  background: var(--panel);
  transition: background 120ms ease;
}
.results-table tbody tr:hover { background: rgba(15,23,42,0.95); }
.results-table tbody tr:last-child td { border-bottom: none; }

/* Score cell with progress bar */
.score-cell { position: relative; min-width: 90px; }
.score-bar {
  position: absolute; left: 0; bottom: 0;
  height: 3px; border-radius: 2px;
  transition: width 300ms ease;
}
.score-val { position: relative; z-index: 1; font-family: var(--mono); font-size: 12px; }

/* Color ranking */
.rank-best { color: var(--green); font-weight: 600; }
.rank-worst { color: var(--red); }
.rank-mid { color: var(--yellow); }
.rank-neutral { color: var(--text); }
.rank-error { color: var(--muted); }

/* Winner banner */
.task-winner {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 18px; margin-bottom: 20px;
  border-radius: var(--radius);
  background: linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02));
  border: 1px solid rgba(34,197,94,0.2);
  font-size: 14px; font-weight: 500;
}
.task-winner .trophy { font-size: 20px; }
.task-winner .winner-name { color: var(--green); font-weight: 600; }
.task-winner .winner-label { color: var(--muted); font-size: 12px; margin-left: 4px; }

/* Summary cards */
.summary-section { margin-top: 32px; }
.summary-title {
  font-size: 16px; font-weight: 600;
  margin-bottom: 12px; color: var(--text);
}
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.summary-card {
  padding: 16px; border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--panel);
}
.summary-card .card-label {
  font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--muted); margin-bottom: 6px;
}
.summary-card .card-value {
  font-size: 20px; font-weight: 700;
  color: var(--green); font-family: var(--mono);
}
.summary-card .card-provider {
  font-size: 12px; color: var(--muted); margin-top: 4px;
}

/* Errors */
.errors-section { margin-top: 24px; }
.errors-title {
  font-size: 16px; font-weight: 600;
  margin-bottom: 8px; color: var(--red);
  cursor: pointer;
}
.errors-list {
  border-radius: var(--radius);
  border: 1px solid rgba(239,68,68,0.2);
  background: rgba(239,68,68,0.04);
  overflow: hidden;
}
.error-item {
  padding: 10px 16px;
  border-bottom: 1px solid rgba(239,68,68,0.1);
  font-size: 13px;
}
.error-item:last-child { border-bottom: none; }
.error-provider { font-weight: 600; color: var(--text); }
.error-msg { color: var(--muted); margin-left: 8px; }
.error-count { color: var(--muted); font-size: 11px; }
.error-hint { color: var(--muted); font-size: 12px; margin-top: 4px; font-style: italic; }

/* Footer */
.report-footer {
  margin-top: 40px; padding: 20px 0;
  border-top: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center;
  flex-wrap: wrap; gap: 12px;
}
.footer-brand {
  font-size: 13px; color: var(--muted);
}
.footer-brand a {
  color: var(--accent); text-decoration: none; font-weight: 500;
}
.footer-brand a:hover { text-decoration: underline; }
.footer-cta {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 8px;
  background: var(--accent-soft);
  border: 1px solid rgba(245,158,11,0.3);
  color: var(--accent); font-size: 12px; font-weight: 500;
  text-decoration: none;
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.footer-cta:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(245,158,11,0.2); }

/* Empty state */
.empty-msg {
  text-align: center; color: var(--muted);
  padding: 60px 20px; font-size: 16px;
}

/* Responsive */
@media (max-width: 640px) {
  body { padding: 12px; }
  .report-header { flex-direction: column; align-items: flex-start; gap: 8px; }
  .report-meta { text-align: left; }
  .summary-cards { grid-template-columns: 1fr; }
  .results-table { font-size: 12px; }
  .results-table th, .results-table td { padding: 8px 10px; }
  .report-footer { flex-direction: column; align-items: flex-start; }
}
</style>`
}

// ── Render: header ──────────────────────────────────────────────────

function renderHeader(runsLabel: string, providerCount: number, taskCount: number): string {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  return `<header class="report-header">
  <a class="report-brand" href="https://github.com/DataGobes/agent-duelist" target="_blank" rel="noopener">
    <div class="brand-icon">&#x2B21;</div>
    <span>Agent Duelist</span>
  </a>
  <div class="report-meta">
    ${providerCount} provider${providerCount !== 1 ? 's' : ''} &middot;
    ${taskCount} task${taskCount !== 1 ? 's' : ''} &middot;
    ${esc(runsLabel)}<br>
    ${esc(now)}
  </div>
</header>`
}

// ── Render: tabs ────────────────────────────────────────────────────

function renderTabs(tasks: string[]): string {
  const buttons = tasks.map((t, i) =>
    `<button class="task-tab${i === 0 ? ' active' : ''}" data-task="${i}">${esc(t)}</button>`
  ).join('\n    ')
  return `<nav class="task-tabs">
    ${buttons}
  </nav>`
}

// ── Render: task section ────────────────────────────────────────────

function renderTaskSection(
  task: string,
  providerData: ProviderTaskData[],
  columnStats: Map<string, import('./shared.js').ColumnStats>,
  medals: Map<string, Medal>,
  winnerId: string | undefined,
  scorerNames: string[],
  _hasCost: boolean,
  multi: boolean,
  index: number
): string {
  // Build columns
  const cols: { label: string; key: string; isScore: boolean }[] = [
    { label: 'Provider', key: 'provider', isScore: false },
  ]

  for (const name of scorerNames) {
    if (name === 'latency') {
      cols.push({ label: 'Latency', key: 'latency', isScore: false })
    } else if (name === 'cost') {
      cols.push({ label: 'Cost', key: 'cost', isScore: false })
      cols.push({ label: 'Tokens', key: 'tokens', isScore: false })
    } else {
      cols.push({ label: scorerLabel(name), key: name, isScore: true })
    }
  }

  // Header row
  const ths = cols.map(c =>
    `<th data-col="${esc(c.key)}">${esc(c.label)}<span class="sort-arrow"></span></th>`
  ).join('')

  // Data rows
  const rows = providerData.map(pd => {
    const medal = medalEmoji(medals.get(pd.providerId) ?? 'none')
    const cells: string[] = []

    // Provider cell
    const medalHtml = medal ? `${medal} ` : ''
    cells.push(`<td>${medalHtml}${esc(pd.providerId)}</td>`)

    if (pd.allErrors) {
      for (let ci = 1; ci < cols.length; ci++) {
        cells.push(`<td class="rank-error">&mdash;</td>`)
      }
    } else {
      for (const col of cols.slice(1)) {
        cells.push(renderDataCell(col.key, col.isScore, pd, columnStats, multi))
      }
    }

    return `<tr>${cells.join('')}</tr>`
  }).join('\n')

  // Winner banner
  const winnerHtml = winnerId
    ? `<div class="task-winner">
    <span class="trophy">&#x1F3C6;</span>
    <span>Winner: <span class="winner-name">${esc(winnerId)}</span>
    <span class="winner-label">${esc(providerLabel(winnerId))}</span></span>
  </div>`
    : ''

  return `<section class="task-section${index === 0 ? ' active' : ''}" data-task-idx="${index}">
  <h2 class="task-name">${esc(task)}</h2>
  <table class="results-table">
    <thead><tr>${ths}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${winnerHtml}
</section>`
}

// ── Render: data cell ───────────────────────────────────────────────

function renderDataCell(
  key: string,
  _isScore: boolean,
  pd: ProviderTaskData,
  columnStats: Map<string, import('./shared.js').ColumnStats>,
  multi: boolean
): string {
  const colStats = columnStats.get(key)

  if (key === 'latency') {
    const ms = pd.latencyMs
    if (ms === undefined) return `<td class="rank-error">&mdash;</td>`
    const rankClass = multi && colStats ? rankClass_(ms, colStats) : 'rank-neutral'
    return `<td class="${rankClass}" data-sort-val="${ms}">${Math.round(ms)}ms</td>`
  }

  if (key === 'cost') {
    const cost = pd.avgDetails.costUsd
    if (cost === undefined) return `<td class="rank-error">&mdash;</td>`
    const rankClass = multi && colStats ? rankClass_(cost, colStats) : 'rank-neutral'
    return `<td class="${rankClass}" data-sort-val="${cost}">${esc(formatCost(cost))}</td>`
  }

  if (key === 'tokens') {
    const tokens = pd.avgDetails.totalTokens
    if (tokens === undefined) return `<td class="rank-error">&mdash;</td>`
    const rankClass = multi && colStats ? rankClass_(tokens, colStats) : 'rank-neutral'
    return `<td class="${rankClass}" data-sort-val="${tokens}">${tokens}</td>`
  }

  // Score column (0-1)
  const val = pd.avgScores[key]
  if (val === undefined) return `<td class="rank-error">&mdash;</td>`

  const pct = Math.round(val * 100)
  let rankCls: string
  if (multi && colStats) {
    rankCls = rankClass_(val, colStats)
  } else {
    rankCls = val >= 0.8 ? 'rank-best' : val >= 0.5 ? 'rank-mid' : 'rank-worst'
  }

  const barColor = val >= 0.8 ? 'var(--green)' : val >= 0.5 ? 'var(--yellow)' : 'var(--red)'

  return `<td class="score-cell ${rankCls}" data-sort-val="${val}">
    <span class="score-val">${pct}%</span>
    <div class="score-bar" style="width:${pct}%;background:${barColor}"></div>
  </td>`
}

function rankClass_(value: number, colStats: import('./shared.js').ColumnStats): string {
  if (colStats.best === undefined || colStats.worst === undefined) return 'rank-neutral'
  if (colStats.best === colStats.worst) return 'rank-neutral'
  if (value === colStats.best) return 'rank-best'
  if (value === colStats.worst) return 'rank-worst'
  return 'rank-mid'
}

// ── Render: summary ─────────────────────────────────────────────────

function renderSummary(
  byCorrectness: { id: string; avg: number } | undefined,
  byLatency: { id: string; avg: number } | undefined,
  byCost: { id: string; avg: number | undefined } | undefined,
  overallWinner: string | undefined,
  multi: boolean
): string {
  const cards: string[] = []

  if (byCorrectness) {
    const pct = `${Math.round(byCorrectness.avg * 100)}%`
    const provider = multi
      ? `<div class="card-provider">${esc(byCorrectness.id)} ${esc(providerLabel(byCorrectness.id))}</div>`
      : ''
    cards.push(`<div class="summary-card">
      <div class="card-label">${multi ? 'Most Correct' : 'Avg Correctness'}</div>
      <div class="card-value">${pct}</div>
      ${provider}
    </div>`)
  }

  if (byLatency && byLatency.avg !== Infinity) {
    const ms = `${Math.round(byLatency.avg)}ms`
    const provider = multi
      ? `<div class="card-provider">${esc(byLatency.id)} ${esc(providerLabel(byLatency.id))}</div>`
      : ''
    cards.push(`<div class="summary-card">
      <div class="card-label">${multi ? 'Fastest' : 'Avg Latency'}</div>
      <div class="card-value">${ms}</div>
      ${provider}
    </div>`)
  }

  if (byCost?.avg !== undefined) {
    const cost = esc(formatCost(byCost.avg))
    const provider = multi
      ? `<div class="card-provider">${esc(byCost.id)} ${esc(providerLabel(byCost.id))}</div>`
      : ''
    cards.push(`<div class="summary-card">
      <div class="card-label">${multi ? 'Cheapest' : 'Avg Cost'}</div>
      <div class="card-value">${cost}</div>
      ${provider}
    </div>`)
  }

  if (overallWinner) {
    cards.push(`<div class="summary-card">
      <div class="card-label">Overall Winner</div>
      <div class="card-value">&#x1F3C6;</div>
      <div class="card-provider">${esc(overallWinner)} ${esc(providerLabel(overallWinner))}</div>
    </div>`)
  }

  if (cards.length === 0) return ''

  return `<section class="summary-section">
  <h2 class="summary-title">Summary</h2>
  <div class="summary-cards">
    ${cards.join('\n    ')}
  </div>
</section>`
}

// ── Render: errors ──────────────────────────────────────────────────

function renderErrors(errors: DedupedError[]): string {
  const items = errors.map(e => {
    const suffix = e.count > 1 ? ` <span class="error-count">(&times;${e.count})</span>` : ''
    const hint = e.hint ? `<div class="error-hint">${esc(e.hint)}</div>` : ''
    return `<div class="error-item">
      <span class="error-provider">${esc(e.providerId)}:</span>
      <span class="error-msg">${esc(e.error)}</span>${suffix}
      ${hint}
    </div>`
  }).join('\n')

  return `<section class="errors-section">
  <h2 class="errors-title" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'block'">Errors</h2>
  <div class="errors-list">
    ${items}
  </div>
</section>`
}

// ── Render: footer ──────────────────────────────────────────────────

function renderFooter(): string {
  return `<footer class="report-footer">
  <div class="footer-brand">
    Powered by <a href="https://github.com/DataGobes/agent-duelist" target="_blank" rel="noopener">Agent Duelist</a>
  </div>
  <a class="footer-cta" href="https://github.com/DataGobes/agent-duelist" target="_blank" rel="noopener">
    &#x2B50; Star on GitHub
  </a>
</footer>`
}

// ── Render: script ──────────────────────────────────────────────────

function renderScript(taskCount: number): string {
  return `<script>
(function() {
  /* Tab switching */
  ${taskCount > 1 ? `
  var tabs = document.querySelectorAll('.task-tab');
  var sections = document.querySelectorAll('.task-section');
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      var idx = parseInt(tab.getAttribute('data-task'));
      tabs.forEach(function(t) { t.classList.remove('active'); });
      sections.forEach(function(s) { s.classList.remove('active'); });
      tab.classList.add('active');
      sections[idx].classList.add('active');
    });
  });` : ''}

  /* Column sorting */
  document.querySelectorAll('.results-table th').forEach(function(th, colIdx) {
    var table = th.closest('table');
    var asc = true;
    th.addEventListener('click', function() {
      var tbody = table.querySelector('tbody');
      var rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort(function(a, b) {
        var aCell = a.children[colIdx];
        var bCell = b.children[colIdx];
        var aVal = aCell.getAttribute('data-sort-val');
        var bVal = bCell.getAttribute('data-sort-val');
        if (aVal !== null && bVal !== null) {
          return asc ? parseFloat(aVal) - parseFloat(bVal) : parseFloat(bVal) - parseFloat(aVal);
        }
        var aText = aCell.textContent || '';
        var bText = bCell.textContent || '';
        return asc ? aText.localeCompare(bText) : bText.localeCompare(aText);
      });
      rows.forEach(function(row) { tbody.appendChild(row); });

      /* Update sort arrows */
      table.querySelectorAll('th .sort-arrow').forEach(function(a) { a.textContent = ''; });
      th.querySelector('.sort-arrow').textContent = asc ? ' \\u25B2' : ' \\u25BC';
      asc = !asc;
    });
  });
})();
</script>`
}
