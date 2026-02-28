/**
 * Fetches current model pricing from OpenRouter and updates the local catalog.
 *
 * Usage:
 *   npx tsx scripts/update-pricing.ts
 *
 * This merges new data into the existing catalog, preserving any manual entries.
 */

const OPENROUTER_API = 'https://openrouter.ai/api/v1/models'
const CATALOG_PATH = new URL('../src/pricing/catalog.json', import.meta.url)

// Map OpenRouter model ID prefixes to our provider names
const PROVIDER_MAP: Record<string, string> = {
  'openai/': 'openai/',
  'anthropic/': 'anthropic/',
  'google/': 'google/',
  'mistralai/': 'mistral/',
  'meta-llama/': 'meta/',
  'deepseek/': 'deepseek/',
  'cohere/': 'cohere/',
  'qwen/': 'qwen/',
}

// Models we care about — add patterns here to include more
const MODEL_PATTERNS = [
  // OpenAI
  /^openai\/gpt-/,
  /^openai\/o[134]-/,
  // Anthropic
  /^anthropic\/claude-/,
  // Google
  /^google\/gemini-/,
  // Mistral
  /^mistralai\/mistral-/,
  // Meta
  /^meta-llama\/llama-/,
  // DeepSeek
  /^deepseek\//,
]

interface OpenRouterModel {
  id: string
  pricing?: {
    prompt?: string
    completion?: string
  }
}

interface CatalogEntry {
  inputPerToken: number
  outputPerToken: number
}

async function main() {
  console.log('Fetching models from OpenRouter...')

  const response = await fetch(OPENROUTER_API)
  if (!response.ok) {
    console.error(`Failed to fetch: ${response.status} ${response.statusText}`)
    process.exit(1)
  }

  const { data } = (await response.json()) as { data: OpenRouterModel[] }
  console.log(`Received ${data.length} models`)

  // Load existing catalog
  const { readFileSync, writeFileSync } = await import('node:fs')
  const existing = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))
  const models: Record<string, CatalogEntry> = { ...existing.models }

  let added = 0
  let updated = 0

  for (const model of data) {
    // Filter to models we care about
    if (!MODEL_PATTERNS.some((p) => p.test(model.id))) continue

    const inputPerToken = parseFloat(model.pricing?.prompt ?? '0')
    const outputPerToken = parseFloat(model.pricing?.completion ?? '0')

    // Skip free or zero-cost models
    if (inputPerToken === 0 && outputPerToken === 0) continue

    // Normalize the model ID to our provider/model format
    const key = normalizeModelId(model.id)
    if (!key) continue

    const isNew = !models[key]
    models[key] = { inputPerToken, outputPerToken }

    if (isNew) added++
    else updated++
  }

  const catalog = {
    _meta: {
      source: 'OpenRouter API (https://openrouter.ai/api/v1/models)',
      updatedAt: new Date().toISOString().split('T')[0],
      unit: 'USD per token',
    },
    models: Object.fromEntries(
      Object.entries(models).sort(([a], [b]) => a.localeCompare(b))
    ),
  }

  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n')
  console.log(`\nCatalog updated: ${added} added, ${updated} refreshed, ${Object.keys(models).length} total`)
}

function normalizeModelId(openRouterId: string): string | null {
  for (const [prefix, mapped] of Object.entries(PROVIDER_MAP)) {
    if (openRouterId.startsWith(prefix)) {
      const modelName = openRouterId.slice(prefix.length)
      return `${mapped}${modelName}`
    }
  }
  return null
}

main().catch(console.error)
