import { describe, it, expect } from 'vitest'
import {
  type ColumnStats,
  passesQualityGate,
  computeMedals,
} from './shared.js'

function makeStats(columns: Record<string, Record<string, number | undefined>>): Map<string, ColumnStats> {
  const stats = new Map<string, ColumnStats>()
  for (const [col, providerValues] of Object.entries(columns)) {
    const values = new Map(Object.entries(providerValues))
    const nums = [...values.values()].filter((v): v is number => v !== undefined)
    // For quality scorers: higher is better; for latency/cost: lower is better
    const isEfficiency = col === 'latency' || col === 'cost' || col === 'tokens'
    stats.set(col, {
      values,
      best: nums.length > 0 ? (isEfficiency ? Math.min(...nums) : Math.max(...nums)) : undefined,
      worst: nums.length > 0 ? (isEfficiency ? Math.max(...nums) : Math.min(...nums)) : undefined,
    })
  }
  return stats
}

describe('passesQualityGate', () => {
  it('returns false when provider scores 0 on all quality scorers', () => {
    const stats = makeStats({
      correctness: { A: 0, B: 0.8 },
      'schema-correctness': { A: 0, B: 1 },
      latency: { A: 200, B: 500 },
    })
    expect(passesQualityGate('A', stats)).toBe(false)
  })

  it('returns true when provider scores > 0 on any quality scorer', () => {
    const stats = makeStats({
      correctness: { A: 0, B: 0.8 },
      'schema-correctness': { A: 0.5, B: 1 },
    })
    expect(passesQualityGate('A', stats)).toBe(true)
  })

  it('returns true when no quality scorers are present', () => {
    const stats = makeStats({ latency: { A: 200 } })
    expect(passesQualityGate('A', stats)).toBe(true)
  })
})

describe('computeMedals', () => {
  it('does not medal a provider with 0% quality even if fastest', () => {
    const stats = makeStats({
      correctness: { fast: 0, accurate: 0.9 },
      'schema-correctness': { fast: 0, accurate: 1 },
      latency: { fast: 100, accurate: 500 },
    })
    const medals = computeMedals(stats, ['fast', 'accurate'])
    expect(medals.get('fast')).toBe('none')
    expect(medals.get('accurate')).toBe('gold')
  })

  it('ranks by quality wins before efficiency wins', () => {
    const stats = makeStats({
      correctness: { A: 1.0, B: 0.8 },
      latency: { A: 500, B: 100 },
      cost: { A: 0.05, B: 0.01 },
    })
    // A wins correctness (quality), B wins latency + cost (efficiency)
    const medals = computeMedals(stats, ['A', 'B'])
    expect(medals.get('A')).toBe('gold')
    expect(medals.get('B')).toBe('silver')
  })

  it('uses efficiency as tiebreaker when quality wins are equal', () => {
    const stats = makeStats({
      correctness: { A: 1.0, B: 1.0 },
      latency: { A: 500, B: 100 },
    })
    // Tied on quality (both 1.0, no sole winner), B wins latency
    const medals = computeMedals(stats, ['A', 'B'])
    expect(medals.get('B')).toBe('gold')
    expect(medals.get('A')).toBe('silver')
  })

  it('handles three providers with quality-first ranking', () => {
    const stats = makeStats({
      correctness: { A: 1.0, B: 0.5, C: 0 },
      'schema-correctness': { A: 1.0, B: 1.0, C: 0 },
      latency: { A: 800, B: 500, C: 100 },
    })
    const medals = computeMedals(stats, ['A', 'B', 'C'])
    expect(medals.get('A')).toBe('gold')    // best quality
    expect(medals.get('B')).toBe('silver')  // second quality
    expect(medals.get('C')).toBe('none')    // fails quality gate
  })

  it('returns none for all when single provider', () => {
    const stats = makeStats({ correctness: { A: 1.0 } })
    const medals = computeMedals(stats, ['A'])
    expect(medals.get('A')).toBe('none')
  })
})
