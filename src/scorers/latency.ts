import type { ScorerFn } from './types.js'

// Normalizes latency to 0–1 where 1 = fast (≤500ms), 0 = slow (≥10s)
const MIN_MS = 500
const MAX_MS = 10_000

export const latencyScorer: ScorerFn = ({ result }) => {
  const clamped = Math.max(MIN_MS, Math.min(MAX_MS, result.latencyMs))
  const value = 1 - (clamped - MIN_MS) / (MAX_MS - MIN_MS)

  return {
    name: 'latency',
    value: Math.round(value * 100) / 100,
    details: { ms: result.latencyMs },
  }
}
