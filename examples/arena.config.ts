/**
 * Example arena config — run with:
 *   OPENAI_API_KEY=sk-... npx tsx examples/run.ts
 */
import { defineArena, openai } from '../src/index.js'
import { z } from 'zod'

export default defineArena({
  providers: [
    openai('gpt-4o-mini'),
  ],

  tasks: [
    {
      name: 'extract-company',
      prompt:
        'Extract the company name as JSON: "I work at Acme Corp as a senior engineer." Return {"company": "..."}',
      expected: { company: 'Acme Corp' },
      schema: z.object({ company: z.string() }),
    },
  ],

  scorers: ['latency', 'cost', 'correctness'],
  runs: 1,
})
