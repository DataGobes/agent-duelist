import { describe, it, expect } from 'vitest'
import { loadPack, listPacks } from './index.js'
import type { BuiltInScorerName } from '../scorers/types.js'

const VALID_SCORERS: BuiltInScorerName[] = [
  'latency', 'cost', 'correctness', 'schema-correctness',
  'fuzzy-similarity', 'llm-judge-correctness', 'tool-usage',
]

const ALL_PACK_NAMES = ['structured-output', 'tool-calling', 'reasoning']

describe('loadPack', () => {
  it('returns a valid TaskPack for structured-output', () => {
    const pack = loadPack('structured-output')
    expect(pack.name).toBe('structured-output')
    expect(pack.label).toBe('Structured Output')
    expect(pack.tasks).toHaveLength(6)
    expect(pack.scorers.length).toBeGreaterThan(0)
  })

  it('returns a valid TaskPack for tool-calling', () => {
    const pack = loadPack('tool-calling')
    expect(pack.name).toBe('tool-calling')
    expect(pack.label).toBe('Tool Calling')
    expect(pack.tasks).toHaveLength(4)
    expect(pack.scorers).toContain('tool-usage')
  })

  it('returns a valid TaskPack for reasoning', () => {
    const pack = loadPack('reasoning')
    expect(pack.name).toBe('reasoning')
    expect(pack.label).toBe('Reasoning')
    expect(pack.tasks).toHaveLength(5)
    expect(pack.scorers).toContain('correctness')
  })

  it('throws for a nonexistent pack with available names listed', () => {
    expect(() => loadPack('nonexistent')).toThrow(/Unknown pack "nonexistent"/)
    expect(() => loadPack('nonexistent')).toThrow(/structured-output/)
  })

  it('each pack has unique task names within itself', () => {
    for (const name of ALL_PACK_NAMES) {
      const pack = loadPack(name)
      const names = pack.tasks.map((t) => t.name)
      expect(new Set(names).size, `duplicate task names in ${name}`).toBe(names.length)
    }
  })

  it('each pack has valid scorer names', () => {
    for (const name of ALL_PACK_NAMES) {
      const pack = loadPack(name)
      for (const scorer of pack.scorers) {
        expect(VALID_SCORERS, `invalid scorer "${scorer}" in ${name}`).toContain(scorer)
      }
    }
  })

  it('all task names are globally unique across all packs', () => {
    const allNames: string[] = []
    for (const name of ALL_PACK_NAMES) {
      const pack = loadPack(name)
      allNames.push(...pack.tasks.map(t => t.name))
    }
    expect(new Set(allNames).size).toBe(allNames.length)
  })

  it('all pack names are unique', () => {
    const packs = listPacks()
    const names = packs.map(p => p.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('listPacks', () => {
  it('returns all 3 registered packs', () => {
    const packs = listPacks()
    expect(packs).toHaveLength(3)
    const names = packs.map(p => p.name)
    expect(names).toContain('structured-output')
    expect(names).toContain('tool-calling')
    expect(names).toContain('reasoning')
  })

  it('returns correct task counts', () => {
    const packs = listPacks()
    expect(packs.find(p => p.name === 'structured-output')!.taskCount).toBe(6)
    expect(packs.find(p => p.name === 'tool-calling')!.taskCount).toBe(4)
    expect(packs.find(p => p.name === 'reasoning')!.taskCount).toBe(5)
  })

  it('returns label and description for each pack', () => {
    const packs = listPacks()
    for (const p of packs) {
      expect(p.label).toBeTruthy()
      expect(p.description).toBeTruthy()
    }
  })
})
