import arena from './arena.config.js'
import { consoleReporter } from 'agent-duelist'

const results = await arena.run()

consoleReporter(results)
console.log(`\nCompleted ${results.length} benchmark(s).`)
