import type { BenchmarkResult } from '../runner.js'

// ── Shared types ────────────────────────────────────────────────────

export interface AggregatedDetails {
  costUsd: number | undefined
  totalTokens: number | undefined
}

export interface ProviderTaskData {
  providerId: string
  avgScores: Record<string, number>
  avgDetails: AggregatedDetails
  latencyMs: number | undefined
  allErrors: boolean
  errorCount: number
}

export interface ColumnStats {
  values: Map<string, number | undefined>
  best: number | undefined
  worst: number | undefined
}

export type Medal = 'gold' | 'silver' | 'bronze' | 'none'

export interface GroupedResults {
  tasks: string[]
  providers: string[]
  scorerNames: string[]
  grouped: Map<string, BenchmarkResult[]>
  byProvider: Map<string, BenchmarkResult[]>
  hasErrors: boolean
  maxRun: number
}

// ── Grouping ────────────────────────────────────────────────────────

export function groupResults(results: BenchmarkResult[]): GroupedResults {
  const taskSet = new Set<string>()
  const providerSet = new Set<string>()
  const scorerSet = new Set<string>()
  const grouped = new Map<string, BenchmarkResult[]>()
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

  return {
    tasks: [...taskSet],
    providers: [...providerSet],
    scorerNames: [...scorerSet],
    grouped,
    byProvider,
    hasErrors,
    maxRun,
  }
}

// ── Aggregation ─────────────────────────────────────────────────────

export function aggregateProviderTask(
  providerId: string,
  grouped: Map<string, BenchmarkResult[]>,
  task: string
): ProviderTaskData {
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
}

export function averageScores(results: BenchmarkResult[]): Record<string, number> {
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

export function averageDetails(results: BenchmarkResult[]): AggregatedDetails {
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

export function average(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

// ── Column statistics & medals ──────────────────────────────────────

export function computeColumnStats(
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

export function computeMedals(
  columnStats: Map<string, ColumnStats>,
  providerIds: string[]
): Map<string, Medal> {
  const medals = new Map<string, Medal>()

  if (providerIds.length < 2) {
    for (const id of providerIds) medals.set(id, 'none')
    return medals
  }

  const wins = new Map<string, number>()
  for (const id of providerIds) wins.set(id, 0)

  for (const [, colStats] of columnStats) {
    if (colStats.best === undefined) continue
    const bestProviders = [...colStats.values.entries()]
      .filter(([, v]) => v !== undefined && v === colStats.best)
    if (bestProviders.length === 1) {
      wins.set(bestProviders[0]![0], (wins.get(bestProviders[0]![0]) ?? 0) + 1)
    }
  }

  const totalWins = [...wins.values()].reduce((a, b) => a + b, 0)
  if (totalWins === 0) {
    for (const id of providerIds) medals.set(id, 'none')
    return medals
  }

  const sorted = [...wins.entries()].sort((a, b) =>
    b[1] - a[1] || a[0].localeCompare(b[0])
  )

  const medalList: Medal[] = ['gold', 'silver', 'bronze']
  let rank = 0
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]![1] < sorted[i - 1]![1]) {
      rank = i
    }
    const hasWins = sorted[i]![1] > 0
    medals.set(sorted[i]![0], hasWins && rank < medalList.length ? medalList[rank]! : 'none')
  }

  return medals
}

// ── Helpers ─────────────────────────────────────────────────────────

export function providerLabel(providerId: string): string {
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

export function apiKeyHint(providerId: string, error: string): string | undefined {
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

export function rankProviders(
  successByProvider: Map<string, BenchmarkResult[]>,
  providers: string[],
  scorerName: string
): { id: string; avg: number } | undefined {
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

export function scorerLabel(name: string): string {
  switch (name) {
    case 'correctness': return 'Match'
    case 'schema-correctness': return 'Schema'
    case 'fuzzy-similarity': return 'Fuzzy'
    case 'llm-judge-correctness': return 'Judge'
    case 'tool-usage': return 'Tool'
    default: return name
  }
}

/** Medal emoji for display */
export function medalEmoji(medal: Medal): string {
  switch (medal) {
    case 'gold': return '🥇'
    case 'silver': return '🥈'
    case 'bronze': return '🥉'
    case 'none': return ''
  }
}
