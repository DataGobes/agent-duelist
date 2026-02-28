// Core API
export { defineArena } from './arena.js'
export type { ArenaConfig, Arena } from './arena.js'

// Providers
export { openai, azureOpenai, openaiCompatible } from './providers/openai.js'
export { anthropic } from './providers/anthropic.js'
export { gemini } from './providers/gemini.js'
export type { ArenaProvider, TaskInput, TaskResult, ToolCall } from './providers/types.js'

// Tasks
export type { ArenaTask, ToolDefinition } from './tasks/types.js'

// Pricing
export { registerPricing } from './pricing/lookup.js'

// Scorers
export type { ScoreResult, ScorerFn, BuiltInScorerName } from './scorers/types.js'

// Runner
export type { BenchmarkResult } from './runner.js'

// Reporters
export { consoleReporter, jsonReporter } from './reporter/index.js'
