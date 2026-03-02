import OpenAI, { AzureOpenAI } from 'openai'
import { REQUEST_TIMEOUT_MS } from '../providers/openai.js'
import type { ScorerFn } from './types.js'

const JUDGE_PROMPT = `You are a strict scoring judge. Evaluate the actual output against the expected output on three criteria. Score each from 0.0 to 1.0 using the full range (not just 0, 0.5, 1).

Criteria:
1. Accuracy — are the facts, entities, and claims correct? Penalize hallucinations or wrong details.
2. Completeness — does it capture all key information from the expected output? Penalize missing points.
3. Conciseness — is it free of unnecessary filler, repetition, or tangential content? Penalize verbosity.

Respond with ONLY this exact format — three lines, no other text:
accuracy: <number>
completeness: <number>
conciseness: <number>

Task: {task}
Expected: {expected}
Actual: {actual}`

interface JudgeClientResult {
  client: OpenAI
  model: string
}

function resolveJudgeClient(configModel?: string, timeoutMs = REQUEST_TIMEOUT_MS): JudgeClientResult | undefined {
  const model = configModel ?? process.env.DUELIST_JUDGE_MODEL ?? 'gpt-5-mini'

  // If the judge model starts with "gemini", use Google's OpenAI-compatible endpoint
  if (model.startsWith('gemini') && process.env.GOOGLE_API_KEY) {
    return {
      client: new OpenAI({
        apiKey: process.env.GOOGLE_API_KEY,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        timeout: timeoutMs,
      }),
      model,
    }
  }

  // Azure OpenAI fallback
  if (!process.env.OPENAI_API_KEY && process.env.AZURE_OPENAI_API_KEY) {
    return {
      client: new AzureOpenAI({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-12-01-preview',
        deployment: model,
        timeout: timeoutMs,
      }),
      model,
    }
  }

  // OpenAI
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return undefined

  return { client: new OpenAI({ apiKey, timeout: timeoutMs }), model }
}

/** Detect errors caused by temperature being unsupported (reasoning models like o1/o3). */
function isTemperatureError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  return lower.includes('temperature') && (
    lower.includes('not supported') ||
    lower.includes('is not allowed') ||
    lower.includes('unsupported') ||
    lower.includes('invalid')
  )
}

/**
 * Create an LLM-as-judge scorer configured with a specific model.
 *
 * The model can also be set via DUELIST_JUDGE_MODEL env var.
 * Requires OPENAI_API_KEY, AZURE_OPENAI_API_KEY, or GOOGLE_API_KEY
 * depending on the model prefix.
 *
 * Uses temperature: 0 for deterministic scoring. If the model rejects
 * temperature (e.g. reasoning models like o1/o3), automatically retries
 * without it and remembers the preference for subsequent calls.
 */
export function createLlmJudgeScorer(judgeModel?: string, timeoutMs = REQUEST_TIMEOUT_MS): ScorerFn {
  let cached: JudgeClientResult | undefined | null = undefined
  let useTemperature = true

  return async ({ task, result }) => {
    if (task.expected === undefined) {
      return { name: 'llm-judge-correctness', value: -1, details: { reason: 'no expected value' } }
    }

    // Lazy-init and cache the client
    if (cached === undefined) {
      cached = resolveJudgeClient(judgeModel, timeoutMs) ?? null
    }

    if (!cached) {
      return {
        name: 'llm-judge-correctness',
        value: -1,
        details: { reason: 'no API key available for judge model' },
      }
    }

    const { client, model } = cached

    const prompt = JUDGE_PROMPT
      .replace('{task}', task.prompt)
      .replace('{expected}', JSON.stringify(task.expected))
      .replace('{actual}', JSON.stringify(result.output))

    const messages: OpenAI.ChatCompletionMessageParam[] = [{ role: 'user', content: prompt }]

    try {
      const response = await callJudge(client, model, messages, useTemperature)
      return parseJudgeResponse(response, model)
    } catch (err) {
      // Auto-fallback: if temperature is rejected, retry without it
      if (useTemperature && isTemperatureError(err)) {
        useTemperature = false
        try {
          const response = await callJudge(client, model, messages, false)
          return parseJudgeResponse(response, model)
        } catch (retryErr) {
          return {
            name: 'llm-judge-correctness',
            value: -1,
            details: { reason: `judge call failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}` },
          }
        }
      }
      return {
        name: 'llm-judge-correctness',
        value: -1,
        details: { reason: `judge call failed: ${err instanceof Error ? err.message : String(err)}` },
      }
    }
  }
}

async function callJudge(
  client: OpenAI,
  model: string,
  messages: OpenAI.ChatCompletionMessageParam[],
  withTemperature: boolean,
): Promise<OpenAI.ChatCompletion> {
  return client.chat.completions.create({
    model,
    messages,
    max_completion_tokens: 2048,
    ...(withTemperature ? { temperature: 0 } : {}),
  })
}

function parseJudgeResponse(
  response: OpenAI.ChatCompletion,
  model: string,
): { name: string; value: number; details: Record<string, unknown> } {
  const content = response.choices[0]?.message?.content?.trim() ?? ''
  const parsed: Record<string, number> = {}
  for (const line of content.split('\n')) {
    const match = line.match(/^(accuracy|completeness|conciseness)\s*:\s*([\d.]+)/i)
    if (match) parsed[match[1].toLowerCase()] = parseFloat(match[2])
  }

  const accuracy = parsed.accuracy
  const completeness = parsed.completeness
  const conciseness = parsed.conciseness

  if (accuracy == null || completeness == null || conciseness == null ||
      [accuracy, completeness, conciseness].some((s) => isNaN(s) || s < 0 || s > 1)) {
    return {
      name: 'llm-judge-correctness',
      value: -1,
      details: { reason: `judge returned unparseable scores: "${content}"`, model },
    }
  }

  const composite = Math.round(((accuracy + completeness + conciseness) / 3) * 100) / 100

  return {
    name: 'llm-judge-correctness',
    value: composite,
    details: { model, accuracy, completeness, conciseness },
  }
}
