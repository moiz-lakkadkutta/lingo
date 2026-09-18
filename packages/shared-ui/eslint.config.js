// Vega-safe imports only. Anything with native code outside Amazon's supported list does not run on Vega.
// socket.io-client (tested 4.7.5) and react-native-svg are on Amazon's supported list: https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html
import tsParser from '@typescript-eslint/parser'
export default [{
  files: ['src/**/*.{ts,tsx}'],
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['react-native-video', '@amazon-devices/*', 'expo-camera', 'expo-av', 'react-native-webview', 'react-native-iap', '@react-native-async-storage/*'],
        message: 'Not allowed in shared-ui. Use @moizp/vega-media-kit (player/platform) or put platform code in apps/expo or apps/vega.'
      }]
    }]
  }
}]
