import type { ZodSchema } from 'zod'

export interface ToolDefinition {
  name: string
  description: string
  parameters: ZodSchema<any>
  /** Optional local handler for demos — simulates tool execution */
  handler?: (args: any) => Promise<unknown> | unknown
}

export interface ArenaTask {
  name: string
  prompt: string
  expected?: unknown
  schema?: ZodSchema
  tools?: ToolDefinition[]
}
