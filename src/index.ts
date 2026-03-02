// Core API
export { defineArena } from './arena.js'
export type { ArenaConfig, Arena } from './arena.js'

// Providers
export { openai, azureOpenai, openaiCompatible, gemini } from './providers/openai.js'
export { anthropic } from './providers/anthropic.js'
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
export { consoleReporter, jsonReporter, markdownReporter, htmlReporter } from './reporter/index.js'

// CI
export { compareResults, computeStats, loadBaseline, saveBaseline } from './ci.js'
export type { CiReport, ScorerComparison, ScorerStats, CostSummary } from './ci.js'

// GitHub
export { detectGitHubContext, upsertPrComment } from './github.js'
