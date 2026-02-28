import type { ZodSchema } from 'zod'

export interface ArenaTask {
  name: string
  prompt: string
  expected?: unknown
  schema?: ZodSchema
}
