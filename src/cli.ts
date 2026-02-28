import 'dotenv/config'
import { Command } from 'commander'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import type { BenchmarkResult } from './runner.js'
import type { ScoreResult } from './scorers/types.js'

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
    const configPath = resolve(opts.config)

    if (!existsSync(configPath)) {
      console.error(`Config not found: ${configPath}`)
      console.error('')
      console.error('Create one with: npx duelist init')
      process.exit(1)
    }

    if (!['console', 'json'].includes(opts.reporter)) {
      console.error(`Unknown reporter "${opts.reporter}". Use "console" or "json".`)
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

    try {
      const typedArena = arena as { run: (opts?: { onResult?: (r: BenchmarkResult) => void }) => Promise<BenchmarkResult[]> }

      // Live progress: show per-result lines unless --quiet or json
      const showProgress = opts.reporter === 'console' && !opts.quiet
      const onResult = showProgress
        ? (result: BenchmarkResult) => {
            if (result.error) {
              console.log(`  ${result.providerId} × ${result.taskName}: ERROR ${result.error}`)
            } else {
              const scores = result.scores.map((s) => `${s.name}=${formatScoreForLog(s)}`).join(' ')
              console.log(`  ${result.providerId} × ${result.taskName}: ${scores}`)
            }
          }
        : undefined

      const results = await typedArena.run({ onResult })

      const { consoleReporter } = await import('./reporter/console.js')
      const { jsonReporter } = await import('./reporter/json.js')

      if (opts.reporter === 'json') {
        console.log(jsonReporter(results))
      } else {
        console.log('')
        consoleReporter(results)
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

program.parse()

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
    openai('gpt-4o-mini'),
    // Add more providers to compare:
    // openai('gpt-4o'),
    // azureOpenai('gpt-4o-mini'),
    // anthropic('claude-sonnet-4-20250514'),
    // gemini('gemini-2.5-flash'),
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
