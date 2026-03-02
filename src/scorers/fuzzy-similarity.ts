import type { ScorerFn } from './types.js'

export const fuzzySimilarityScorer: ScorerFn = ({ task, result }) => {
  if (task.expected === undefined) {
    return { name: 'fuzzy-similarity', value: -1, details: { reason: 'no expected value' } }
  }

  const a = stringify(task.expected)
  const b = stringify(result.output)
  const setA = tokenize(a)
  const setB = tokenize(b)

  const similarity = jaccardSimilarity(setA, setB)

  return {
    name: 'fuzzy-similarity',
    value: Math.round(similarity * 100) / 100,
    details: { method: 'jaccard', expectedTokens: setA.size, actualTokens: setB.size },
  }
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value.toLowerCase()
  return JSON.stringify(value).toLowerCase()
}

function tokenize(text: string): Set<string> {
  return new Set(text.match(/\w+/g) ?? [])
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1

  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection++
  }

  const union = a.size + b.size - intersection
  return union === 0 ? 1 : intersection / union
}
