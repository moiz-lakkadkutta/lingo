import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
// react-native ships Flow source that Node cannot load; the logic tests only need Platform (platformCaps) and the kit's module scope.
export default defineConfig({
  test: { globals: true, server: { deps: { inline: ['@moizp/vega-media-kit'] } } },
  resolve: { alias: { 'react-native': fileURLToPath(new URL('./test/stubs/react-native.ts', import.meta.url)) } },
})
