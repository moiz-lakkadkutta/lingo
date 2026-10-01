// Fire OS Metro config (Expo default + three fixes).
// 1. @moizp/vega-media-kit is a `link:` to a checkout outside this repo, so Metro must watch its real path.
// 2. react-native here is react-native-tvos (npm alias). The kit keeps plain react-native as a devDependency in its own
//    node_modules; react-native-tvos must be the only copy in the bundle ("You cannot use this package and the core
//    react-native package simultaneously": https://github.com/react-native-tvos/react-native-tvos#readme), so the
//    singletons below always resolve from this app.
// Expo monorepo guide: https://docs.expo.dev/guides/monorepos/ · Metro resolveRequest: https://metrobundler.dev/docs/resolution/
const { getDefaultConfig } = require('expo/metro-config')
const fs = require('fs')
const path = require('path')

const config = getDefaultConfig(__dirname)

const kit = fs.realpathSync(path.join(__dirname, 'node_modules/@moizp/vega-media-kit'))
config.watchFolders = [...(config.watchFolders ?? []), kit]

const singletons = ['react', 'react-native', 'react-native-video', 'react-native-svg']
const appOrigin = path.join(__dirname, 'index.js')
// 3. The kit's Vega adapter require()s these inside its component body; Fire OS never renders that adapter
//    (resolveAdapter picks it only for Platform.OS 'kepler'), so they bundle as empty modules here.
const vegaOnly = (m) => m === 'shaka-player' || m.startsWith('@amazon-devices/')
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (vegaOnly(moduleName)) return { type: 'empty' }
  const pinned = singletons.some((s) => moduleName === s || moduleName.startsWith(`${s}/`))
  return context.resolveRequest(pinned ? { ...context, originModulePath: appOrigin } : context, moduleName, platform)
}

module.exports = config
