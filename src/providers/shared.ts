import type { ZodSchema } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

/** Build a system message that includes the actual JSON schema when available. */
export function buildSchemaSystemMessage(schema?: ZodSchema): string {
  if (!schema) return 'Respond with valid JSON.'
  const jsonSchema = zodToJsonSchema(schema, { target: 'openAi' })
  return [
    'Respond with ONLY valid JSON data. No markdown, no code fences, no explanation.',
    '',
    'Your output must conform to this JSON Schema:',
    JSON.stringify(jsonSchema, null, 2),
    '',
    'IMPORTANT: Output the actual data values, NOT the schema definition itself.',
    'Do NOT include keys like "type", "$schema", or "items" from the schema definition in your response.',
  ].join('\n')
}

/** Try to parse raw content as JSON when a schema is expected, falling back to the raw string. */
export function parseSchemaOutput(rawContent: string, hasSchema: boolean): string | Record<string, unknown> | unknown[] {
  if (!hasSchema) return rawContent
  const cleaned = stripCodeFences(rawContent)
  try {
    return JSON.parse(cleaned) as Record<string, unknown> | unknown[]
  } catch {
    return rawContent
  }
}

/** Strip markdown code fences (```json ... ```) that some models wrap around JSON output. */
function stripCodeFences(content: string): string {
  const match = content.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/m)
  return match ? match[1]! : content
}
