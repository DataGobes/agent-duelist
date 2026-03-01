import 'dotenv/config'
import { Command } from 'commander'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import type { BenchmarkResult } from './runner.js'
import type { ScoreResult } from './scorers/types.js'
import type { CiOptions } from './ci.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const program = new Command()

program
  .name('duelist')
  .description('Pit LLM providers against each other on agent tasks.')
  .version(getVersion())

program
  .command('init')
  .description('Scaffold an arena.config.ts in the current directory')
  .option('--force', 'Overwrite existing config file')
  .action((opts: { force?: boolean }) => {
    const target = resolve('arena.config.ts')

    if (existsSync(target) && !opts.force) {
      console.error('arena.config.ts already exists. Use --force to overwrite.')
      process.exit(1)
    }

    // Try to read from the bundled templates directory first,
    // fall back to an inline template
    const templatePath = join(__dirname, '..', 'templates', 'arena.config.ts')
    let template: string

    if (existsSync(templatePath)) {
      template = readFileSync(templatePath, 'utf-8')
    } else {
      template = DEFAULT_TEMPLATE
    }

    writeFileSync(target, template)
    console.log(existsSync(target) && opts.force ? 'Overwrote arena.config.ts' : 'Created arena.config.ts')
    console.log('')
    console.log('Next steps:')
    console.log('  1. export OPENAI_API_KEY=sk-...')
    console.log('  2. npx duelist run')
  })

program
  .command('run')
  .description('Run benchmarks defined in your arena config')
  .option('-c, --config <path>', 'Path to config file', 'arena.config.ts')
  .option('--reporter <type>', 'Output format: console or json', 'console')
  .option('-q, --quiet', 'Suppress per-result progress (show only final report)')
  .action(async (opts: { config: string; reporter: string; quiet?: boolean }) => {
    if (!['console', 'json'].includes(opts.reporter)) {
      console.error(`Unknown reporter "${opts.reporter}". Use "console" or "json".`)
      process.exit(1)
    }

    const typedArena = await loadArenaConfig(opts.config)

    try {
      // Live progress: show per-result lines unless --quiet or json
      const showProgress = opts.reporter === 'console' && !opts.quiet
      const onResult = showProgress ? logResult : undefined

      const results = await typedArena.run({ onResult })

      const { consoleReporter } = await import('./reporter/console.js')
      const { jsonReporter } = await import('./reporter/json.js')

      if (opts.reporter === 'json') {
        console.log(jsonReporter(results))
      } else {
        console.log('')
        consoleReporter(results, { sparklines: typedArena.config?.sparklines })
      }

      // Exit with non-zero if every single result errored
      const allFailed = results.length > 0 && results.every((r) => r.error)
      if (allFailed) process.exit(1)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`Benchmark failed: ${message}`)
      process.exit(1)
    }
  })

// ── CI command ───────────────────────────────────────────────────────

function collectThreshold(value: string, previous: Map<string, number>): Map<string, number> {
  const [scorer, delta] = value.split('=')
  if (!scorer || delta === undefined || isNaN(Number(delta))) {
    console.error(`Invalid threshold format: "${value}". Expected scorer=delta (e.g., correctness=0.1)`)
    process.exit(1)
  }
  previous.set(scorer, Number(delta))
  return previous
}

program
  .command('ci')
  .description('Run benchmarks, compare against baseline, and enforce quality gates')
  .option('-c, --config <path>', 'Path to config file', 'arena.config.ts')
  .option('--baseline <path>', 'Baseline JSON file', '.duelist/baseline.json')
  .option('--budget <dollars>', 'Max total cost in USD', parseFloat)
  .option('--threshold <scorer=delta>', 'Regression threshold (repeatable)', collectThreshold, new Map<string, number>())
  .option('--update-baseline', 'Save results as new baseline after passing')
  .option('--comment', 'Post results as GitHub PR comment')
  .option('-q, --quiet', 'Suppress per-result progress')
  .action(async (opts: {
    config: string
    baseline: string
    budget?: number
    threshold: Map<string, number>
    updateBaseline?: boolean
    comment?: boolean
    quiet?: boolean
  }) => {
    const ciOpts: CiOptions = {
      configPath: opts.config,
      baselinePath: resolve(opts.baseline),
      budget: opts.budget,
      thresholds: opts.threshold,
      updateBaseline: opts.updateBaseline ?? false,
      comment: opts.comment ?? false,
      quiet: opts.quiet ?? false,
    }

    const typedArena = await loadArenaConfig(ciOpts.configPath)

    // 1. Run benchmarks
    console.log('Running benchmarks...')
    const onResult = ciOpts.quiet ? undefined : logResult
    let results: BenchmarkResult[]
    try {
      results = await typedArena.run({ onResult })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`Benchmark failed: ${message}`)
      process.exit(1)
    }

    // 2. Load baseline (if exists)
    const { loadBaseline, saveBaseline, computeStats, compareResults } = await import('./ci.js')
    const baseline = loadBaseline(ciOpts.baselinePath)
    const baselineStats = baseline ? computeStats(baseline.results) : null

    if (baseline) {
      console.log(`Loaded baseline from ${ciOpts.baselinePath} (${baseline.timestamp})`)
    } else {
      console.log('No baseline found — this run establishes the first baseline.')
    }

    // 3. Compare
    const currentStats = computeStats(results)
    const report = compareResults(baselineStats, currentStats, ciOpts.thresholds, ciOpts.budget, results)

    // 4. Console output
    const { consoleReporter } = await import('./reporter/console.js')
    console.log('')
    consoleReporter(results, { sparklines: typedArena.config?.sparklines })

    // Print CI verdict
    const { markdownReporter, COMMENT_MARKER } = await import('./reporter/markdown.js')
    if (report.flakyResults.length > 0) {
      console.log(`⚠  ${report.flakyResults.length} flaky result(s) detected (high variance)`)
    }
    if (report.cost.overBudget) {
      console.log(`🔴 Budget exceeded: $${report.cost.totalUsd.toFixed(4)} > $${report.cost.budget!.toFixed(2)}`)
    }
    for (const reason of report.failureReasons) {
      console.log(`🔴 ${reason}`)
    }
    if (!report.failed) {
      console.log('🟢 CI passed')
    }

    // 5. Post PR comment if requested
    if (ciOpts.comment) {
      const { detectGitHubContext, upsertPrComment } = await import('./github.js')
      const ghCtx = detectGitHubContext()
      if (ghCtx) {
        const markdown = markdownReporter(report, results)
        try {
          await upsertPrComment(ghCtx, markdown, COMMENT_MARKER)
          console.log('Posted results to PR comment.')
        } catch (err) {
          console.warn(`Failed to post PR comment: ${err instanceof Error ? err.message : err}`)
        }
      } else {
        console.warn('--comment: not in a GitHub Actions PR context, skipping.')
      }
    }

    // 6. Update baseline if passing and requested
    if (ciOpts.updateBaseline && !report.failed) {
      saveBaseline(ciOpts.baselinePath, results)
      console.log(`Baseline saved to ${ciOpts.baselinePath}`)
    } else if (ciOpts.updateBaseline && report.failed) {
      console.log('Baseline not updated (CI failed).')
    }

    // 7. Exit code
    process.exit(report.failed ? 1 : 0)
  })

program.parse()

type ArenaRunner = {
  config?: { sparklines?: boolean }
  run: (opts?: { onResult?: (r: BenchmarkResult) => void }) => Promise<BenchmarkResult[]>
}

async function loadArenaConfig(configOpt: string): Promise<ArenaRunner> {
  const configPath = resolve(configOpt)

  if (!existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`)
    console.error('')
    console.error('Create one with: npx duelist init')
    process.exit(1)
  }

  let mod: Record<string, unknown>
  try {
    if (configPath.endsWith('.ts')) {
      mod = await importTypeScript(configPath)
    } else {
      mod = (await import(pathToFileURL(configPath).href)) as Record<string, unknown>
    }
  } catch (err) {
    console.error(`Failed to load config: ${configPath}`)
    console.error('')
    if (err instanceof SyntaxError) {
      console.error(`Syntax error: ${err.message}`)
    } else {
      console.error(err instanceof Error ? err.message : String(err))
    }
    process.exit(1)
  }

  const arena = mod.default ?? mod.arena
  if (!arena || typeof arena !== 'object' || !('run' in arena)) {
    console.error('Config must export a default arena created with defineArena().')
    console.error(`Loaded from: ${configPath}`)
    process.exit(1)
  }

  return arena as ArenaRunner
}

function logResult(result: BenchmarkResult): void {
  if (result.error) {
    console.log(`  ${result.providerId} × ${result.taskName}: ERROR ${result.error}`)
  } else {
    const scores = result.scores.map((s) => `${s.name}=${formatScoreForLog(s)}`).join(' ')
    console.log(`  ${result.providerId} × ${result.taskName}: ${scores}`)
  }
}

async function importTypeScript(filePath: string): Promise<Record<string, unknown>> {
  try {
    await import('tsx/esm/api')
  } catch {
    // tsx not available — ignore
  }

  try {
    const url = pathToFileURL(filePath).href
    return (await import(url)) as Record<string, unknown>
  } catch (err) {
    console.error(
      'Cannot import .ts config directly. Install tsx as a dev dependency:\n' +
      '  npm install -D tsx\n' +
      'Or rename your config to arena.config.js\n'
    )
    console.error('Underlying error:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

function formatScoreForLog(s: ScoreResult): string {
  const details = s.details as Record<string, unknown> | undefined
  if (s.name === 'latency' && details?.ms != null) {
    return `${Math.round(details.ms as number)}ms`
  }
  if (s.name === 'cost' && details?.estimatedUsd != null) {
    const usd = details.estimatedUsd as number
    if (usd === 0) return '$0.00'
    if (usd >= 0.01) return `~$${usd.toFixed(2)}`
    const digits = Math.max(4, -Math.floor(Math.log10(usd)) + 1)
    return `~$${usd.toFixed(digits).replace(/0+$/, '')}`
  }
  return String(s.value)
}

function getVersion(): string {
  try {
    const pkg = readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
    return JSON.parse(pkg).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const DEFAULT_TEMPLATE = `// ─── Agent Duelist Config ─────────────────────────────────────────────
//
// Set your API key before running:
//   export OPENAI_API_KEY=sk-...
//
// Then run:
//   npx duelist run
//
// Docs: https://github.com/DataGobes/agent-duelist
// ─────────────────────────────────────────────────────────────────────

import { defineArena, openai } from 'agent-duelist'
import { z } from 'zod'

export default defineArena({
  providers: [
    openai('gpt-5-mini'),
    // Add more providers to compare:
    // openai('gpt-5.2'),
    // azureOpenai('gpt-5-mini'),
    // anthropic('claude-sonnet-4.6'),
    // gemini('gemini-3-flash-preview'),
  ],

  tasks: [
    {
      name: 'extract-company',
      prompt:
        'Extract the company name and role as JSON: "I work at Acme Corp as a senior engineer." Return {"company": "...", "role": "..."}',
      expected: { company: 'Acme Corp', role: 'senior engineer' },
      schema: z.object({ company: z.string(), role: z.string() }),
    },
    {
      name: 'classify-sentiment',
      prompt:
        'Classify the sentiment as "positive", "negative", or "neutral". Return only the word.\\n\\nReview: "The product arrived on time and works exactly as described. Very happy!"',
      expected: 'positive',
    },
    {
      name: 'summarize',
      prompt:
        'Summarize in one sentence: The quick brown fox jumps over the lazy dog. This pangram contains every letter of the English alphabet and has been used since the late 1800s.',
    },
  ],

  scorers: ['latency', 'cost', 'correctness'],
  runs: 1,
})
`
