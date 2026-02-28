import 'dotenv/config'
import arena from './reasoning-models.config.js'
import { consoleReporter } from '../src/index.js'

const results = await arena.run({
  onResult(result) {
    if (result.error) {
      console.log(`  ✗ ${result.providerId} × ${result.taskName}: ${result.error}`)
    } else {
      const scores = result.scores
        .filter((s) => s.value >= 0)
        .map((s) => `${s.name}=${s.value}`)
        .join(' ')
      console.log(`  ✓ ${result.providerId} × ${result.taskName}: ${scores}`)
    }
  },
})

console.log('')
consoleReporter(results)
