// Copy to apps/vega/metro.config.js after `vega project create` (merge with the CLI's generated config).
// shared-ui imports plain `react-native-svg`; on Vega the SDK ships it as the system-distributed
// @amazon-devices/react-native-svg (RN 0.72 row: package ~2.0.0 / upstream 13.14.0):
// https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html
// Alias pattern from Amazon's sample: https://github.com/AmazonAppDev/react-native-multi-tv-app-sample/blob/main/apps/vega/metro.config.js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const path = require('path')

const config = {
  watchFolders: [path.resolve(__dirname, '../..')],
  resolver: {
    extraNodeModules: {
      'react-native-svg': path.dirname(require.resolve('@amazon-devices/react-native-svg/package.json')),
    },
  },
}

module.exports = mergeConfig(getDefaultConfig(__dirname), config)
