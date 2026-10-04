import { defineConfig } from 'vitest/config'
// Plus is on (mode iap) in tests, so env.ts needs RVS_ENV set explicitly (PR2-A-M1); vitest sets NODE_ENV=test.
export default defineConfig({ test: { globals: true, environment: 'node', env: { RVS_ENV: process.env.RVS_ENV ?? 'sandbox' } } })
