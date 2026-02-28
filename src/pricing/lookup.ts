import catalog from './catalog.json' with { type: 'json' }

export interface ModelPricing {
  inputPerToken: number
  outputPerToken: number
}

const models = catalog.models as Record<string, ModelPricing>

/**
 * Look up pricing for a provider ID (e.g. "openai/gpt-4o", "azure/gpt-5-mini").
 *
 * Resolution order:
 *   1. Exact match on provider ID
 *   2. Strip provider prefix, try "openai/{model}" (Azure deployments map to OpenAI models)
 *   3. Fuzzy: find any catalog key ending with the model name
 *   4. undefined (no pricing available)
 */
export function lookupPricing(providerId: string): ModelPricing | undefined {
  // 1. Exact match
  if (models[providerId]) return models[providerId]

  const model = providerId.split('/').slice(1).join('/')
  if (!model) return undefined

  // 2. Try as openai/{model} (covers azure/* deployments)
  const asOpenai = `openai/${model}`
  if (models[asOpenai]) return models[asOpenai]

  // 3. Fuzzy: any key ending with /{model}
  const suffix = `/${model}`
  const match = Object.keys(models).find((k) => k.endsWith(suffix))
  if (match) return models[match]

  return undefined
}

export function estimateCost(
  pricing: ModelPricing,
  promptTokens: number,
  completionTokens: number,
): number {
  return pricing.inputPerToken * promptTokens + pricing.outputPerToken * completionTokens
}
