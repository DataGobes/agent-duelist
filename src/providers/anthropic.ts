import Anthropic from '@anthropic-ai/sdk'
import type { ArenaProvider, TaskInput, TaskResult } from './types.js'
import { SCHEMA_SYSTEM_MESSAGE, parseSchemaOutput } from './shared.js'

export interface AnthropicProviderOptions {
  apiKey?: string
  maxTokens?: number
}

export function anthropic(model: string, options?: AnthropicProviderOptions): ArenaProvider {
  const client = new Anthropic({
    apiKey: options?.apiKey ?? process.env.ANTHROPIC_API_KEY,
  })

  const maxTokens = options?.maxTokens ?? 1024

  return {
    id: `anthropic/${model}`,
    name: 'Anthropic',
    model,

    async run(input: TaskInput): Promise<TaskResult> {
      const start = Date.now()

      const systemMessage = input.schema ? SCHEMA_SYSTEM_MESSAGE : undefined

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemMessage,
        messages: [{ role: 'user', content: input.prompt }],
      }, { signal: input.signal })

      const latencyMs = Date.now() - start

      const textBlock = response.content.find((b) => b.type === 'text')
      const rawContent = textBlock?.type === 'text' ? textBlock.text : ''

      const output = parseSchemaOutput(rawContent, !!input.schema)

      return {
        output,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
        },
        latencyMs,
        raw: response,
      }
    },
  }
}
