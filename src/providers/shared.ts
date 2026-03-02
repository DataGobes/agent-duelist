/** System message injected when a JSON schema is expected. */
export const SCHEMA_SYSTEM_MESSAGE = 'Respond with valid JSON matching the requested schema.'

/** Try to parse raw content as JSON when a schema is expected, falling back to the raw string. */
export function parseSchemaOutput(rawContent: string, hasSchema: boolean): string | Record<string, unknown> {
  if (!hasSchema) return rawContent
  try {
    return JSON.parse(rawContent)
  } catch {
    return rawContent
  }
}
