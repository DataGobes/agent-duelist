import { z } from 'zod'
import type { TaskPack } from './types.js'

export const toolCallingPack: TaskPack = {
  name: 'tool-calling',
  label: 'Tool Calling',
  description: 'Function invocation accuracy — single calls, complex params, tool selection, parallel calls, and relevance detection',

  tasks: [
    {
      name: 'tc:simple-single-tool',
      prompt: "What's the current weather in Tokyo?",
      tools: [{
        name: 'getWeather',
        description: 'Get current weather for a city',
        parameters: z.object({
          city: z.string(),
          units: z.enum(['celsius', 'fahrenheit']).optional(),
        }),
        handler: async ({ city, units }: { city: string; units?: string }) => ({
          city,
          tempC: 8,
          condition: 'cloudy',
          units: units ?? 'celsius',
        }),
      }],
      expected: { city: 'Tokyo' },
    },

    {
      name: 'tc:complex-params',
      prompt: 'Search for Italian restaurants within 2 miles of downtown Portland that are open now and have at least a 4-star rating.',
      tools: [{
        name: 'searchRestaurants',
        description: 'Search for restaurants matching criteria',
        parameters: z.object({
          cuisine: z.string(),
          location: z.string(),
          radiusMiles: z.number(),
          minRating: z.number(),
          openNow: z.boolean(),
        }),
        handler: async (_args: {
          cuisine: string; location: string;
          radiusMiles: number; minRating: number; openNow: boolean
        }) => ({
          results: [{ name: 'Trattoria Roma', rating: 4.5, distance: 1.2 }],
        }),
      }],
      expected: {
        cuisine: 'Italian',
        location: 'downtown Portland',
        radiusMiles: 2,
        minRating: 4,
        openNow: true,
      },
    },

    {
      name: 'tc:select-from-many',
      prompt: 'Convert 150 USD to Euros.',
      tools: [
        {
          name: 'getWeather',
          description: 'Get current weather for a city',
          parameters: z.object({ city: z.string() }),
          handler: async () => ({ tempC: 20 }),
        },
        {
          name: 'convertCurrency',
          description: 'Convert an amount between currencies',
          parameters: z.object({
            amount: z.number(),
            from: z.string(),
            to: z.string(),
          }),
          handler: async ({ amount, from, to }: {
            amount: number; from: string; to: string
          }) => ({
            amount, from, to, result: 138.75, rate: 0.925,
          }),
        },
        {
          name: 'translateText',
          description: 'Translate text between languages',
          parameters: z.object({ text: z.string(), targetLang: z.string() }),
          handler: async () => ({ translated: '' }),
        },
        {
          name: 'calculateTip',
          description: 'Calculate tip amount for a bill',
          parameters: z.object({ billAmount: z.number(), tipPercent: z.number() }),
          handler: async () => ({ tip: 0 }),
        },
      ],
      expected: { amount: 150, from: 'USD', to: 'EUR' },
    },

    {
      name: 'tc:parallel-calls',
      prompt: "I'm planning a trip. What's the weather like in both Paris and London right now?",
      tools: [{
        name: 'getWeather',
        description: 'Get current weather for a city',
        parameters: z.object({ city: z.string() }),
        handler: async ({ city }: { city: string }) => {
          const data: Record<string, { tempC: number; condition: string }> = {
            Paris: { tempC: 12, condition: 'partly cloudy' },
            London: { tempC: 9, condition: 'rainy' },
          }
          return data[city] ?? { tempC: 15, condition: 'unknown' }
        },
      }],
      expected: 'weather data for Paris and London',
    },

  ],

  scorers: ['tool-usage', 'latency', 'cost'],
}
