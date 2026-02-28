import type { ZodSchema } from 'zod'

export interface TaskInput {
  prompt: string
  schema?: ZodSchema
}

export interface TaskResult {
  output: string | Record<string, unknown>
  usage?: {
    promptTokens?: number
    completionTokens?: number
  }
  latencyMs: number
  raw?: unknown
}

export interface ArenaProvider {
  id: string
  name: string
  model: string
  run(input: TaskInput): Promise<TaskResult>
}
