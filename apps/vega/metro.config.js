// Vega Metro config: RN for Vega default + the monorepo rules of apps/expo/metro.config.js.
// apps/vega is an npm project outside the pnpm workspace (docs/plans/LING-008.md §3.2), so shared-ui is not an npm dependency:
// Metro reaches it through watchFolders, and shared-ui's own dependencies (socket.io-client, qrcode-generator, @lingo/contracts,
// the kit) resolve from packages/shared-ui/node_modules, installed by `pnpm i` at the repo root.
// 1. react, react-native, react-native-svg and the @amazon-devices runtime packages must be single copies from this app (React 19.2 / RN for Vega 0.83), whatever
//    shared-ui's devDependencies (react 19.1, react-native-tvos) hold; react-native-svg is the system-distributed
//    @amazon-devices/react-native-svg (https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html).
// 2. The kit's Vega adapter require()s shaka-player, which Lingo does not vendor yet: bundle it as an empty module for importers in
//    the kit's adapters directory only. Playback is off on Vega (shared-ui caps.playback = false) until KIT-010 rewrites the adapter.
// Sources: https://github.com/AmazonAppDev/react-native-multi-tv-app-sample/blob/main/apps/vega/metro.config.js ·
// https://docs.expo.dev/guides/monorepos/ · https://metrobundler.dev/docs/resolution/
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const sharedUi = path.join(root, 'packages/shared-ui')
const kitLink = path.join(sharedUi, 'node_modules/@moizp/vega-media-kit')
if (!fs.existsSync(kitLink)) throw new Error('metro.config.js: run `pnpm i` at the repo root first (shared-ui and the kit link resolve from there)')
const kit = fs.realpathSync(kitLink)

const app = (m) => path.join(__dirname, 'node_modules', m)
// system-distributed Vega packages (react-native-kepler, w3cmedia) are pinned too: the kit has its own dev copies in its node_modules
const singletons = {
  react: app('react'), 'react-native': app('react-native'), 'react-native-svg': app('@amazon-devices/react-native-svg'),
  '@amazon-devices/react-native-kepler': app('@amazon-devices/react-native-kepler'), '@amazon-devices/react-native-w3cmedia': app('@amazon-devices/react-native-w3cmedia'),
}
const appOrigin = path.join(__dirname, 'index.js')
const vegaAdapterDir = path.join(kit, 'src/player/adapters') + path.sep

module.exports = mergeConfig(getDefaultConfig(__dirname), {
  watchFolders: [sharedUi, path.join(root, 'packages/contracts'), kit, path.join(root, 'node_modules')],
  resolver: {
    unstable_enableSymlinks: true,
    nodeModulesPaths: [path.join(__dirname, 'node_modules'), path.join(sharedUi, 'node_modules'), path.join(root, 'node_modules')],
    extraNodeModules: { '@lingo/shared-ui': sharedUi },
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'shaka-player' && context.originModulePath.startsWith(vegaAdapterDir)) return { type: 'empty' }
      const base = Object.keys(singletons).find((s) => moduleName === s || moduleName.startsWith(`${s}/`))
      if (base === 'react-native-svg') return context.resolveRequest({ ...context, originModulePath: appOrigin }, singletons[base] + moduleName.slice(base.length), platform)
      // pin react / react-native to this app's copy by resolving them as if imported from index.js (as apps/expo does)
      return context.resolveRequest(base ? { ...context, originModulePath: appOrigin } : context, moduleName, platform)
    },
  },
})
