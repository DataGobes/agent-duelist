import 'dotenv/config'
import arena from './tool-calling.config.js'
import { consoleReporter } from 'agent-duelist'

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
