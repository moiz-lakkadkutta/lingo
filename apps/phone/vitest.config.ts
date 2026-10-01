import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
// Same shape as packages/shared-ui/vitest.config.ts: react-native ships Flow source that Node cannot load, so the alias keeps
// resolution in Node and test/setup.tsx vi.mocks it (and the Expo modules) with plain host components.
export default defineConfig({
  test: { globals: true, setupFiles: ['./test/setup.tsx'] },
  resolve: { alias: { 'react-native': fileURLToPath(new URL('./test/stubs/react-native.ts', import.meta.url)) } },
})
