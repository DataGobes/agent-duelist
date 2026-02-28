/**
 * End-to-end test with Azure OpenAI.
 *
 * Run with:
 *   npx tsx examples/azure-run.ts
 *
 * Requires env vars: AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT
 */
import { defineArena, azureOpenai } from '../src/index.js'
import { z } from 'zod'

const arena = defineArena({
  providers: [
    azureOpenai('gpt-5-mini'),
  ],

  tasks: [
    {
      name: 'extract-company',
      prompt:
        'Extract the company name as JSON: "I work at Acme Corp as a senior engineer." Return {"company": "..."}',
      expected: { company: 'Acme Corp' },
      schema: z.object({ company: z.string() }),
    },
    {
      name: 'summarize',
      prompt:
        'Summarize in exactly one sentence: The quick brown fox jumps over the lazy dog. This sentence is famous because it contains every letter of the English alphabet.',
    },
  ],

  scorers: ['latency', 'cost', 'correctness'],
  runs: 1,
})

const results = await arena.run()
console.log(`\nCompleted ${results.length} benchmark(s).`)
