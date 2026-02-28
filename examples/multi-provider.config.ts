/**
 * Multi-provider benchmark — the "README screenshot" config.
 *
 * Run with:
 *   npx tsx examples/run-multi.ts
 *
 * Reads API keys from .env automatically.
 */
import { defineArena, azureOpenai } from '../src/index.js'
import { z } from 'zod'

// Use multiple deployments from Azure to compare models
export default defineArena({
  providers: [
    azureOpenai('gpt-5-mini'),
    azureOpenai('gpt-5-nano'),
    azureOpenai('gpt-5.2-chat'),
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
  runs: 1,
})
