import { defineArena, openai } from 'agent-arena'
import { z } from 'zod'

export default defineArena({
  providers: [
    openai('gpt-4o-mini'),
    // Add more providers:
    // openai('gpt-4o'),
    // anthropic('claude-3-5-sonnet'),  // coming soon
  ],

  tasks: [
    {
      name: 'extract-company',
      prompt: 'Extract the company name from this text: "I work at Acme Corp as a senior engineer."',
      expected: { company: 'Acme Corp' },
      schema: z.object({ company: z.string() }),
    },
    {
      name: 'summarize',
      prompt: 'Summarize in one sentence: The quick brown fox jumps over the lazy dog. This sentence contains every letter of the English alphabet.',
      expected: undefined, // No expected output — just benchmark latency and cost
    },
  ],

  scorers: ['latency', 'cost', 'correctness'],
  runs: 1,
})
