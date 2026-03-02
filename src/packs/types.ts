import type { ArenaTask } from '../tasks/types.js'
import type { BuiltInScorerName } from '../scorers/types.js'

export interface TaskPack {
  /** Short identifier, e.g. 'structured-output' */
  name: string
  /** Human-readable label for console output */
  label: string
  /** One-sentence description shown in --pack list */
  description: string
  /** The tasks in this pack */
  tasks: ArenaTask[]
  /** Recommended scorers for this pack */
  scorers: BuiltInScorerName[]
}
