import arena from './arena.config.js'

const results = await arena.run()
console.log(`\nCompleted ${results.length} benchmark(s).`)
