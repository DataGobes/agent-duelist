import { describe, it, expect } from 'vitest'
import { htmlReporter } from './html.js'
import type { BenchmarkResult } from '../runner.js'

// ── Helpers ──────────────────────────────────────────────────────────

function makeResult(overrides: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    providerId: 'openai/gpt-4o',
    taskName: 'extract-company',
    run: 1,
    scores: [
      { name: 'correctness', value: 0.95, details: {} },
      { name: 'latency', value: 0.8, details: { ms: 420 } },
      { name: 'cost', value: 0.7, details: { estimatedUsd: 0.0012, totalTokens: 150 } },
    ],
    raw: {
      output: { company: 'Acme' },
      latencyMs: 420,
      usage: { promptTokens: 100, completionTokens: 50 },
    },
    ...overrides,
  }
}

function makeMultiProviderResults(): BenchmarkResult[] {
  return [
    makeResult({ providerId: 'openai/gpt-4o' }),
    makeResult({
      providerId: 'anthropic/claude-sonnet',
      scores: [
        { name: 'correctness', value: 1.0, details: {} },
        { name: 'latency', value: 0.6, details: { ms: 650 } },
        { name: 'cost', value: 0.9, details: { estimatedUsd: 0.0008, totalTokens: 120 } },
      ],
      raw: { output: { company: 'Acme' }, latencyMs: 650, usage: { promptTokens: 80, completionTokens: 40 } },
    }),
  ]
}

function makeMultiTaskResults(): BenchmarkResult[] {
  return [
    makeResult({ taskName: 'extract-company' }),
    makeResult({ taskName: 'classify-sentiment', scores: [{ name: 'correctness', value: 0.8, details: {} }] }),
  ]
}

function makeErrorResult(overrides: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    providerId: 'openai/gpt-4o',
    taskName: 'extract-company',
    run: 1,
    scores: [],
    error: 'API key invalid',
    raw: { output: '', latencyMs: 0 },
    ...overrides,
  }
}

// ── Basic structure ──────────────────────────────────────────────────

describe('htmlReporter', () => {
  it('returns valid HTML document with doctype, head, body', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('<html')
    expect(html).toContain('<head>')
    expect(html).toContain('<body>')
    expect(html).toContain('</html>')
  })

  it('contains GitHub attribution link', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('https://github.com/DataGobes/agent-duelist')
    expect(html).toContain('Agent Duelist')
    expect(html).toContain('Star on GitHub')
  })

  it('renders Powered by footer', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('Powered by')
  })

  // ── Provider/task rendering ────────────────────────────────────────

  it('renders provider names', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('openai/gpt-4o')
  })

  it('renders task names', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('extract-company')
  })

  it('renders score percentages', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('95%') // correctness 0.95
  })

  it('renders cost formatting', () => {
    const html = htmlReporter([makeResult()])
    // formatCost(0.0012) → "~$0.0012"
    expect(html).toContain('$0.0012')
  })

  it('renders latency in ms', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('420ms')
  })

  it('renders token counts', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('150') // totalTokens
  })

  // ── Medals and comparison ──────────────────────────────────────────

  it('renders medals for multi-provider comparisons', () => {
    const html = htmlReporter(makeMultiProviderResults())
    // At least one medal emoji should be present
    expect(html).toMatch(/🥇|🥈|🥉/)
  })

  it('does not render medals for single provider', () => {
    const html = htmlReporter([makeResult()])
    expect(html).not.toContain('🥇')
    expect(html).not.toContain('🥈')
    expect(html).not.toContain('🥉')
  })

  it('renders winner banner for multi-provider', () => {
    const html = htmlReporter(makeMultiProviderResults())
    expect(html).toContain('Winner:')
    expect(html).toContain('task-winner')
  })

  // ── Tab navigation ─────────────────────────────────────────────────

  it('renders tab navigation for multiple tasks', () => {
    const html = htmlReporter(makeMultiTaskResults())
    expect(html).toContain('task-tabs')
    expect(html).toContain('task-tab')
    expect(html).toContain('extract-company')
    expect(html).toContain('classify-sentiment')
  })

  it('does not render tabs for single task', () => {
    const html = htmlReporter([makeResult()])
    expect(html).not.toContain('<nav class="task-tabs">')
  })

  // ── Error section ──────────────────────────────────────────────────

  it('renders error section when errors present', () => {
    const results = [makeResult(), makeErrorResult()]
    const html = htmlReporter(results)
    expect(html).toContain('errors-section')
    expect(html).toContain('API key invalid')
  })

  it('does not render error section when no errors', () => {
    const html = htmlReporter([makeResult()])
    expect(html).not.toContain('<section class="errors-section">')
  })

  it('deduplicates identical errors with count', () => {
    const results = [
      makeErrorResult(),
      makeErrorResult(),
      makeErrorResult(),
    ]
    const html = htmlReporter(results)
    expect(html).toContain('&times;3')
  })

  it('shows API key hint for auth errors', () => {
    const results = [makeErrorResult({ error: 'Unauthorized: invalid API key' })]
    const html = htmlReporter(results)
    expect(html).toContain('OPENAI_API_KEY')
  })

  // ── OG meta tags ───────────────────────────────────────────────────

  it('includes OG meta tags for social sharing', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('og:title')
    expect(html).toContain('og:description')
    expect(html).toContain('og:type')
  })

  // ── XSS prevention ────────────────────────────────────────────────

  it('HTML-escapes provider names to prevent XSS', () => {
    const result = makeResult({ providerId: '<script>alert("xss")</script>' })
    const html = htmlReporter([result])
    expect(html).not.toContain('<script>alert("xss")</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('HTML-escapes task names to prevent XSS', () => {
    const result = makeResult({ taskName: '"><img src=x onerror=alert(1)>' })
    const html = htmlReporter([result])
    expect(html).not.toContain('"><img src=x')
    expect(html).toContain('&quot;&gt;&lt;img')
  })

  it('HTML-escapes error messages', () => {
    const result = makeErrorResult({ error: '<b>bold</b> & "quoted"' })
    const html = htmlReporter([result])
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
    expect(html).toContain('&amp;')
  })

  // ── Empty results ──────────────────────────────────────────────────

  it('handles empty results gracefully', () => {
    const html = htmlReporter([])
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('No results to display')
    expect(html).toContain('Agent Duelist')
  })

  // ── Summary section ────────────────────────────────────────────────

  it('renders summary cards', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('summary-section')
    expect(html).toContain('Summary')
  })

  it('renders overall winner card for multi-provider', () => {
    const html = htmlReporter(makeMultiProviderResults())
    expect(html).toContain('Overall Winner')
  })

  // ── Sortable columns ──────────────────────────────────────────────

  it('includes sorting JavaScript', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('sort-arrow')
    expect(html).toContain('data-sort-val')
  })

  // ── Self-contained ─────────────────────────────────────────────────

  it('is self-contained with inline CSS and JS', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('<style>')
    expect(html).toContain('<script>')
    // No external stylesheet or script references
    expect(html).not.toContain('rel="stylesheet"')
    expect(html).not.toMatch(/src=["'][^"']*\.js["']/)
  })

  // ── Design tokens ──────────────────────────────────────────────────

  it('uses the design system color variables', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('--bg: #0f172a')
    expect(html).toContain('--accent: #f59e0b')
    expect(html).toContain('--green: #22c55e')
    expect(html).toContain('--red: #ef4444')
  })

  it('includes animated mesh gradient background', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('bg-mesh')
    expect(html).toContain('meshDrift1')
  })

  // ── Score bar rendering ────────────────────────────────────────────

  it('renders CSS progress bars for score values', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('score-bar')
    expect(html).toContain('score-val')
  })

  // ── Responsive ─────────────────────────────────────────────────────

  it('includes responsive media queries', () => {
    const html = htmlReporter([makeResult()])
    expect(html).toContain('@media')
    expect(html).toContain('max-width')
  })
})
