// Vega-safe imports only. Anything with native code outside Amazon's supported list does not run on Vega.
// socket.io-client (tested 4.7.5) and react-native-svg are on Amazon's supported list: https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html
import tsParser from '@typescript-eslint/parser'
export default [{
  files: ['src/**/*.{ts,tsx}'],
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  rules: {
    'no-restricted-imports': ['error', {
      // shared-ui is typed against react-native-tvos (so nextFocus* props type-check) but runs on Vega too:
      // the TV event APIs are bridged by apps/expo and apps/vega into a RemoteSource instead.
      paths: [{
        name: 'react-native',
        importNames: ['useTVEventHandler', 'TVEventHandler', 'TVEventControl', 'TVFocusGuideView', 'TVTextScrollView'],
        message: 'TV event APIs are platform-specific. Take a RemoteSource from the platform entry (decision 0006 §3).'
      }],
      patterns: [{
        group: ['react-native-video', 'react-native-tvos', '@react-native-tvos/*', '@amazon-devices/*', 'expo-camera', 'expo-av', 'react-native-webview', 'react-native-iap', '@react-native-async-storage/*'],
        message: 'Not allowed in shared-ui. Use @moizp/vega-media-kit (player/platform) or put platform code in apps/expo or apps/vega.'
      }]
    }]
  }
}]
