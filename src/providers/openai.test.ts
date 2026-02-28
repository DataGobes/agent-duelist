import { describe, it, expect, vi } from 'vitest'
import { makeProvider } from './openai.js'
import { z } from 'zod'

function mockClient(responses: any[]) {
  let callIndex = 0
  return {
    chat: {
      completions: {
        create: vi.fn(async () => responses[callIndex++]),
      },
    },
  } as any
}

describe('makeProvider tool-call support', () => {
  it('handles a task with tools — calls handler and returns toolCalls', async () => {
    const toolCallResponse = {
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: {
              name: 'getCurrentWeather',
              arguments: '{"city":"Amsterdam"}',
            },
          }],
        },
      }],
      usage: { prompt_tokens: 20, completion_tokens: 10 },
    }

    const finalResponse = {
      choices: [{
        message: {
          content: 'The temperature in Amsterdam is 20°C.',
        },
      }],
      usage: { prompt_tokens: 40, completion_tokens: 15 },
    }

    const client = mockClient([toolCallResponse, finalResponse])
    const handler = vi.fn(async (args: { city: string }) => ({
      city: args.city,
      tempC: 20,
    }))

    const provider = makeProvider('test/model', 'Test', 'model-1', client, 'model-1')

    const result = await provider.run({
      prompt: 'What is the weather in Amsterdam?',
      tools: [{
        name: 'getCurrentWeather',
        description: 'Get weather for a city',
        parameters: z.object({ city: z.string() }),
        handler,
      }],
    })

    expect(handler).toHaveBeenCalledWith({ city: 'Amsterdam' })
    expect(result.toolCalls).toEqual([{
      name: 'getCurrentWeather',
      arguments: { city: 'Amsterdam' },
      result: { city: 'Amsterdam', tempC: 20 },
    }])
    expect(result.output).toBe('The temperature in Amsterdam is 20°C.')
    // Usage aggregates both calls
    expect(result.usage?.promptTokens).toBe(60)
    expect(result.usage?.completionTokens).toBe(25)
    // Two API calls made
    expect(client.chat.completions.create).toHaveBeenCalledTimes(2)
  })

  it('works normally when no tools are provided', async () => {
    const response = {
      choices: [{ message: { content: 'hello' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }

    const client = mockClient([response])
    const provider = makeProvider('test/model', 'Test', 'model-1', client, 'model-1')

    const result = await provider.run({ prompt: 'say hello' })

    expect(result.output).toBe('hello')
    expect(result.toolCalls).toBeUndefined()
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1)
  })

  it('works when model does not call any tools despite tools being available', async () => {
    const response = {
      choices: [{ message: { content: 'I can answer without tools.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }

    const client = mockClient([response])
    const provider = makeProvider('test/model', 'Test', 'model-1', client, 'model-1')

    const result = await provider.run({
      prompt: 'What is 2+2?',
      tools: [{
        name: 'calculator',
        description: 'Calculate math',
        parameters: z.object({ expr: z.string() }),
        handler: async () => ({ result: 4 }),
      }],
    })

    expect(result.output).toBe('I can answer without tools.')
    expect(result.toolCalls).toBeUndefined()
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1)
  })
})
