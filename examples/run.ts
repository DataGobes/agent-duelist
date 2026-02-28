import arena from './arena.config.js'
import { consoleReporter } from '../src/index.js'

const results = await arena.run()

consoleReporter(results)
console.log(`\nCompleted ${results.length} benchmark(s).`)
