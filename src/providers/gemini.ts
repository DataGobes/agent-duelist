import OpenAI from 'openai'
import { makeProvider, REQUEST_TIMEOUT_MS } from './openai.js'
import type { ArenaProvider } from './types.js'

export interface GeminiProviderOptions {
  apiKey?: string
  timeoutMs?: number
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
    timeout: options?.timeoutMs ?? REQUEST_TIMEOUT_MS,
  })

  return makeProvider(`google/${model}`, 'Google AI', model, client, model)
}
