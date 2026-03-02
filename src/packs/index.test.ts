import { describe, it, expect } from 'vitest'
import { loadPack, listPacks } from './index.js'
import type { BuiltInScorerName } from '../scorers/types.js'

const VALID_SCORERS: BuiltInScorerName[] = [
  'latency', 'cost', 'correctness', 'schema-correctness',
  'fuzzy-similarity', 'llm-judge-correctness', 'tool-usage',
]

describe('loadPack', () => {
  it('returns a valid TaskPack for structured-output', () => {
    const pack = loadPack('structured-output')
    expect(pack.name).toBe('structured-output')
    expect(pack.label).toBe('Structured Output')
    expect(pack.tasks).toHaveLength(6)
    expect(pack.scorers.length).toBeGreaterThan(0)
  })

  it('throws for a nonexistent pack with available names listed', () => {
    expect(() => loadPack('nonexistent')).toThrow(/Unknown pack "nonexistent"/)
    expect(() => loadPack('nonexistent')).toThrow(/structured-output/)
  })

  it('each pack has unique task names', () => {
    const pack = loadPack('structured-output')
    const names = pack.tasks.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('each pack has valid scorer names', () => {
    const pack = loadPack('structured-output')
    for (const scorer of pack.scorers) {
      expect(VALID_SCORERS).toContain(scorer)
    }
  })
})

describe('listPacks', () => {
  it('returns array with at least structured-output entry', () => {
    const packs = listPacks()
    expect(packs.length).toBeGreaterThanOrEqual(1)
    const so = packs.find((p) => p.name === 'structured-output')
    expect(so).toBeDefined()
    expect(so!.taskCount).toBe(6)
  })

  it('returns label and description for each pack', () => {
    const packs = listPacks()
    for (const p of packs) {
      expect(p.label).toBeTruthy()
      expect(p.description).toBeTruthy()
    }
  })
})
