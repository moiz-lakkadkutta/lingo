# Lingo — Vega OS

This directory is created **on a Mac/Linux machine with the Vega SDK** using the Vega CLI (React Native for Vega 0.72):

```
cd apps && vega project create vega --template hello-world   # exact command per Amazon's Vega docs for SDK 0.24
cd vega && pnpm add @lingo/shared-ui@workspace:* @moizp/vega-media-kit
pnpm add @amazon-devices/react-native-svg   # system-distributed, RN 0.72 row: ~2.0.0 (upstream 13.14.0) — https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html
# merge ./metro.config.template.js into metro.config.js: aliases `react-native-svg` → @amazon-devices/react-native-svg (pattern from AmazonAppDev/react-native-multi-tv-app-sample)
# follow AmazonAppDev/vega-video-sample's post-install to vendor Shaka
# replace App.tsx with ./App.template.tsx
vega virtual-device start && npm run build:app && vega run-app build/aarch64-release/lingo_aarch64.vpkg
```

Only this entry file is Vega-specific. All screens live in `packages/shared-ui`. The realtime link (socket.io-client, websocket only)
also lives in shared-ui; Amazon lists Socket.io 4.7.5 as tested on Vega. `Root` accepts an optional `transport` prop if a relay is needed.
