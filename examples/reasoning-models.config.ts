/**
 * Reasoning models benchmark — local Qwen3.5 (Ollama) vs MiniMax M2.5.
 *
 * Run with:
 *   npx tsx examples/run-reasoning.ts
 */
import { defineArena, openaiCompatible } from '../src/index.js'
import { z } from 'zod'

export default defineArena({
  providers: [
    openaiCompatible({
      id: 'ollama/qwen3.5:35b-a3b',
      name: 'Ollama',
      model: 'qwen3.5:35b-a3b',
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      stripThinking: true,
      free: true,
    }),
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
  ],

  scorers: ['latency', 'cost', 'correctness', 'schema-correctness', 'fuzzy-similarity'],
  runs: 2,
})
