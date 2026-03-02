import type { ArenaConfig } from '../arena.js'
import type { ArenaProvider } from '../providers/types.js'
import type { BuiltInScorerName } from '../scorers/types.js'
import { loadPack } from './index.js'

export interface PackRunConfig {
  /** Pack names to load */
  packs: string[]
  /** Providers from user config or CLI defaults */
  providers: ArenaProvider[]
  /** Override runs count. Default: 1 */
  runs?: number
  /** Per-request timeout in ms. Forwarded from arena config. */
  timeout?: number
}

/**
 * Merge packs into a single ArenaConfig.
 * - Tasks are concatenated across packs
 * - Scorers are merged (union of all pack scorers, deduped)
 */
export function buildPackConfig(config: PackRunConfig): ArenaConfig {
  const packs = config.packs.map((name) => loadPack(name))

  const tasks = packs.flatMap((p) => p.tasks)

  const scorerSet = new Set<BuiltInScorerName>()
  for (const pack of packs) {
    for (const scorer of pack.scorers) {
      scorerSet.add(scorer)
    }
  }

  return {
    providers: config.providers,
    tasks,
    scorers: [...scorerSet],
    runs: config.runs ?? 1,
    timeout: config.timeout,
  }
}
