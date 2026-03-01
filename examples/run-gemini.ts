import 'dotenv/config'
import arena from './gemini.config.js'
import { consoleReporter } from 'agent-duelist'

const results = await arena.run({
  onResult(result) {
    if (result.error) {
      console.log(`  ✗ ${result.providerId} × ${result.taskName}: ${result.error}`)
    } else {
      const scores = result.scores
        .map((s) => {
          if (s.value < 0) {
            const reason = (s.details as Record<string, unknown>)?.reason
            return `${s.name}=SKIP${reason ? ` (${reason})` : ''}`
          }
          return `${s.name}=${s.value}`
        })
        .join(' ')
      console.log(`  ✓ ${result.providerId} × ${result.taskName}: ${scores}`)
    }
  },
})

console.log('')
consoleReporter(results)
