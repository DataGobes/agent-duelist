# agent-duelist

[![npm version](https://img.shields.io/npm/v/agent-duelist?color=f59e0b)](https://www.npmjs.com/package/agent-duelist)
[![CI](https://github.com/DataGobes/agent-duelist/actions/workflows/ci.yml/badge.svg)](https://github.com/DataGobes/agent-duelist/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-landing%20page-f59e0b)](https://datagobes.github.io/agent-duelist/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> Pit LLM providers against each other on agent tasks — **Duel your models.**
>
> **[View the landing page →](https://datagobes.github.io/agent-duelist/)**

`agent-duelist` is a TypeScript-first benchmarking framework that runs the same tasks against multiple LLM providers and gives you structured, reproducible results: correctness, latency, tokens, cost, and more.

```bash
npx duelist init   # scaffold a config
npx duelist run    # see who wins
```

## What you get

**Console output** — box-drawing tables with medals, color-ranked metrics, sparklines, and per-task winners:

![Agent Duelist console output](docs/assets/screenshot.png)

**HTML report** — a self-contained, shareable single-file report with sortable tables, progress bars, tab navigation, and summary cards:

![Agent Duelist HTML report](docs/assets/screenshot-html.png)

---

## Why agent-duelist?

| | |
|---|---|
| **Provider-agnostic** | One config, many providers. Swap models and gateways without rewriting tasks. |
| **Agent-focused** | Built for agent workflows and tool use, not just single-turn prompts. |
| **7 built-in scorers** | Correctness, latency, cost, schema validation, fuzzy similarity, LLM-as-judge, and tool usage. |
| **Fair benchmarking** | Tasks run sequentially while providers race in parallel — fair latency comparison with no queue-induced penalties. |
| **TypeScript-native** | Strongly typed APIs, Zod schemas for structured outputs, and a simple `defineArena()` entrypoint. |
| **CI-ready** | Regression detection with confidence intervals, cost budgets, PR comments, and a prebuilt GitHub Action. |
| **CLI-first** | `npx duelist init` → `npx duelist run` gets you from zero to results in minutes. |

---

## Installation

```bash
npm install agent-duelist
# or
pnpm add agent-duelist
# or
yarn add agent-duelist
```

Set API keys for the providers you want to benchmark:

```bash
export OPENAI_API_KEY=sk-...
export AZURE_OPENAI_API_KEY=...
export ANTHROPIC_API_KEY=...
export GOOGLE_API_KEY=...
```

---

## Quickstart

Initialize a config:

```bash
npx duelist init
```

This creates `arena.config.ts` in your project:

```ts
// arena.config.ts
import { defineArena, openai, azureOpenai } from 'agent-duelist'
import { z } from 'zod'

export default defineArena({
  providers: [
    openai('gpt-5-mini'),
    azureOpenai('gpt-5-mini', { deployment: 'my-azure-deployment' }),
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
  scorers: ['latency', 'cost', 'correctness', 'schema-correctness', 'fuzzy-similarity'],
  runs: 3,
})
```

Run the benchmark:

```bash
npx duelist run
```

You'll see a results matrix:

- **Rows**: tasks (`simple-qa`, `structured-extraction`)
- **Columns**: providers (`openai/gpt-5-mini`, `azure/gpt-5-mini`)
- **Cells**: correctness score, latency, tokens, and estimated cost

Export the results in different formats:

```bash
# JSON for CI pipelines and dashboards
npx duelist run --reporter json > results.json

# Self-contained HTML report you can share or host
npx duelist run --reporter html --output report.html
```

---

## Core concepts

### Providers

Providers are **factory functions** that return plain objects implementing a shared `ArenaProvider` interface. This lets you swap providers without changing tasks, wrap or extend providers in your own code, and mock providers in tests.

```ts
import {
  openai,
  azureOpenai,
  anthropic,
  gemini,
  openaiCompatible,
} from 'agent-duelist'

// OpenAI
const oai = openai('gpt-5-mini')

// Azure OpenAI
const azure = azureOpenai('gpt-5-mini', {
  deployment: 'my-deployment',
})

// Anthropic
const claude = anthropic('claude-sonnet-4.6')

// Google Gemini
const gem = gemini('gemini-3-flash-preview')

// Any OpenAI-compatible gateway (Ollama, LiteLLM, vLLM, etc.)
const local = openaiCompatible({
  id: 'local/llama',
  name: 'Local Ollama',
  baseURL: 'http://localhost:11434/v1',
  model: 'llama3.3',
  apiKeyEnv: 'LOCAL_LLM_API_KEY',
  free: true,           // registers zero-cost pricing
})

// Reasoning models that emit <think> blocks (DeepSeek-R1, MiniMax M2.5, etc.)
const deepseek = openaiCompatible({
  id: 'deepseek/r1',
  name: 'DeepSeek R1',
  baseURL: 'https://api.deepseek.com/v1',
  model: 'deepseek-reasoner',
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  stripThinking: true,  // strips <think>...</think> from output
})
```

At minimum, a provider implements:

```ts
interface ArenaProvider {
  id: string        // e.g. 'openai/gpt-5-mini'
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
  tools?: ToolDefinition[]   // used by tool-calling scorers
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

Scorers turn raw model outputs into **numeric scores** (0–1) with optional details. Seven built-in scorers ship out of the box:

| Scorer | What it measures |
|--------|-----------------|
| `latency` | Wall-clock response time in milliseconds |
| `cost` | Estimated USD cost from token usage and a bundled pricing catalog |
| `correctness` | Exact match against `expected` (deep-equal, key-order independent for objects) |
| `schema-correctness` | Validates output against the task's Zod `schema` via `safeParse()` |
| `fuzzy-similarity` | Jaccard token-overlap similarity between output and `expected` |
| `tool-usage` | Whether the model invoked the expected tool(s) during a tool-calling task |
| `llm-judge-correctness` | LLM-as-judge — calls a judge model to score accuracy, completeness, and conciseness |

Configure them in your arena:

```ts
scorers: ['latency', 'cost', 'correctness', 'schema-correctness', 'fuzzy-similarity']
```

The `llm-judge-correctness` scorer evaluates outputs on three criteria (accuracy, completeness, conciseness) and returns a composite decimal score. Configure the judge model directly in your arena config:

```ts
defineArena({
  // ...
  scorers: ['latency', 'cost', 'correctness', 'llm-judge-correctness'],
  judgeModel: 'gemini-3.1-pro-preview', // or any OpenAI/Azure/Gemini model
})
```

The judge model defaults to `gpt-5-mini`. It can also be set via the `DUELIST_JUDGE_MODEL` env var. The judge backend is auto-detected from the model name — `gemini-*` models use Google's API, otherwise it falls back to OpenAI or Azure OpenAI.

---

### Arena options

`defineArena()` accepts these top-level options alongside `providers`, `tasks`, and `scorers`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `runs` | `number` | `1` | Number of runs per provider x task combination. Higher values improve statistical confidence for CI regression detection. |
| `judgeModel` | `string` | `'gpt-5-mini'` | Model used by the `llm-judge-correctness` scorer. Also settable via `DUELIST_JUDGE_MODEL` env var. Gemini models auto-route to Google's API. |
| `timeout` | `number` | `60000` | Per-request timeout in milliseconds. Requests exceeding this are marked as failures. Prevents hanging on unresponsive APIs. |
| `sparklines` | `boolean` | `true` | Show sparkline bars next to percentage scores in the console reporter. Disable with `false` if your terminal doesn't render Unicode block characters well. |

Example with all options:

```ts
export default defineArena({
  providers: [openai('gpt-5-mini'), gemini('gemini-3-flash-preview')],
  tasks: [/* ... */],
  scorers: ['latency', 'cost', 'correctness', 'llm-judge-correctness'],
  runs: 3,
  judgeModel: 'gemini-3.1-pro-preview',
  timeout: 30_000,   // 30s — fail fast on slow APIs
  sparklines: false,  // plain percentages, no Unicode bars
})
```

---

## Reporters

agent-duelist includes four output formats, each suited to a different workflow:

| Reporter | Flag | Use case |
|----------|------|----------|
| **Console** | `--reporter console` (default) | Interactive development — box-drawing tables with medals, sparklines, color-ranked metrics, and per-task winners |
| **JSON** | `--reporter json` | CI pipelines, dashboards, and downstream tooling |
| **HTML** | `--reporter html` | Shareable single-file reports with sortable tables, animated backgrounds, tab navigation, CSS progress bars, medal rankings, and summary cards |
| **Markdown** | `--comment` (CI mode) | Auto-posted PR comment with comparison table, cost summary, and pass/fail verdict |

Generate an HTML report:

```bash
npx duelist run --reporter html --output report.html
```

The HTML report is a single self-contained file — no external dependencies, no build step. Open it in any browser or host it as a static page.

---

## Cost & pricing

Cost estimation is intentionally transparent and conservative:

1. **Token counts** — Providers return token usage (prompt and completion tokens) in each `TaskResult`. These are the source of truth.

2. **Pricing catalog** — `agent-duelist` ships with a **locally bundled catalog** of per-token prices for many models, derived from OpenRouter's public pricing pages.
   - The catalog maps `(provider, model)` to `{ inputPerM, outputPerM }` in USD per 1M tokens.
   - Azure OpenAI models resolve back to their base OpenAI models (e.g. `azure/gpt-5-mini` → `openai/gpt-5-mini`).
   - Cross-provider fallback: models hosted on Groq, Together, Fireworks, etc. resolve to the original provider's pricing.

3. **Estimated USD** — The `cost` scorer computes:

   ```text
   estimatedUsd = (promptTokens * inputPerM + completionTokens * outputPerM) / 1_000_000
   ```

4. **Unknown models** — If a model is not in the catalog, tokens are still reported and cost is marked as unknown (no fake numbers).

5. **Custom pricing** — Register pricing for models not in the catalog:

   ```ts
   import { registerPricing } from 'agent-duelist'

   registerPricing('custom/my-model', {
     inputPerToken: 0.000003,
     outputPerToken: 0.000015,
   })
   ```

You can update the bundled catalog with `npm run update:pricing`, which re-scrapes OpenRouter's public pricing page.

---

## CLI reference

### `duelist init`

Scaffold a new `arena.config.ts` in the current directory.

```bash
npx duelist init
npx duelist init --force  # overwrite an existing config
```

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing config file |

### `duelist run`

Run benchmarks defined in your arena config.

```bash
# Default config, console output
npx duelist run

# Custom config
npx duelist run --config path/to/arena.config.ts

# JSON for piping
npx duelist run --reporter json > results.json

# HTML report
npx duelist run --reporter html --output report.html

# Quiet mode
npx duelist run --quiet
```

| Option | Description |
|--------|-------------|
| `-c, --config <path>` | Path to config file (default: `arena.config.ts`) |
| `--reporter <type>` | Output format: `console` (default), `json`, or `html` |
| `--output <path>` | Output file path for HTML reporter (default: `duelist-report.html`) |
| `-q, --quiet` | Suppress per-result progress |

### `duelist ci`

Run benchmarks, compare against a baseline, and enforce quality gates. Exits non-zero if regressions are detected or cost exceeds the budget.

```bash
# First run — establishes the baseline
npx duelist ci --update-baseline

# Subsequent runs — compare against baseline
npx duelist ci --threshold correctness=0.1 --budget 1.00

# Post comparison table as a PR comment (GitHub Actions)
npx duelist ci --threshold correctness=0.1 --comment
```

| Option | Description |
|--------|-------------|
| `-c, --config <path>` | Path to config file (default: `arena.config.ts`) |
| `--baseline <path>` | Baseline JSON file (default: `.duelist/baseline.json`) |
| `--budget <dollars>` | Max total cost in USD — fails if exceeded |
| `--threshold <scorer=delta>` | Regression threshold (repeatable, e.g. `--threshold correctness=0.1 --threshold cost=0.002`) |
| `--update-baseline` | Save results as new baseline after passing |
| `--comment` | Post markdown comparison table as a GitHub PR comment |
| `-q, --quiet` | Suppress per-result progress |

**How regression detection works:**

- With `runs > 1`, the CI uses 95% confidence intervals (t-distribution) — a scorer only regresses if the confidence intervals don't overlap beyond the threshold. This avoids false positives from noisy LLM outputs.
- With `runs === 1`, it uses a simple delta comparison.
- Without `--threshold` flags, regression detection is skipped entirely — only `--budget` is enforced.
- Results with high variance (CV > 0.3) are flagged as **flaky** with a warning.

The CLI loads TypeScript configs directly using a lightweight runtime loader so you don't need to precompile your config.

---

## Tool-calling agent example

agent-duelist supports tool-calling tasks — define tools with Zod-typed parameters and handlers, and the provider will execute them during the benchmark:

```ts
import { defineArena, openai } from 'agent-duelist'
import { z } from 'zod'

const weatherTool = {
  name: 'getCurrentWeather',
  description: 'Get the current weather in a given city',
  parameters: z.object({ city: z.string() }),
  handler: async ({ city }: { city: string }) => ({
    city,
    tempC: 20,
  }),
}

export default defineArena({
  providers: [openai('gpt-5-mini')],
  tasks: [
    {
      name: 'weather-tool-call',
      prompt: 'What is the current temperature in Amsterdam? Use the tool.',
      expected: { city: 'Amsterdam' },
      tools: [weatherTool],
    },
  ],
  scorers: ['latency', 'cost', 'tool-usage'],
  runs: 1,
})
```

The model calls `getCurrentWeather`, the handler returns a stub result, and the `tool-usage` scorer reports whether the expected tool was invoked. Tool calls and their results are included in the JSON output for inspection.

---

## Example: multi-provider benchmark

A richer example comparing multiple providers across tasks:

```ts
// arena.config.ts
import { defineArena, azureOpenai, openai, gemini } from 'agent-duelist'
import { z } from 'zod'

export default defineArena({
  providers: [
    openai('gpt-5-mini'),
    azureOpenai('gpt-5-nano'),
    gemini('gemini-3-flash-preview'),
  ],
  tasks: [
    {
      name: 'extract-company',
      prompt:
        'Extract the company name and role as JSON from: "I work at Acme Corp as a senior engineer." Return {"company": "...", "role": "..."}',
      expected: { company: 'Acme Corp', role: 'senior engineer' },
      schema: z.object({ company: z.string(), role: z.string() }),
    },
    {
      name: 'summarize',
      prompt:
        'Summarize in one sentence: TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale.',
      expected:
        'TypeScript is a typed superset of JavaScript that improves tooling for projects of any size.',
    },
    {
      name: 'classify-sentiment',
      prompt:
        'Classify the sentiment of this review as "positive", "negative", or "neutral". Return only the classification word.\n\nReview: "The product arrived on time and works exactly as described. Very happy with my purchase!"',
      expected: 'positive',
    },
  ],
  scorers: ['latency', 'cost', 'correctness', 'schema-correctness', 'fuzzy-similarity'],
  runs: 3,
})
```

```bash
npx duelist run
```

**How scoring works:**

- Providers are compared **head-to-head within each task** — all providers receive the same prompt at the same time.
- Medals are awarded only when a provider is the **sole leader** in a metric column. Ties don't award medals, keeping rankings meaningful.
- The overall winner is determined by category wins across correctness, latency, and cost.

---

## CI / GitHub Actions

`duelist ci` is designed to run as a quality gate in your CI pipeline. It compares benchmark results against a saved baseline and fails the build if quality regresses or costs exceed a budget.

### GitHub Action

The easiest way to add eval quality gates to your PR workflow:

```yaml
# .github/workflows/eval.yml
name: LLM Eval
on: [pull_request]

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: DataGobes/agent-duelist/.github/actions/duelist-ci@main
        with:
          budget: '1.00'
          thresholds: 'correctness=0.1'
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

The action handles Node.js setup, runs `duelist ci`, posts a comparison table as a PR comment, and optionally commits an updated baseline.

| Input | Default | Description |
|-------|---------|-------------|
| `config` | `arena.config.ts` | Path to arena config file |
| `baseline` | `.duelist/baseline.json` | Path to baseline JSON file |
| `budget` | — | Max total cost in USD |
| `thresholds` | — | Space-separated `scorer=delta` pairs |
| `update-baseline` | `false` | Save results as new baseline after passing |
| `comment` | `true` | Post results as PR comment |
| `node-version` | `20` | Node.js version to use |

### PR comment output

When `--comment` is enabled, the CI posts (or updates) a markdown table on the PR:

| Provider | Task | Scorer | Baseline | Current | Delta | Status |
|----------|------|--------|----------|---------|-------|--------|
| openai/gpt-5-mini | extract | correctness | 0.900 | 0.850 | -0.050 | unchanged |
| openai/gpt-5-mini | extract | latency | 0.920 ± 0.030 | 0.890 ± 0.025 | -0.030 | unchanged |

With cost summary, flakiness warnings, and pass/fail verdict.

---

## Roadmap

**Shipped:**

- 5 provider types: OpenAI, Azure OpenAI, Anthropic, Google Gemini, and any OpenAI-compatible gateway
- 7 built-in scorers including LLM-as-judge, tool-usage, schema validation, and fuzzy similarity
- Tool-calling support with local handlers for agent task benchmarking
- Fair head-to-head benchmarking with parallel provider execution
- 4 reporters: console (tables + medals + sparklines), JSON, HTML (sortable, self-contained), and Markdown (PR comments)
- `duelist ci` with regression detection (confidence intervals), cost budgets, and flakiness warnings
- GitHub Action for CI/CD integration
- Pricing catalog with cross-provider fallback and `registerPricing()` for custom models
- `openaiCompatible` with `stripThinking` for reasoning models and `free` flag for local models
- Configurable per-request timeout

**Planned** (subject to community feedback):

- **Agent workflows** — multi-step tool chains, multi-hop reasoning, and agent traces
- **More export formats** — CSV
- **Plugin system** — first-class support for user-defined providers and scorers
- **Embedding-based scoring** — semantic similarity via embedding distance
- **More providers** — OpenRouter-native and additional OpenAI-compatible gateways

Have a use case in mind? [Open an issue](https://github.com/DataGobes/agent-duelist/issues) — community feedback shapes what gets built first.

---

## Contributing

Contributions, issues, and feature requests are welcome.

- **Bug reports / ideas**: [open a GitHub issue](https://github.com/DataGobes/agent-duelist/issues).
- **Code changes**:
  1. Fork the repo.
  2. Create a branch.
  3. Run tests: `npm test`.
  4. Run build: `npm run build`.
  5. Open a PR with a clear description.

Please keep PRs narrowly focused (single provider, one new scorer, etc.) so they're easy to review.

---

## License

MIT
