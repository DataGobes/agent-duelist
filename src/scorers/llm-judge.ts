import OpenAI, { AzureOpenAI } from 'openai'
import type { ScorerFn } from './types.js'

const JUDGE_PROMPT = `You are a strict scoring judge. Compare the expected output with the actual output and rate correctness from 0.0 to 1.0.

Rules:
- 1.0 = semantically identical or fully correct
- 0.5 = partially correct, key information present but incomplete or slightly wrong
- 0.0 = completely wrong or irrelevant

Respond with ONLY a single decimal number between 0.0 and 1.0. No explanation.

Task: {task}
Expected: {expected}
Actual: {actual}`

let clientInstance: OpenAI | undefined

function getJudgeClient(): OpenAI | undefined {
  if (clientInstance) return clientInstance

  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AZURE_OPENAI_API_KEY
  if (!apiKey) return undefined

  if (!process.env.OPENAI_API_KEY && process.env.AZURE_OPENAI_API_KEY) {
    clientInstance = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-12-01-preview',
      deployment: process.env.DUELIST_JUDGE_MODEL ?? 'gpt-4o-mini',
    })
    return clientInstance
  }

  clientInstance = new OpenAI({ apiKey })
  return clientInstance
}

function getJudgeModel(): string {
  return process.env.DUELIST_JUDGE_MODEL ?? 'gpt-4o-mini'
}

/**
 * LLM-as-judge correctness scorer (async).
 *
 * Opt-in: only runs if 'llm-judge-correctness' is in the scorers list.
 * Requires OPENAI_API_KEY or AZURE_OPENAI_API_KEY.
 */
export const llmJudgeScorerAsync: ScorerFn = async ({ task, result }) => {
  if (task.expected === undefined) {
    return { name: 'llm-judge-correctness', value: -1, details: { reason: 'no expected value' } }
  }

  const client = getJudgeClient()
  if (!client) {
    return {
      name: 'llm-judge-correctness',
      value: -1,
      details: { reason: 'no API key available for judge model' },
    }
  }

  const prompt = JUDGE_PROMPT
    .replace('{task}', task.prompt)
    .replace('{expected}', JSON.stringify(task.expected))
    .replace('{actual}', JSON.stringify(result.output))

  try {
    const model = getJudgeModel()
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 10,
    })

    const content = response.choices[0]?.message?.content?.trim() ?? ''
    const score = parseFloat(content)

    if (isNaN(score) || score < 0 || score > 1) {
      return {
        name: 'llm-judge-correctness',
        value: -1,
        details: { reason: `judge returned unparseable score: "${content}"`, model },
      }
    }

    return {
      name: 'llm-judge-correctness',
      value: Math.round(score * 100) / 100,
      details: { model, rawScore: content },
    }
  } catch (err) {
    return {
      name: 'llm-judge-correctness',
      value: -1,
      details: { reason: `judge call failed: ${err instanceof Error ? err.message : String(err)}` },
    }
  }
}
