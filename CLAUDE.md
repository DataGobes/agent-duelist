# agent-duelist

Pit LLM providers against each other on agent tasks.

## Quick reference

- **Build**: `npm run build` (tsup → ESM + CJS + DTS)
- **Test**: `npm test` (vitest)
- **Type-check**: `npx tsc --noEmit`
- **Dev**: `npm run dev` (tsup --watch)

## Architecture

Single package, structured for future splitting:

```
src/
  index.ts           → public API exports
  arena.ts           → defineArena() and ArenaConfig
  runner.ts          → orchestrates provider × task × runs
  cli.ts             → CLI entry (commander)
  providers/
    types.ts         → ArenaProvider, TaskInput, TaskResult
    openai.ts        → OpenAI provider factory
  tasks/
    types.ts         → ArenaTask
  scorers/
    types.ts         → ScorerFn, ScoreResult, BuiltInScorerName
    index.ts         → resolveScorers() registry
    latency.ts       → normalizes latency to 0–1
    cost.ts          → estimates cost from token usage
    correctness.ts   → exact-match comparison
  reporter/
    console.ts       → CLI table output
    json.ts          → JSON output
```

## Key patterns

- Provider interface: `ArenaProvider.run(TaskInput) → TaskResult`
- Scorers are pure functions: `(ScorerContext) → ScoreResult`
- `defineArena()` validates config and returns `{ run() }` which orchestrates everything
- All `.js` extensions in imports (ESM compat with bundler moduleResolution)

## Adding a new provider

1. Create `src/providers/<name>.ts` implementing `ArenaProvider`
2. Export factory function from `src/providers/index.ts`
3. Re-export from `src/index.ts`
