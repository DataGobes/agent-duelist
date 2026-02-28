import catalog from './catalog.json' with { type: 'json' }

export interface ModelPricing {
  inputPerToken: number
  outputPerToken: number
}

const models = catalog.models as Record<string, ModelPricing>

// Reverse index: model name (after slash) → first catalog key that contains it.
// Enables cross-provider lookups (e.g. groq/llama-4-scout → meta/llama-4-scout).
const modelNameIndex = new Map<string, string>()
for (const key of Object.keys(models)) {
  const name = key.split('/').slice(1).join('/')
  if (name && !modelNameIndex.has(name)) {
    modelNameIndex.set(name, key)
  }
}

/**
 * Look up pricing for a provider ID (e.g. "openai/gpt-4o", "azure/gpt-5-mini").
 *
 * Resolution order:
 *   1. Exact match on provider ID
 *   2. Strip provider prefix, try "openai/{model}" (covers Azure deployments)
 *   3. Cross-provider model-name fallback (covers hosting providers like Groq, Together, Fireworks)
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

  // 3. Cross-provider: look up by model name alone
  const crossKey = modelNameIndex.get(model)
  if (crossKey) return models[crossKey]

  return undefined
}

export function registerPricing(providerId: string, pricing: ModelPricing): void {
  models[providerId] = pricing
}

export function estimateCost(
  pricing: ModelPricing,
  promptTokens: number,
  completionTokens: number,
): number {
  return pricing.inputPerToken * promptTokens + pricing.outputPerToken * completionTokens
}
