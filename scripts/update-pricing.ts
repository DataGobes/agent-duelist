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

// Rename OpenRouter prefixes that differ from our canonical names
const RENAME_MAP: Record<string, string> = {
  'mistralai': 'mistral',
  'meta-llama': 'meta',
  'x-ai': 'xai',
  'bytedance-seed': 'bytedance',
}

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
  const providerCounts: Record<string, number> = {}

  for (const model of data) {
    // Skip OpenRouter meta-models (routing proxies, not real models)
    if (model.id.startsWith('openrouter/')) continue

    const inputPerToken = parseFloat(model.pricing?.prompt ?? '0')
    const outputPerToken = parseFloat(model.pricing?.completion ?? '0')

    // Skip free or zero-cost models
    if (inputPerToken === 0 && outputPerToken === 0) continue

    const key = normalizeModelId(model.id)
    if (!key) continue

    const provider = key.split('/')[0]!
    providerCounts[provider] = (providerCounts[provider] ?? 0) + 1

    const isNew = !models[key]
    models[key] = { inputPerToken, outputPerToken }

    if (isNew) added++
    else updated++
  }

  const catalog = {
    _meta: {
      source: 'OpenRouter API — all providers (https://openrouter.ai/api/v1/models)',
      updatedAt: new Date().toISOString().split('T')[0],
      unit: 'USD per token',
    },
    models: Object.fromEntries(
      Object.entries(models).sort(([a], [b]) => a.localeCompare(b))
    ),
  }

  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n')

  console.log(`\nCatalog updated: ${added} added, ${updated} refreshed, ${Object.keys(models).length} total`)
  console.log(`\nPer-provider counts:`)
  const sorted = Object.entries(providerCounts).sort(([, a], [, b]) => b - a)
  for (const [provider, count] of sorted) {
    console.log(`  ${provider.padEnd(24)} ${count}`)
  }
}

function normalizeModelId(openRouterId: string): string | null {
  const slashIdx = openRouterId.indexOf('/')
  if (slashIdx === -1) return null

  const prefix = openRouterId.slice(0, slashIdx)
  const modelName = openRouterId.slice(slashIdx + 1)

  const mapped = RENAME_MAP[prefix] ?? prefix
  return `${mapped}/${modelName}`
}

main().catch(console.error)
