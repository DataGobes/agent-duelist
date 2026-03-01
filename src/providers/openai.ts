import OpenAI, { AzureOpenAI } from 'openai'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { registerPricing } from '../pricing/lookup.js'
import type { ToolDefinition } from '../tasks/types.js'
import type { ArenaProvider, TaskInput, TaskResult, ToolCall } from './types.js'

/** Default per-request timeout in ms (60 s). Prevents hanging on unresponsive APIs. */
export const REQUEST_TIMEOUT_MS = 60_000

export interface OpenAIProviderOptions {
  apiKey?: string
  baseURL?: string
  timeoutMs?: number
}

export interface AzureOpenAIProviderOptions {
  apiKey?: string
  endpoint?: string
  apiVersion?: string
  deployment?: string
  timeoutMs?: number
}

export function openai(model: string, options?: OpenAIProviderOptions): ArenaProvider {
  const client = new OpenAI({
    apiKey: options?.apiKey ?? process.env.OPENAI_API_KEY,
    baseURL: options?.baseURL,
    timeout: options?.timeoutMs ?? REQUEST_TIMEOUT_MS,
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
  /** Strip `<think>...</think>` blocks from reasoning models (e.g. DeepSeek-R1, MiniMax M2.5) */
  stripThinking?: boolean
  /** Mark this provider as free (e.g. local Ollama models) so it registers zero-cost pricing */
  free?: boolean
  timeoutMs?: number
}

export function openaiCompatible(options: OpenAICompatibleOptions): ArenaProvider {
  const apiKey = options.apiKey
    ?? (options.apiKeyEnv ? process.env[options.apiKeyEnv] : undefined)
    ?? 'no-key'

  const client = new OpenAI({
    apiKey,
    baseURL: options.baseURL,
    timeout: options.timeoutMs ?? REQUEST_TIMEOUT_MS,
  })

  if (options.free) {
    registerPricing(options.id, { inputPerToken: 0, outputPerToken: 0 })
  }

  return makeProvider(options.id, options.name, options.model, client, options.model, options.stripThinking)
}

/**
 * Create an Azure OpenAI provider.
 *
 * @param model - The model or deployment name (e.g. "gpt-4o", "gpt-5-mini").
 *   Used as the deployment name unless `options.deployment` overrides it.
 */
export function azureOpenai(model: string, options?: AzureOpenAIProviderOptions): ArenaProvider {
  const deployment = options?.deployment ?? model

  const client = new AzureOpenAI({
    apiKey: options?.apiKey ?? process.env.AZURE_OPENAI_API_KEY,
    endpoint: options?.endpoint ?? process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: options?.apiVersion ?? process.env.AZURE_OPENAI_API_VERSION ?? '2024-12-01-preview',
    deployment,
    timeout: options?.timeoutMs ?? REQUEST_TIMEOUT_MS,
  })

  return makeProvider(`azure/${model}`, 'Azure OpenAI', model, client, deployment)
}

export function makeProvider(
  id: string,
  name: string,
  model: string,
  client: OpenAI | AzureOpenAI,
  requestModel: string,
  stripThinking?: boolean,
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

      // If tools are provided, convert to OpenAI tool format
      if (input.tools?.length) {
        params.tools = input.tools.map(toolDefToOpenAI)
        params.tool_choice = 'auto'
      }

      const response = await client.chat.completions.create(params, { signal: input.signal })
      let totalPromptTokens = response.usage?.prompt_tokens ?? 0
      let totalCompletionTokens = response.usage?.completion_tokens ?? 0

      const choice = response.choices[0]
      const toolCallsRaw = choice?.message?.tool_calls
      const collectedToolCalls: ToolCall[] = []
      let finalResponse = response

      // If the model made tool calls, execute handlers and send results back
      if (toolCallsRaw?.length && input.tools?.length) {
        const toolMessages: OpenAI.ChatCompletionMessageParam[] = [
          ...params.messages,
          choice!.message,
        ]

        for (const tc of toolCallsRaw) {
          const toolDef = input.tools.find((t) => t.name === tc.function.name)
          let args: unknown
          try {
            args = JSON.parse(tc.function.arguments)
          } catch {
            args = tc.function.arguments
          }

          let result: unknown
          if (toolDef?.handler) {
            result = await toolDef.handler(args)
          }

          collectedToolCalls.push({ name: tc.function.name, arguments: args, result })

          toolMessages.push({
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: JSON.stringify(result ?? {}),
          })
        }

        // Follow-up call with tool results
        const followUp = await client.chat.completions.create({
          model: requestModel,
          messages: toolMessages,
        }, { signal: input.signal })

        totalPromptTokens += followUp.usage?.prompt_tokens ?? 0
        totalCompletionTokens += followUp.usage?.completion_tokens ?? 0
        finalResponse = followUp
      }

      const latencyMs = Date.now() - start
      const finalChoice = finalResponse.choices[0]
      let rawContent = finalChoice?.message?.content ?? ''

      if (stripThinking) {
        rawContent = rawContent.replace(/<think>[\s\S]*?<\/think>\s*/, '')
      }

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
          promptTokens: totalPromptTokens || undefined,
          completionTokens: totalCompletionTokens || undefined,
        },
        latencyMs,
        raw: finalResponse,
        toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
      }
    },
  }
}

function toolDefToOpenAI(tool: ToolDefinition): OpenAI.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.parameters, { target: 'openAi' }) as Record<string, unknown>,
    },
  }
}
