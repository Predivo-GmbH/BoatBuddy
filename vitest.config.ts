import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // `scripts/**` holds node:test suites (the credential-file guard), not vitest ones.
    // This `exclude` REPLACES vitest's defaults, so without the entry vitest's default
    // include (**/*.test.mjs) would pick up scripts/guard-credential-files.test.mjs and
    // fail on its `node:test` imports.
    exclude: ['e2e/**', 'node_modules/**', 'scripts/**'],
    setupFiles: [],
  },
})
