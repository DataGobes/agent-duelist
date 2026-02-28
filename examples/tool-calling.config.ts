/**
 * Tool-calling agent example — model calls a weather tool.
 *
 * Run with:
 *   npx tsx examples/run-tool-calling.ts
 *
 * Requires AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT in .env,
 * or swap azureOpenai() for openai() with OPENAI_API_KEY.
 */
import { defineArena, azureOpenai } from 'agent-duelist'
import { z } from 'zod'

const weatherTool = {
  name: 'getCurrentWeather',
  description: 'Get the current weather in a given city',
  parameters: z.object({
    city: z.string(),
  }),
  handler: async (args: { city: string }) => ({
    city: args.city,
    tempC: 20,
  }),
}

export default defineArena({
  providers: [
    azureOpenai('gpt-5-mini'),
  ],

  tasks: [
    {
      name: 'weather-tool-call',
      prompt: 'What is the current temperature in Amsterdam? Use the getCurrentWeather tool.',
      expected: { city: 'Amsterdam' },
      tools: [weatherTool],
    },
  ],

  scorers: ['latency', 'cost', 'correctness', 'tool-usage'],
  runs: 1,
})
