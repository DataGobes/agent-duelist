import { describe, it, expect } from 'vitest'
import {
  markdownReporter,
  markdownComparisonTable,
  markdownCostSummary,
  COMMENT_MARKER,
} from './markdown.js'
import type { CiReport, ScorerComparison, CostSummary, ScorerStats } from '../ci.js'

// ── Helpers ──────────────────────────────────────────────────────────

function makeStats(mean: number, n = 1): ScorerStats {
  if (n === 1) {
    return { mean, stddev: 0, cv: 0, n: 1, ci95Lower: mean, ci95Upper: mean }
  }
  return { mean, stddev: 0.05, cv: 0.05 / mean, n, ci95Lower: mean - 0.03, ci95Upper: mean + 0.03 }
}

function makeComparison(overrides: Partial<ScorerComparison>): ScorerComparison {
  return {
    providerId: 'openai/gpt-4o',
    taskName: 'extract',
    scorerName: 'correctness',
    baseline: null,
    current: makeStats(0.85),
    delta: null,
    regressed: false,
    improved: false,
    flaky: false,
    ...overrides,
  }
}

function makeReport(overrides: Partial<CiReport>): CiReport {
  return {
    comparisons: [],
    cost: { totalUsd: 0, perProvider: new Map(), budget: undefined, overBudget: false },
    failed: false,
    flakyResults: [],
    failureReasons: [],
    ...overrides,
  }
}

// ── COMMENT_MARKER ───────────────────────────────────────────────────

describe('COMMENT_MARKER', () => {
  it('is an HTML comment for idempotent PR updates', () => {
    expect(COMMENT_MARKER).toMatch(/^<!--.*-->$/)
  })
})

// ── markdownComparisonTable ──────────────────────────────────────────

describe('markdownComparisonTable', () => {
  it('renders table headers', () => {
    const table = markdownComparisonTable([])
    expect(table).toContain('Provider')
    expect(table).toContain('Baseline')
    expect(table).toContain('Status')
  })

  it('shows "new" indicator when no baseline exists', () => {
    const table = markdownComparisonTable([
      makeComparison({ baseline: null }),
    ])
    expect(table).toContain('🆕 new')
    expect(table).toContain('—') // baseline column
  })

  it('shows regressed indicator', () => {
    const table = markdownComparisonTable([
      makeComparison({
        baseline: makeStats(0.95),
        current: makeStats(0.7),
        delta: -0.25,
        regressed: true,
      }),
    ])
    expect(table).toContain('🔴 regressed')
    expect(table).toContain('-0.250')
  })

  it('shows improved indicator', () => {
    const table = markdownComparisonTable([
      makeComparison({
        baseline: makeStats(0.7),
        current: makeStats(0.95),
        delta: 0.25,
        improved: true,
      }),
    ])
    expect(table).toContain('🟢 improved')
    expect(table).toContain('+0.250')
  })

  it('shows unchanged indicator', () => {
    const table = markdownComparisonTable([
      makeComparison({
        baseline: makeStats(0.85),
        current: makeStats(0.85),
        delta: 0,
      }),
    ])
    expect(table).toContain('⚪ unchanged')
  })

  it('formats multi-run stats with ± notation', () => {
    const table = markdownComparisonTable([
      makeComparison({
        current: makeStats(0.85, 5),
      }),
    ])
    expect(table).toContain('±')
  })

  it('formats single-run stats without ± notation', () => {
    const table = markdownComparisonTable([
      makeComparison({
        current: makeStats(0.85, 1),
      }),
    ])
    expect(table).toContain('0.850')
    // Should not contain ± for the current column (baseline is '—')
    const lines = table.split('\n')
    const dataLine = lines.find((l) => l.includes('openai'))!
    // Current is the 5th column; baseline is '—' so no ± there either
    const cells = dataLine.split('|').map((c) => c.trim())
    // cells: ['', 'provider', 'task', 'scorer', 'baseline', 'current', 'delta', 'status', '']
    expect(cells[5]).toBe('0.850')
  })
})

// ── markdownCostSummary ──────────────────────────────────────────────

describe('markdownCostSummary', () => {
  it('shows total cost', () => {
    const cost: CostSummary = {
      totalUsd: 0.0342,
      perProvider: new Map([['openai/gpt-4o', 0.0342]]),
      budget: undefined,
      overBudget: false,
    }
    const md = markdownCostSummary(cost)
    expect(md).toContain('$0.0342')
  })

  it('shows budget with percentage and pass indicator', () => {
    const cost: CostSummary = {
      totalUsd: 0.5,
      perProvider: new Map([['a', 0.5]]),
      budget: 1.0,
      overBudget: false,
    }
    const md = markdownCostSummary(cost)
    expect(md).toContain('$1.00')
    expect(md).toContain('50%')
    expect(md).toContain('🟢')
  })

  it('shows over-budget indicator', () => {
    const cost: CostSummary = {
      totalUsd: 1.5,
      perProvider: new Map([['a', 1.5]]),
      budget: 1.0,
      overBudget: true,
    }
    const md = markdownCostSummary(cost)
    expect(md).toContain('🔴')
    expect(md).toContain('150%')
  })

  it('shows per-provider breakdown for multiple providers', () => {
    const cost: CostSummary = {
      totalUsd: 0.05,
      perProvider: new Map([['a', 0.03], ['b', 0.02]]),
      budget: undefined,
      overBudget: false,
    }
    const md = markdownCostSummary(cost)
    expect(md).toContain('| a |')
    expect(md).toContain('| b |')
  })
})

// ── markdownReporter (full output) ───────────────────────────────────

describe('markdownReporter', () => {
  it('includes comment marker for idempotent updates', () => {
    const report = makeReport({})
    const md = markdownReporter(report, [])
    expect(md).toContain(COMMENT_MARKER)
  })

  it('shows passed header when not failed', () => {
    const md = markdownReporter(makeReport({ failed: false }), [])
    expect(md).toContain('🟢 Passed')
  })

  it('shows failed header when failed', () => {
    const md = markdownReporter(makeReport({ failed: true, failureReasons: ['something'] }), [])
    expect(md).toContain('🔴 Failed')
  })

  it('includes flakiness warnings', () => {
    const flaky = makeComparison({ flaky: true, current: { mean: 0.5, stddev: 0.3, cv: 0.6, n: 5, ci95Lower: 0.2, ci95Upper: 0.8 } })
    const md = markdownReporter(makeReport({ flakyResults: [flaky] }), [])
    expect(md).toContain('Flaky Results')
    expect(md).toContain('CV = 0.60')
  })

  it('includes failure reasons', () => {
    const md = markdownReporter(makeReport({
      failed: true,
      failureReasons: ['correctness regressed by -0.25'],
    }), [])
    expect(md).toContain('Failure Reasons')
    expect(md).toContain('correctness regressed by -0.25')
  })

  it('includes agent-duelist attribution', () => {
    const md = markdownReporter(makeReport({}), [])
    expect(md).toContain('agent-duelist')
  })
})
