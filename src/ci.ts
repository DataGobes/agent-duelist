import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { BenchmarkResult } from './runner.js'
import { formatDelta } from './utils/format.js'

// ── Types ────────────────────────────────────────────────────────────

export interface CiOptions {
  configPath: string
  baselinePath: string
  budget?: number
  thresholds: Map<string, number>
  updateBaseline: boolean
  comment: boolean
  quiet: boolean
}

export interface ScorerStats {
  mean: number
  stddev: number
  cv: number // coefficient of variation
  n: number
  ci95Lower: number
  ci95Upper: number
}

export interface ScorerComparison {
  providerId: string
  taskName: string
  scorerName: string
  baseline: ScorerStats | null
  current: ScorerStats
  delta: number | null // current.mean - baseline.mean (null when no baseline)
  regressed: boolean
  improved: boolean
  flaky: boolean
}

export interface CostSummary {
  totalUsd: number
  perProvider: Map<string, number>
  budget: number | undefined
  overBudget: boolean
}

export interface CiReport {
  comparisons: ScorerComparison[]
  cost: CostSummary
  failed: boolean
  flakyResults: ScorerComparison[]
  failureReasons: string[]
}

// ── Constants ────────────────────────────────────────────────────────

/** Scorers where lower values are better */
const LOWER_IS_BETTER = new Set(['cost'])

/** CV threshold above which a scorer is flagged as flaky */
const FLAKY_CV_THRESHOLD = 0.3

/**
 * T-distribution critical values for 95% two-tailed CI.
 * Index = degrees of freedom (df). For df > 30 we use z ≈ 1.96.
 */
const T_CRITICAL_95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
  6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  15: 2.131, 20: 2.086, 25: 2.060, 30: 2.042,
}

const T_CRITICAL_KEYS = Object.keys(T_CRITICAL_95).map(Number).sort((a, b) => a - b)

function tCritical(df: number): number {
  if (df <= 0) return 1.96
  if (T_CRITICAL_95[df] !== undefined) return T_CRITICAL_95[df]!
  // Interpolate between known values or fall back to z-approximation
  const keys = T_CRITICAL_KEYS
  if (df > keys[keys.length - 1]!) return 1.96
  // Find surrounding keys and linearly interpolate
  for (let i = 0; i < keys.length - 1; i++) {
    if (df > keys[i]! && df < keys[i + 1]!) {
      const low = keys[i]!, high = keys[i + 1]!
      const ratio = (df - low) / (high - low)
      return T_CRITICAL_95[low]! + ratio * (T_CRITICAL_95[high]! - T_CRITICAL_95[low]!)
    }
  }
  return 1.96
}

// ── Stats ────────────────────────────────────────────────────────────

export function computeScorerStats(samples: number[]): ScorerStats {
  const n = samples.length
  if (n === 0) {
    return { mean: 0, stddev: 0, cv: 0, n: 0, ci95Lower: 0, ci95Upper: 0 }
  }

  const mean = samples.reduce((a, b) => a + b, 0) / n

  if (n === 1) {
    return { mean, stddev: 0, cv: 0, n: 1, ci95Lower: mean, ci95Upper: mean }
  }

  const variance = samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1)
  const stddev = Math.sqrt(variance)
  const cv = mean !== 0 ? stddev / Math.abs(mean) : 0
  const se = stddev / Math.sqrt(n)
  const t = tCritical(n - 1)

  return {
    mean,
    stddev,
    cv,
    n,
    ci95Lower: mean - t * se,
    ci95Upper: mean + t * se,
  }
}

// ── Grouping ─────────────────────────────────────────────────────────

/** Group key: providerId::taskName::scorerName */
function groupKey(providerId: string, taskName: string, scorerName: string): string {
  return `${providerId}::${taskName}::${scorerName}`
}

export function computeStats(results: BenchmarkResult[]): Map<string, ScorerStats> {
  const grouped = new Map<string, number[]>()

  for (const r of results) {
    if (r.error) continue
    for (const score of r.scores) {
      if (score.value < 0) continue // skip unavailable scores (e.g., cost = -1)
      const key = groupKey(r.providerId, r.taskName, score.name)
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(score.value)
    }
  }

  const stats = new Map<string, ScorerStats>()
  for (const [key, samples] of grouped) {
    stats.set(key, computeScorerStats(samples))
  }
  return stats
}

// ── Cost ─────────────────────────────────────────────────────────────

export function computeCostSummary(results: BenchmarkResult[], budget?: number): CostSummary {
  let totalUsd = 0
  const perProvider = new Map<string, number>()

  for (const r of results) {
    if (r.error) continue
    const costScore = r.scores.find((s) => s.name === 'cost')
    if (!costScore || costScore.value < 0) continue

    const details = costScore.details as { estimatedUsd?: number } | undefined
    const usd = details?.estimatedUsd ?? 0
    if (usd <= 0) continue

    totalUsd += usd
    perProvider.set(r.providerId, (perProvider.get(r.providerId) ?? 0) + usd)
  }

  return {
    totalUsd,
    perProvider,
    budget,
    overBudget: budget !== undefined && totalUsd > budget,
  }
}

// ── Comparison ───────────────────────────────────────────────────────

export function compareResults(
  baselineStats: Map<string, ScorerStats> | null,
  currentStats: Map<string, ScorerStats>,
  thresholds: Map<string, number>,
  budget?: number,
  currentResults?: BenchmarkResult[],
): CiReport {
  const comparisons: ScorerComparison[] = []
  const failureReasons: string[] = []

  for (const [key, current] of currentStats) {
    const [providerId, taskName, scorerName] = key.split('::') as [string, string, string]
    const baseline = baselineStats?.get(key) ?? null

    let delta: number | null = null
    let regressed = false
    let improved = false

    if (baseline) {
      delta = current.mean - baseline.mean
      const threshold = thresholds.get(scorerName)

      if (threshold !== undefined) {
        const lowerIsBetter = LOWER_IS_BETTER.has(scorerName)
        regressed = detectRegression(baseline, current, threshold, lowerIsBetter)
        improved = detectImprovement(baseline, current, threshold, lowerIsBetter)
      }
    }

    const flaky = current.n > 1 && current.cv > FLAKY_CV_THRESHOLD

    comparisons.push({
      providerId, taskName, scorerName,
      baseline, current, delta,
      regressed, improved, flaky,
    })
  }

  // Cost check
  const cost = computeCostSummary(currentResults ?? [], budget)

  // Determine failure
  const regressions = comparisons.filter((c) => c.regressed)
  if (regressions.length > 0) {
    for (const r of regressions) {
      failureReasons.push(
        `${r.providerId} × ${r.taskName}: ${r.scorerName} regressed by ${formatDelta(r.delta!)}`
      )
    }
  }
  if (cost.overBudget) {
    failureReasons.push(
      `Total cost $${cost.totalUsd.toFixed(4)} exceeds budget $${cost.budget!.toFixed(2)}`
    )
  }

  const flakyResults = comparisons.filter((c) => c.flaky)
  const failed = failureReasons.length > 0

  return { comparisons, cost, failed, flakyResults, failureReasons }
}

function detectRegression(
  baseline: ScorerStats,
  current: ScorerStats,
  threshold: number,
  lowerIsBetter: boolean,
): boolean {
  // For single-run comparisons: simple delta
  if (baseline.n === 1 && current.n === 1) {
    const delta = current.mean - baseline.mean
    if (lowerIsBetter) return delta > threshold
    return delta < -threshold
  }

  // Multi-run: conservative CI comparison
  if (lowerIsBetter) {
    // Cost-like: regresses if current lower bound is significantly above baseline upper bound
    return current.ci95Lower - baseline.ci95Upper > threshold
  }
  // Quality-like: regresses if current lower bound is significantly below baseline upper bound
  return baseline.ci95Upper - current.ci95Lower > threshold && current.mean < baseline.mean
}

function detectImprovement(
  baseline: ScorerStats,
  current: ScorerStats,
  threshold: number,
  lowerIsBetter: boolean,
): boolean {
  if (baseline.n === 1 && current.n === 1) {
    const delta = current.mean - baseline.mean
    if (lowerIsBetter) return delta < -threshold
    return delta > threshold
  }

  if (lowerIsBetter) {
    return baseline.ci95Lower - current.ci95Upper > threshold
  }
  return current.ci95Lower - baseline.ci95Upper > threshold
}

// ── Baseline I/O ─────────────────────────────────────────────────────

export interface BaselineData {
  timestamp: string
  results: BenchmarkResult[]
}

export function loadBaseline(path: string): BaselineData | null {
  try {
    const raw = readFileSync(path, 'utf-8')
    const data = JSON.parse(raw) as Record<string, unknown>

    // Support both formats: { results: [...] } and { results: [...], timestamp: ... }
    const results = (data.results ?? data) as BenchmarkResult[]
    if (!Array.isArray(results)) return null

    return {
      timestamp: (data.timestamp as string) ?? 'unknown',
      results,
    }
  } catch {
    return null
  }
}

export function saveBaseline(path: string, results: BenchmarkResult[]): void {
  mkdirSync(dirname(path), { recursive: true })
  const data: BaselineData = {
    timestamp: new Date().toISOString(),
    results,
  }
  writeFileSync(path, JSON.stringify(data, null, 2))
}
