import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the exported scorer via its public API. The underlying OpenAI client
// is mocked so no real API calls are made.
const mockCreate = vi.fn()

vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: mockCreate } }
  }
  class MockAzureOpenAI extends MockOpenAI {}
  return { default: MockOpenAI, AzureOpenAI: MockAzureOpenAI }
})

// Must import after mocking
import { createLlmJudgeScorer } from './llm-judge.js'

const task = { name: 'test', prompt: 'Say hello', expected: 'hello' }
const result = { output: 'hello', latencyMs: 100 }

function judgeResponse(accuracy: number, completeness: number, conciseness: number) {
  return {
    choices: [{
      message: { content: `accuracy: ${accuracy}\ncompleteness: ${completeness}\nconciseness: ${conciseness}` },
    }],
  }
}

describe('createLlmJudgeScorer', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    mockCreate.mockReset()
  })

  it('sends temperature: 0 by default for deterministic scoring', async () => {
    mockCreate.mockResolvedValueOnce(judgeResponse(0.9, 0.8, 1.0))
    const scorer = createLlmJudgeScorer()
    const score = await scorer({ task, result })
    expect(score.value).toBeGreaterThan(0)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0 }))
  })

  it('retries without temperature when model rejects it', async () => {
    // First call rejects temperature
    mockCreate.mockRejectedValueOnce(new Error('temperature is not supported with this model'))
    // Retry without temperature succeeds
    mockCreate.mockResolvedValueOnce(judgeResponse(1.0, 1.0, 1.0))

    const scorer = createLlmJudgeScorer()
    const score = await scorer({ task, result })

    expect(score.value).toBe(1)
    expect(mockCreate).toHaveBeenCalledTimes(2)
    // First call had temperature
    expect(mockCreate.mock.calls[0][0]).toHaveProperty('temperature', 0)
    // Retry call did not
    expect(mockCreate.mock.calls[1][0]).not.toHaveProperty('temperature')
  })

  it('remembers temperature preference for subsequent calls', async () => {
    // First call: temperature rejected → retry succeeds
    mockCreate.mockRejectedValueOnce(new Error('temperature is not supported'))
    mockCreate.mockResolvedValueOnce(judgeResponse(0.9, 0.9, 0.9))
    // Second call: should skip temperature entirely (no retry needed)
    mockCreate.mockResolvedValueOnce(judgeResponse(0.8, 0.8, 0.8))

    const scorer = createLlmJudgeScorer()
    await scorer({ task, result })
    await scorer({ task, result })

    // 2 calls for first invocation (try + retry) + 1 call for second = 3 total
    expect(mockCreate).toHaveBeenCalledTimes(3)
    // Third call (second invocation) should not have temperature
    expect(mockCreate.mock.calls[2][0]).not.toHaveProperty('temperature')
  })

  it('returns -1 for non-temperature errors without retrying', async () => {
    mockCreate.mockRejectedValueOnce(new Error('rate limit exceeded'))

    const scorer = createLlmJudgeScorer()
    const score = await scorer({ task, result })

    expect(score.value).toBe(-1)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect((score.details as Record<string, string>).reason).toContain('rate limit exceeded')
  })

  it('skips scoring when no expected value', async () => {
    const scorer = createLlmJudgeScorer()
    const score = await scorer({ task: { name: 'test', prompt: 'p' }, result })
    expect(score.value).toBe(-1)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
