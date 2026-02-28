import OpenAI, { AzureOpenAI } from 'openai'
import type { ArenaProvider, TaskInput, TaskResult } from './types.js'

export interface OpenAIProviderOptions {
  apiKey?: string
  baseURL?: string
}

export interface AzureOpenAIProviderOptions {
  apiKey?: string
  endpoint?: string
  apiVersion?: string
  deployment?: string
}

export function openai(model: string, options?: OpenAIProviderOptions): ArenaProvider {
  const client = new OpenAI({
    apiKey: options?.apiKey ?? process.env.OPENAI_API_KEY,
    baseURL: options?.baseURL,
  })

  return makeProvider(`openai/${model}`, 'OpenAI', model, client, model)
}

export interface OpenAICompatibleOptions {
  id: string
  name: string
  model: string
  baseURL: string
  apiKey?: string
  apiKeyEnv?: string
}

export function openaiCompatible(options: OpenAICompatibleOptions): ArenaProvider {
  const apiKey = options.apiKey
    ?? (options.apiKeyEnv ? process.env[options.apiKeyEnv] : undefined)
    ?? 'no-key'

  const client = new OpenAI({
    apiKey,
    baseURL: options.baseURL,
  })

  return makeProvider(options.id, options.name, options.model, client, options.model)
}

export function azureOpenai(deployment: string, options?: AzureOpenAIProviderOptions): ArenaProvider {
  const client = new AzureOpenAI({
    apiKey: options?.apiKey ?? process.env.AZURE_OPENAI_API_KEY,
    endpoint: options?.endpoint ?? process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: options?.apiVersion ?? process.env.AZURE_OPENAI_API_VERSION ?? '2024-12-01-preview',
    deployment: options?.deployment ?? deployment,
  })

  return makeProvider(`azure/${deployment}`, 'Azure OpenAI', deployment, client, deployment)
}

function makeProvider(
  id: string,
  name: string,
  model: string,
  client: OpenAI | AzureOpenAI,
  requestModel: string,
): ArenaProvider {
  return {
    id,
    name,
    model,

    async run(input: TaskInput): Promise<TaskResult> {
      const start = Date.now()

      const params: OpenAI.ChatCompletionCreateParams = {
        model: requestModel,
        messages: [{ role: 'user', content: input.prompt }],
      }

      // If a Zod schema is provided, use structured output via response_format
      if (input.schema) {
        params.response_format = { type: 'json_object' }
        params.messages = [
          { role: 'system', content: 'Respond with valid JSON matching the requested schema.' },
          ...params.messages,
        ]
      }

      const response = await client.chat.completions.create(params)
      const latencyMs = Date.now() - start

      const choice = response.choices[0]
      const rawContent = choice?.message?.content ?? ''

      let output: string | Record<string, unknown> = rawContent
      if (input.schema) {
        try {
          output = JSON.parse(rawContent) as Record<string, unknown>
        } catch {
          // If JSON parsing fails, fall back to raw string
        }
      }

      return {
        output,
        usage: {
          promptTokens: response.usage?.prompt_tokens,
          completionTokens: response.usage?.completion_tokens,
        },
        latencyMs,
        raw: response,
      }
    },
  }
}
