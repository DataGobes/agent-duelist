import type { ScorerFn } from './types.js'
import { lookupPricing, estimateCost } from '../pricing/lookup.js'

export const costScorer: ScorerFn = ({ result }, providerId) => {
  const promptTokens = result.usage?.promptTokens ?? 0
  const completionTokens = result.usage?.completionTokens ?? 0
  const totalTokens = promptTokens + completionTokens

  const pricing = lookupPricing(providerId)

  if (!pricing) {
    return {
      name: 'cost',
      value: -1,
      details: {
        estimatedUsd: null,
        promptTokens,
        completionTokens,
        totalTokens,
        note: 'No pricing data available for this model',
      },
    }
  }

  const usd = estimateCost(pricing, promptTokens, completionTokens)

  return {
    name: 'cost',
    value: usd,
    details: {
      estimatedUsd: usd,
      promptTokens,
      completionTokens,
      totalTokens,
    },
  }
}
