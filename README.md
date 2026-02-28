# agent-arena

> Benchmark LLM **providers** on real **agent tasks** - Vitest, but for agents.

`agent-arena` is a TypeScript-first framework to pit multiple LLM providers against each other on the same tasks and get structured, reproducible results: correctness, latency, tokens, and cost.

- Compare OpenAI, Azure OpenAI, Anthropic, Gemini, OpenRouter, and OpenAI-compatible gateways.
- Define tasks once, run them against many providers.
- Get CLI tables and JSON results you can feed into dashboards, CI, or docs.

---

## Why agent-arena?

- **Provider-agnostic**: One config, many providers. Swap models and gateways without rewriting your tasks.
- **Agent-focused**: Designed for agent workflows and tool use, not just single-turn prompts.
- **Realistic metrics**: Latency, token counts, and cost estimates based on a pricing catalog.
- **TypeScript-native DX**: Strongly typed APIs, Zod schemas for structured outputs, and a simple `defineArena()` entrypoint.
- **CLI-first**: `npx agent-arena init` → `npx agent-arena run` gets you from zero to useful table in minutes.

---

## Installation

```bash
npm install agent-arena
# or
pnpm add agent-arena
# or
yarn add agent-arena
```

You'll also need API keys for the providers you want to benchmark, for example:

```bash
export OPENAI_API_KEY=sk-...
export AZURE_OPENAI_API_KEY=...
export ANTHROPIC_API_KEY=...
```

---

## One-minute quickstart

Initialize a config:

```bash
npx agent-arena init
```

This creates `arena.config.ts` in your project. A minimal example:

```ts
// arena.config.ts
import { defineArena, openai, azureOpenai } from 'agent-arena'
import { z } from 'zod'

export default defineArena({
  providers: [
    openai('gpt-4o'),
    azureOpenai('gpt-4o', { deployment: 'my-azure-deployment' }),
  ],
  tasks: [
    {
      name: 'simple-qa',
      prompt: 'In one sentence, explain what a monorepo is.',
      expected:
        'A monorepo is a single repository that contains code for multiple projects.',
    },
    {
      name: 'structured-extraction',
      prompt: 'Extract the company name and year from: "Acme was founded in 2024."',
      expected: { company: 'Acme', year: 2024 },
      schema: z.object({
        company: z.string(),
        year: z.number(),
      }),
    },
  ],
  scorers: ['latency', 'cost', 'correctness'],
  runs: 1,
})
```

Run the benchmark:

```bash
npx agent-arena run
```

You'll see a matrix like:

- Rows: tasks (`simple-qa`, `structured-extraction`)
- Columns: providers (`openai/gpt-4o`, `azure/gpt-4o`)
- Cells: correctness score, latency, tokens, and estimated cost.

For CI or further processing:

```bash
npx agent-arena run --reporter json > results.json
```

---

## Core concepts

### Providers

Providers are **factory functions** that return plain objects implementing a shared `ArenaProvider` interface.

This lets you:

- Swap providers without changing tasks.
- Wrap or extend providers in your own code.
- Mock providers in tests.

Examples:

```ts
import {
  openai,
  azureOpenai,
  openaiCompatible,
  type ArenaProvider,
} from 'agent-arena'

const oai = openai('gpt-4o')

const azure = azureOpenai('gpt-4o', {
  deployment: 'my-deployment',
})

const local: ArenaProvider = openaiCompatible({
  id: 'local/gpt-4o-like',
  name: 'Local Gateway',
  baseURL: 'http://localhost:11434/v1',
  model: 'gpt-4o',
  apiKeyEnv: 'LOCAL_LLM_API_KEY',
})
```

At minimum, a provider implements:

```ts
interface ArenaProvider {
  id: string        // e.g. 'openai/gpt-4o'
  name: string      // e.g. 'OpenAI'
  model: string
  run(input: TaskInput): Promise<TaskResult>
}
```

---

### Tasks

Tasks describe what you want the model to do:

```ts
interface ArenaTask {
  name: string
  prompt: string
  expected?: unknown         // used by correctness scorers
  schema?: ZodSchema<any>    // used by schema-based scorers
}
```

Examples:

```ts
const tasks: ArenaTask[] = [
  {
    name: 'classify-sentiment',
    prompt: 'Classify the sentiment of: "I love this product".',
    expected: 'positive',
  },
  {
    name: 'extract-structured-data',
    prompt: 'Extract { company, year } from: "Acme was founded in 2024."',
    expected: { company: 'Acme', year: 2024 },
    schema: z.object({
      company: z.string(),
      year: z.number(),
    }),
  },
]
```

---

### Scorers

Scorers take raw model outputs and turn them into **numeric scores** with optional details. Built-in scorers include:

- `latency`
  - Measures wall-clock latency in milliseconds.
- `cost`
  - Uses token usage from the provider and a **pricing catalog** to estimate USD cost based on per-token prices.
  - Still shows raw token counts even when the model is unknown to the catalog.
- `correctness`
  - Compares the output to `expected`.
  - Starts simple (exact/strict comparison) and is designed to grow into:
    - LLM-as-judge scoring.
    - Schema-based correctness via Zod.
    - Fuzzy similarity scorers.

Configure them in your arena:

```ts
scorers: ['latency', 'cost', 'correctness']
```

You can also add custom scorers for domain-specific metrics (e.g. tool-call correctness, safety, style).

---

## Cost & pricing

Cost estimation is intentionally transparent and conservative:

1. **Token counts**  
   Providers return token usage (prompt and completion tokens) in each `TaskResult`. These are treated as the source of truth.

2. **Pricing catalog**  
   `agent-arena` ships with a **locally bundled catalog** of per-token prices for many models, derived from OpenRouter's public pricing pages.

   - The catalog maps `(provider, model)` → `{ inputPerM, outputPerM }` in USD per 1M tokens.
   - Azure OpenAI models are resolved back to their base OpenAI models where possible (e.g. `azure/gpt-4o` → `openai/gpt-4o`) so you don't need to configure Azure pricing manually.

3. **Estimated USD**  
   The `cost` scorer computes:

   ```text
   estimatedUsd = (promptTokens * inputPerM + completionTokens * outputPerM) / 1_000_000
   ```

   In the console reporter, you'll see:

   - token counts: `prompt: X, completion: Y`
   - cost: `~$0.0XXm` (millicents; fractions of a cent)
   - a short disclaimer that this is an **estimate** based on a pricing snapshot.

4. **Unknown models**  
   If a model is not in the catalog:

   - Tokens are still reported.
   - Cost is marked as unknown (no fake numbers).

You can update the catalog with a script that re-scrapes OpenRouter's public pricing page when prices change.

---

## CLI usage

Basic commands:

```bash
# Scaffold a new config
npx agent-arena init

# Run with the default config (arena.config.ts)
npx agent-arena run

# Use a custom config
npx agent-arena run --config path/to/arena.config.ts

# Get JSON instead of a table
npx agent-arena run --reporter json
```

Options (subject to change as the project evolves):

- `--config` — path to a config file (TypeScript).
- `--reporter` — `console` (default) or `json`.

The CLI loads TypeScript configs directly using a lightweight runtime loader so users don't need to precompile their config.

---

## Example: multi-provider benchmark

Here's a richer example comparing multiple providers on a couple of tasks:

```ts
// arena.config.ts
import {
  defineArena,
  openai,
  azureOpenai,
  openaiCompatible,
} from 'agent-arena'
import { z } from 'zod'

export default defineArena({
  providers: [
    openai('gpt-4o'),
    azureOpenai('gpt-4o', { deployment: 'prod-chat' }),
    openaiCompatible({
      id: 'local/gpt-4o-like',
      name: 'Local Gateway',
      baseURL: 'http://localhost:11434/v1',
      model: 'gpt-4o',
      apiKeyEnv: 'LOCAL_LLM_API_KEY',
    }),
  ],
  tasks: [
    {
      name: 'support-answer',
      prompt:
        'Customer asks: "What if my shoes do not fit?" Answer using our refund policy.',
      expected:
        'We offer a 30-day full refund at no extra costs if your shoes do not fit.',
    },
    {
      name: 'order-json',
      prompt: 'Turn "Order 3 red t-shirts, size M" into JSON.',
      expected: { item: 't-shirt', color: 'red', size: 'M', quantity: 3 },
      schema: z.object({
        item: z.string(),
        color: z.string(),
        size: z.string(),
        quantity: z.number(),
      }),
    },
  ],
  scorers: ['latency', 'cost', 'correctness'],
  runs: 3, // run multiple times for more stable numbers
})
```

Then:

```bash
npx agent-arena run
```

---

## Roadmap

Planned directions (subject to community feedback):

- **More providers**
  - Anthropic, Gemini, OpenRouter-native, and more OpenAI-compatible gateways.
- **Richer correctness**
  - LLM-as-judge scorer.
  - Schema-based correctness (Zod-powered).
  - Fuzzy similarity and embedding-based scorers.
- **Better reporting**
  - Markdown/HTML/CSV reports.
  - GitHub Actions summaries.
- **Agent workflows**
  - Multi-step tasks, tool-use evaluation, and agent traces.
- **Plugin system**
  - First-class support for user-defined providers and scorers.

If you have a specific use case (framework comparisons, multi-agent competitions, tool-calling benchmarks), please open an issue — those will shape what gets built first.

---

## Contributing

Contributions, issues, and feature requests are welcome.

- **Bug reports / ideas**: open a GitHub issue.
- **Code changes**:
  - Fork the repo.
  - Create a branch.
  - Run tests: `npm test`.
  - Run build: `npm run build`.
  - Open a PR with a clear description and, if possible, a small repro.

Please try to keep PRs narrowly focused (single provider, one new scorer, etc.) so they're easy to review.

---

## License

MIT.