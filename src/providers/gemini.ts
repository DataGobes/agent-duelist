import OpenAI from 'openai'
import { makeProvider } from './openai.js'
import type { ArenaProvider } from './types.js'

export interface GeminiProviderOptions {
  apiKey?: string
}

export function gemini(model: string, options?: GeminiProviderOptions): ArenaProvider {
  const apiKey = options?.apiKey ?? process.env.GOOGLE_API_KEY

  if (!apiKey) {
    throw new Error(
      `Missing API key for google/${model}. Set GOOGLE_API_KEY or pass apiKey option.`,
    )
  }

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  })

  return makeProvider(`google/${model}`, 'Google AI', model, client, model)
}
