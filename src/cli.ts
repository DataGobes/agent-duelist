import { Command } from 'commander'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const program = new Command()

program
  .name('agent-arena')
  .description('Benchmark LLM providers on agent tasks')
  .version(getVersion())

program
  .command('init')
  .description('Create an arena.config.ts in the current directory')
  .action(() => {
    const target = resolve('arena.config.ts')

    if (existsSync(target)) {
      console.error('arena.config.ts already exists in this directory.')
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
    console.log('Created arena.config.ts')
    console.log('')
    console.log('Next steps:')
    console.log('  1. Set your OPENAI_API_KEY environment variable')
    console.log('  2. Run: npx agent-arena run')
  })

program
  .command('run')
  .description('Run the arena benchmarks')
  .option('-c, --config <path>', 'Path to config file', 'arena.config.ts')
  .option('--json', 'Output results as JSON')
  .action(async (opts: { config: string; json?: boolean }) => {
    const configPath = resolve(opts.config)

    if (!existsSync(configPath)) {
      console.error(`Config file not found: ${configPath}`)
      console.error('Run "agent-arena init" to create one.')
      process.exit(1)
    }

    try {
      // Use tsx or ts-node to handle .ts configs, or native import for .js
      const configUrl = pathToFileURL(configPath).href
      let mod: Record<string, unknown>

      if (configPath.endsWith('.ts')) {
        // Try to load via tsx/ts-node register hook, or compile on the fly
        mod = await importTypeScript(configPath)
      } else {
        mod = (await import(configUrl)) as Record<string, unknown>
      }

      const arena = mod.default ?? mod.arena
      if (!arena || typeof arena !== 'object' || !('run' in arena)) {
        console.error('Config must export a default arena (created via defineArena())')
        process.exit(1)
      }

      const { jsonReporter } = await import('./reporter/json.js')
      const results = await (arena as { run: () => Promise<unknown[]> }).run()

      if (opts.json) {
        console.log(jsonReporter(results as never))
      }
    } catch (err) {
      console.error('Failed to run benchmarks:')
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program.parse()

async function importTypeScript(filePath: string): Promise<Record<string, unknown>> {
  // Strategy: use Node's --import with tsx if available, otherwise use jiti
  try {
    // Attempt tsx register (works if tsx is installed)
    // @ts-expect-error tsx may not be installed
    await import('tsx/esm/api')
  } catch {
    // tsx not available — ignore
  }

  try {
    // Try dynamic import with tsx loaded
    const url = pathToFileURL(filePath).href
    return (await import(url)) as Record<string, unknown>
  } catch {
    // Fall back: read the file as text, do a minimal transpile
    // For v0.1, require the user to have tsx installed or use a .js config
    console.error(
      'Cannot import .ts config directly. Install tsx as a dev dependency:\n' +
      '  npm install -D tsx\n' +
      'Or rename your config to arena.config.js'
    )
    process.exit(1)
  }
}

function getVersion(): string {
  try {
    const pkg = readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
    return JSON.parse(pkg).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const DEFAULT_TEMPLATE = `import { defineArena, openai } from 'agent-arena'
import { z } from 'zod'

export default defineArena({
  providers: [
    openai('gpt-4o-mini'),
    // Add more providers:
    // openai('gpt-4o'),
    // anthropic('claude-3-5-sonnet'),  // coming soon
  ],

  tasks: [
    {
      name: 'extract-company',
      prompt: 'Extract the company name from this text: "I work at Acme Corp as a senior engineer."',
      expected: { company: 'Acme Corp' },
      schema: z.object({ company: z.string() }),
    },
    {
      name: 'summarize',
      prompt: 'Summarize in one sentence: The quick brown fox jumps over the lazy dog. This sentence contains every letter of the English alphabet.',
      expected: undefined, // No expected output — just benchmark latency and cost
    },
  ],

  scorers: ['latency', 'cost', 'correctness'],
  runs: 1,
})
`
