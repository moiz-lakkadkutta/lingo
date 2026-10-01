import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
// react-native ships Flow source that Node cannot load. The alias keeps resolution in Node; test/setup.tsx vi.mocks the module
// with plain host components so logic tests and react-test-renderer tests share one stand-in.
export default defineConfig({
  test: { globals: true, setupFiles: ['./test/setup.tsx'], server: { deps: { inline: ['@moizp/vega-media-kit'] } } },
  resolve: { alias: { 'react-native': fileURLToPath(new URL('./test/stubs/react-native.ts', import.meta.url)) } },
})
