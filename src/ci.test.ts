import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  computeScorerStats,
  computeStats,
  compareResults,
  computeCostSummary,
  loadBaseline,
  saveBaseline,
} from './ci.js'
import type { BenchmarkResult } from './runner.js'
import type { ScorerStats } from './ci.js'

// ── Helpers ──────────────────────────────────────────────────────────

function makeBenchmark(overrides: Partial<BenchmarkResult> & { providerId: string; taskName: string }): BenchmarkResult {
  return {
    run: 1,
    scores: [],
    raw: { output: 'test', latencyMs: 100 },
    ...overrides,
  }
}

function makeResult(providerId: string, taskName: string, scores: { name: string; value: number; details?: unknown }[], run = 1): BenchmarkResult {
  return {
    providerId,
    taskName,
    run,
    scores,
    raw: { output: 'ok', latencyMs: 100 },
  }
}

// ── computeScorerStats ───────────────────────────────────────────────

describe('computeScorerStats', () => {
  it('returns zeros for empty samples', () => {
    const stats = computeScorerStats([])
    expect(stats.mean).toBe(0)
    expect(stats.n).toBe(0)
  })

  it('handles single sample — no CI spread', () => {
    const stats = computeScorerStats([0.85])
    expect(stats.mean).toBe(0.85)
    expect(stats.n).toBe(1)
    expect(stats.stddev).toBe(0)
    expect(stats.ci95Lower).toBe(0.85)
    expect(stats.ci95Upper).toBe(0.85)
  })

  it('computes mean and stddev for multiple samples', () => {
    const stats = computeScorerStats([0.8, 0.9, 0.85])
    expect(stats.mean).toBeCloseTo(0.85, 5)
    expect(stats.n).toBe(3)
    expect(stats.stddev).toBeGreaterThan(0)
  })

  it('computes 95% CI that contains the mean', () => {
    const stats = computeScorerStats([0.7, 0.8, 0.9, 0.85, 0.75])
    expect(stats.ci95Lower).toBeLessThan(stats.mean)
    expect(stats.ci95Upper).toBeGreaterThan(stats.mean)
  })

  it('CI narrows with more consistent samples', () => {
    const tight = computeScorerStats([0.85, 0.85, 0.85, 0.85, 0.85])
    const loose = computeScorerStats([0.5, 0.6, 0.9, 1.0, 0.85])
    const tightRange = tight.ci95Upper - tight.ci95Lower
    const looseRange = loose.ci95Upper - loose.ci95Lower
    expect(tightRange).toBeLessThan(looseRange)
  })

  it('computes coefficient of variation', () => {
    const stats = computeScorerStats([0.5, 1.0, 0.5, 1.0])
    expect(stats.cv).toBeGreaterThan(0.3) // noisy data → high CV
  })
})

// ── computeStats ─────────────────────────────────────────────────────

describe('computeStats', () => {
  it('groups results by provider, task, and scorer', () => {
    const results = [
      makeResult('openai', 'task1', [{ name: 'correctness', value: 1.0 }], 1),
      makeResult('openai', 'task1', [{ name: 'correctness', value: 0.8 }], 2),
      makeResult('anthropic', 'task1', [{ name: 'correctness', value: 0.9 }], 1),
    ]

    const stats = computeStats(results)
    expect(stats.get('openai::task1::correctness')?.mean).toBeCloseTo(0.9)
    expect(stats.get('openai::task1::correctness')?.n).toBe(2)
    expect(stats.get('anthropic::task1::correctness')?.n).toBe(1)
  })

  it('skips error results', () => {
    const results = [
      makeBenchmark({ providerId: 'a', taskName: 't', error: 'fail', scores: [] }),
      makeResult('a', 't', [{ name: 'correctness', value: 0.9 }]),
    ]

    const stats = computeStats(results)
    expect(stats.get('a::t::correctness')?.n).toBe(1)
  })

  it('skips negative score values (unavailable)', () => {
    const results = [
      makeResult('a', 't', [{ name: 'cost', value: -1 }]),
    ]

    const stats = computeStats(results)
    expect(stats.has('a::t::cost')).toBe(false)
  })
})

// ── compareResults ───────────────────────────────────────────────────

describe('compareResults', () => {
  it('passes with no baseline (first run)', () => {
    const current = new Map<string, ScorerStats>()
    current.set('a::t::correctness', computeScorerStats([0.85]))

    const report = compareResults(null, current, new Map([['correctness', 0.1]]))
    expect(report.failed).toBe(false)
    expect(report.comparisons[0]!.delta).toBeNull()
    expect(report.comparisons[0]!.regressed).toBe(false)
  })

  it('detects single-run regression (higher-is-better)', () => {
    const baseline = new Map<string, ScorerStats>()
    baseline.set('a::t::correctness', computeScorerStats([0.9]))

    const current = new Map<string, ScorerStats>()
    current.set('a::t::correctness', computeScorerStats([0.7]))

    const report = compareResults(baseline, current, new Map([['correctness', 0.1]]))
    expect(report.failed).toBe(true)
    expect(report.comparisons[0]!.regressed).toBe(true)
  })

  it('does not regress within threshold (single-run)', () => {
    const baseline = new Map<string, ScorerStats>()
    baseline.set('a::t::correctness', computeScorerStats([0.9]))

    const current = new Map<string, ScorerStats>()
    current.set('a::t::correctness', computeScorerStats([0.85]))

    const report = compareResults(baseline, current, new Map([['correctness', 0.1]]))
    expect(report.comparisons[0]!.regressed).toBe(false)
  })

  it('detects single-run regression (lower-is-better, cost)', () => {
    const baseline = new Map<string, ScorerStats>()
    baseline.set('a::t::cost', computeScorerStats([0.001]))

    const current = new Map<string, ScorerStats>()
    current.set('a::t::cost', computeScorerStats([0.01]))

    const report = compareResults(baseline, current, new Map([['cost', 0.002]]))
    expect(report.comparisons[0]!.regressed).toBe(true)
  })

  it('skips regression checks when no thresholds provided', () => {
    const baseline = new Map<string, ScorerStats>()
    baseline.set('a::t::correctness', computeScorerStats([1.0]))

    const current = new Map<string, ScorerStats>()
    current.set('a::t::correctness', computeScorerStats([0.0]))

    const report = compareResults(baseline, current, new Map()) // no thresholds
    expect(report.comparisons[0]!.regressed).toBe(false)
    expect(report.failed).toBe(false)
  })

  it('includes new provider/task without regression', () => {
    const baseline = new Map<string, ScorerStats>()
    baseline.set('a::t1::correctness', computeScorerStats([0.9]))

    const current = new Map<string, ScorerStats>()
    current.set('a::t1::correctness', computeScorerStats([0.9]))
    current.set('b::t1::correctness', computeScorerStats([0.8])) // new provider

    const report = compareResults(baseline, current, new Map([['correctness', 0.1]]))
    expect(report.failed).toBe(false)
    const newComparison = report.comparisons.find((c) => c.providerId === 'b')
    expect(newComparison?.baseline).toBeNull()
  })

  it('flags flaky results when CV is high', () => {
    const current = new Map<string, ScorerStats>()
    current.set('a::t::correctness', computeScorerStats([0.3, 1.0, 0.2, 0.9]))

    const report = compareResults(null, current, new Map())
    expect(report.flakyResults.length).toBe(1)
    expect(report.flakyResults[0]!.flaky).toBe(true)
  })

  it('does not flag single-run as flaky', () => {
    const current = new Map<string, ScorerStats>()
    current.set('a::t::correctness', computeScorerStats([0.5]))

    const report = compareResults(null, current, new Map())
    expect(report.flakyResults.length).toBe(0)
  })
})

// ── computeCostSummary ───────────────────────────────────────────────

describe('computeCostSummary', () => {
  it('sums cost across results', () => {
    const results = [
      makeResult('a', 't1', [{ name: 'cost', value: 0.001, details: { estimatedUsd: 0.001 } }]),
      makeResult('a', 't2', [{ name: 'cost', value: 0.002, details: { estimatedUsd: 0.002 } }]),
      makeResult('b', 't1', [{ name: 'cost', value: 0.003, details: { estimatedUsd: 0.003 } }]),
    ]

    const summary = computeCostSummary(results)
    expect(summary.totalUsd).toBeCloseTo(0.006)
    expect(summary.perProvider.get('a')).toBeCloseTo(0.003)
    expect(summary.perProvider.get('b')).toBeCloseTo(0.003)
  })

  it('detects over-budget', () => {
    const results = [
      makeResult('a', 't', [{ name: 'cost', value: 0.5, details: { estimatedUsd: 0.5 } }]),
      makeResult('a', 't', [{ name: 'cost', value: 0.6, details: { estimatedUsd: 0.6 } }]),
    ]

    const summary = computeCostSummary(results, 1.0)
    expect(summary.overBudget).toBe(true)
  })

  it('passes when under budget', () => {
    const results = [
      makeResult('a', 't', [{ name: 'cost', value: 0.1, details: { estimatedUsd: 0.1 } }]),
    ]

    const summary = computeCostSummary(results, 1.0)
    expect(summary.overBudget).toBe(false)
  })

  it('skips error results and negative cost values', () => {
    const results = [
      makeBenchmark({ providerId: 'a', taskName: 't', error: 'fail' }),
      makeResult('a', 't', [{ name: 'cost', value: -1, details: { estimatedUsd: null } }]),
    ]

    const summary = computeCostSummary(results)
    expect(summary.totalUsd).toBe(0)
  })

  it('reports no overBudget when budget is undefined', () => {
    const results = [
      makeResult('a', 't', [{ name: 'cost', value: 999, details: { estimatedUsd: 999 } }]),
    ]

    const summary = computeCostSummary(results)
    expect(summary.overBudget).toBe(false)
  })
})

// ── Baseline I/O ─────────────────────────────────────────────────────

describe('baseline I/O', () => {
  const tmpDir = join(tmpdir(), `duelist-ci-test-${Date.now()}`)

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  it('saves and loads baseline round-trip', () => {
    const path = join(tmpDir, '.duelist', 'baseline.json')
    const results: BenchmarkResult[] = [
      makeResult('a', 't', [{ name: 'correctness', value: 0.9 }]),
    ]

    saveBaseline(path, results)
    const loaded = loadBaseline(path)

    expect(loaded).not.toBeNull()
    expect(loaded!.results).toHaveLength(1)
    expect(loaded!.results[0]!.scores[0]!.value).toBe(0.9)
    expect(loaded!.timestamp).toBeTruthy()
  })

  it('returns null for missing file', () => {
    const loaded = loadBaseline(join(tmpDir, 'nope.json'))
    expect(loaded).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    const path = join(tmpDir, 'bad.json')
    writeFileSync(path, 'not json')
    expect(loadBaseline(path)).toBeNull()
  })

  it('creates parent directories when saving', () => {
    const path = join(tmpDir, 'a', 'b', 'c', 'baseline.json')
    saveBaseline(path, [])
    const loaded = loadBaseline(path)
    expect(loaded).not.toBeNull()
    expect(loaded!.results).toEqual([])
  })
})

// ── Budget + regression combined ─────────────────────────────────────

describe('compareResults — budget enforcement', () => {
  it('fails when budget is exceeded even without thresholds', () => {
    const current = new Map<string, ScorerStats>()
    current.set('a::t::correctness', computeScorerStats([0.9]))

    const results = [
      makeResult('a', 't', [
        { name: 'correctness', value: 0.9 },
        { name: 'cost', value: 2.0, details: { estimatedUsd: 2.0 } },
      ]),
    ]

    const report = compareResults(null, current, new Map(), 1.0, results)
    expect(report.failed).toBe(true)
    expect(report.failureReasons[0]).toContain('exceeds budget')
  })
})
