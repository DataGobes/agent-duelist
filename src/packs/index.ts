import type { TaskPack } from './types.js'
import { structuredOutputPack } from './structured-output.js'

const registry = new Map<string, TaskPack>()

function register(pack: TaskPack): void {
  registry.set(pack.name, pack)
}

register(structuredOutputPack)

/** Get a pack by name. Throws if not found. */
export function loadPack(name: string): TaskPack {
  const pack = registry.get(name)
  if (!pack) {
    const available = [...registry.keys()].join(', ')
    throw new Error(`Unknown pack "${name}". Available packs: ${available}`)
  }
  return pack
}

/** Get all available pack names */
export function listPacks(): Array<{ name: string; label: string; description: string; taskCount: number }> {
  return [...registry.values()].map((p) => ({
    name: p.name,
    label: p.label,
    description: p.description,
    taskCount: p.tasks.length,
  }))
}
