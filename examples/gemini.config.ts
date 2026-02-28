/**
 * Gemini vs Azure GPT-5-mini vs MiniMax — three-way provider benchmark.
 *
 * Run with:
 *   npx tsx examples/run-gemini.ts
 *
 * Requires GOOGLE_API_KEY, AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT,
 * and MINIMAX_API_KEY in .env.
 */
import { defineArena, gemini, azureOpenai, openaiCompatible } from '../src/index.js'
import { z } from 'zod'

export default defineArena({
  providers: [
    gemini('gemini-2.5-flash'),
    azureOpenai('gpt-5-mini'),
    openaiCompatible({
      id: 'minimax/minimax-m2.5',
      name: 'MiniMax',
      model: 'MiniMax-M2.5',
      baseURL: 'https://api.minimax.io/v1',
      apiKeyEnv: 'MINIMAX_API_KEY',
      stripThinking: true,
    }),
  ],

  tasks: [
    {
      name: 'extract-company',
      prompt:
        'Extract the company name and role as JSON from: "I work at Acme Corp as a senior engineer." Return {"company": "...", "role": "..."}',
      expected: { company: 'Acme Corp', role: 'senior engineer' },
      schema: z.object({ company: z.string(), role: z.string() }),
    },
    {
      name: 'classify-sentiment',
      prompt:
        'Classify the sentiment of this review as "positive", "negative", or "neutral". Return only the classification word.\n\nReview: "The product arrived on time and works exactly as described. Very happy with my purchase!"',
      expected: 'positive',
    },
    {
      name: 'summarize',
      prompt:
        'Summarize in one sentence: TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale.',
      expected:
        'TypeScript is a typed superset of JavaScript that improves tooling for projects of any size.',
    },
  ],

  scorers: ['latency', 'cost', 'correctness', 'llm-judge-correctness'],
  judgeModel: 'gemini-3.1-pro-preview',
  runs: 1,
})
