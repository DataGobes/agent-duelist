// ─── Agent Duelist Config ────────────────────────────────────────────
//
// Set your API key before running:
//   export OPENAI_API_KEY=sk-...
//
// Then run:
//   npx duelist run
//
// Docs: https://github.com/DataGobes/agent-duelist
// ─────────────────────────────────────────────────────────────────────

import { defineArena, openai } from 'agent-duelist'
import { z } from 'zod'

export default defineArena({
  providers: [
    openai('gpt-4o-mini'),
    // Add more providers to compare:
    // openai('gpt-4o'),
    // azureOpenai('gpt-4o-mini'),
    // anthropic('claude-sonnet-4-20250514'),
  ],

  tasks: [
    {
      name: 'extract-company',
      prompt:
        'Extract the company name and role as JSON: "I work at Acme Corp as a senior engineer." Return {"company": "...", "role": "..."}',
      expected: { company: 'Acme Corp', role: 'senior engineer' },
      schema: z.object({ company: z.string(), role: z.string() }),
    },
    {
      name: 'classify-sentiment',
      prompt:
        'Classify the sentiment as "positive", "negative", or "neutral". Return only the word.\n\nReview: "The product arrived on time and works exactly as described. Very happy!"',
      expected: 'positive',
    },
    {
      name: 'summarize',
      prompt:
        'Summarize in one sentence: The quick brown fox jumps over the lazy dog. This pangram contains every letter of the English alphabet and has been used since the late 1800s.',
    },
  ],

  scorers: ['latency', 'cost', 'correctness'],
  runs: 1,
})
