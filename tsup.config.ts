import { defineConfig } from 'tsup'

export default defineConfig([
  // Library build — ESM + CJS, with declarations
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
  },
  // CLI build — ESM only, with shebang
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
    // Don't clean here — would wipe the library build above
    clean: false,
  },
])
