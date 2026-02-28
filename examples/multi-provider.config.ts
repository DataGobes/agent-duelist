/**
 * Multi-provider benchmark — the "README screenshot" config.
 *
 * Run with:
 *   npx tsx examples/run-multi.ts
 *
 * Reads API keys from .env automatically.
 */
import { defineArena, azureOpenai, openaiCompatible } from '../src/index.js'
import { z } from 'zod'

// Use multiple deployments from Azure to compare models
export default defineArena({
  providers: [
    azureOpenai('gpt-5-mini'),
    azureOpenai('gpt-5-nano'),
    azureOpenai('gpt-5.2-chat'),
    openaiCompatible({
      id: 'minimax/minimax-m2.5',
      name: 'MiniMax',
      model: 'MiniMax-M2.5',
      baseURL: 'https://api.minimax.io/v1',
      apiKeyEnv: 'MINIMAX_API_KEY',
      stripThinking: true,
    }),
    openaiCompatible({
      id: 'kimi/kimi-k2.5',
      name: 'Kimi',
      model: 'kimi-k2.5',
      baseURL: 'https://api.kimi.com/coding/v1',
      apiKeyEnv: 'KIMI_API_KEY',
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
      name: 'summarize',
      prompt:
        'Summarize in one sentence: TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale.',
      expected:
        'TypeScript is a typed superset of JavaScript that improves tooling for projects of any size.',
    },
    {
      name: 'classify-sentiment',
      prompt:
        'Classify the sentiment of this review as "positive", "negative", or "neutral". Return only the classification word.\n\nReview: "The product arrived on time and works exactly as described. Very happy with my purchase!"',
      expected: 'positive',
    },
  ],

  scorers: ['latency', 'cost', 'correctness', 'schema-correctness', 'fuzzy-similarity'],
  runs: 3,
})
