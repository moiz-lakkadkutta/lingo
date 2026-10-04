// Vega entry (shape of AmazonAppDev/vega-video-sample index.js): register the root component under the manifest's component id.
import { AppRegistry } from 'react-native'
import { name as appName } from './app.json'
import App from './src/App'

AppRegistry.registerComponent(appName, () => App)
