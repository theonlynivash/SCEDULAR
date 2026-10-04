import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // these two are plain scripts run by `npm test` (tsx / node), not vitest suites
    exclude: ['node_modules/**', 'tests/stage6.test.ts', 'tests/facultyAllocationPolicy.test.mjs'],
    setupFiles: ['tests/setup/isolate-db.ts'],
  },
})
