import type { ZodSchema } from 'zod'
import type { ToolDefinition } from '../tasks/types.js'

export interface ToolCall {
  name: string
  arguments: unknown
  result?: unknown
}

export interface TaskInput {
  prompt: string
  schema?: ZodSchema
  tools?: ToolDefinition[]
  signal?: AbortSignal
}

export interface TaskResult {
  output: string | Record<string, unknown>
  usage?: {
    promptTokens?: number
    completionTokens?: number
  }
  latencyMs: number
  raw?: unknown
  toolCalls?: ToolCall[]
}

export interface ArenaProvider {
  id: string
  name: string
  model: string
  run(input: TaskInput): Promise<TaskResult>
}
