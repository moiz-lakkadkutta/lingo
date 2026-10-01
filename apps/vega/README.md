# Lingo — Vega OS

This directory is created **on a Mac/Linux machine with the Vega SDK** using the Vega CLI (React Native for Vega 0.72 per the docs; **unconfirmed**: the on-disk `@amazon-devices/react-native-kepler` typings are labelled rn0.83. Record the real version with `npm ls react-native` after `vega project create`; spike S2 in docs/plans/LING-003.md checks it):

```
cd apps && vega project create vega --template hello-world   # exact command per Amazon's Vega docs for SDK 0.24
cd vega && pnpm add @lingo/shared-ui@workspace:* @moizp/vega-media-kit
pnpm add @amazon-devices/react-native-svg   # system-distributed, RN 0.72 row: ~2.0.0 (upstream 13.14.0) — https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html
# merge ./metro.config.template.js into metro.config.js: aliases `react-native-svg` → @amazon-devices/react-native-svg (pattern from AmazonAppDev/react-native-multi-tv-app-sample)
# follow AmazonAppDev/vega-video-sample's post-install to vendor Shaka
# replace App.tsx with ./App.template.tsx
vega virtual-device start && npm run build:app && vega run-app build/aarch64-release/lingo_aarch64.vpkg
```

Only this entry file is Vega-specific. Its `RemoteBridge` is the only place `@amazon-devices/react-native-kepler` is imported: `useTVEventHandler` feeds shared-ui's `RemoteSource` ([Vega TVEventHandler](https://developer.amazon.com/docs/react-native-vega/0.72/using_tveventhandler.html)). All screens live in `packages/shared-ui`. The realtime link (socket.io-client, websocket only)
also lives in shared-ui; Amazon lists Socket.io 4.7.5 as tested on Vega. `Root` accepts an optional `transport` prop if a relay is needed.

## Lingo Plus, Content Launcher, Media Controls (LING-007)

```
pnpm add @amazon-devices/keplerscript-appstore-iap-lib@~2.13.0 @amazon-devices/kepler-media-content-launcher@~2.0.22   # versions as in AmazonAppDev/vega-video-sample
cp iap/vegaStore.template.ts iap/vegaStore.ts
cp platform/contentLauncher.template.ts platform/contentLauncher.ts
# merge manifest.additions.template.toml into manifest.toml; set [package] id = "dev.moizp.lingo" (the Fire OS package:
# an existing Fire TV app must reuse its application id for IAP items to keep applying)
```

Do not use IAP lib `2.12.13`: every call returns FAILED ([community thread](https://community.amazondeveloper.com/t/using-amazon-devices-keplerscript-appstore-iap-lib-2-12-13-causes-in-app-purchases-to-fail/24746)).
Both templates were type-checked against the published 2.13.0 and 2.0.22 type definitions. `getProductData` returns
`productData: Map<string, Product>`, and the price is `product.price.priceStr`.

**VVD checklist** (plan §Manual B, `docs/plans/LING-007.md`):

1. `vega virtual-device start`. Install and configure App Tester on the VVD, then put `../expo/amazon.sdktester.json` where
   [Configure App Tester (Vega)](https://developer.amazon.com/docs/vega/0.22/configure-app-tester) says. **Write the exact command
   here once run.** The page could not be opened from the build environment.
2. `npm run build:app && vega run-app build/<arch>-release/lingo_<arch>.vpkg`.
3. Plus: the sentence has no "slower playback" (Vega `caps.rate` is false). Select Subscribe, confirm the App Tester dialog, and
   expect "You have Lingo Plus.". The API log shows `store: amazon-vega`, `outcome: active`.
4. `journalctl -f | grep -i -E "iap|notifyFulfillment"` shows fulfilment after the verify call.
5. Restart: still Plus. Cancel in App Tester, then press Restore: Plus is off.
6. Content Launcher: launch external id `lingo_slug=<slug>` with the testing method from the
   [integration guide](https://developer.amazon.com/ja/docs/vega/0.24/content-launcher-integration-guide.html). The Player opens
   the clip, and `journalctl` shows `[lingo] content launcher: open <slug>`. An unknown slug answers `URL_NOT_AVAILABLE` and stays on Home.
7. Media Controls / Personalization log `[vega-media-kit] … is a no-op on kepler` once. **Expected until KIT-007.**

Docs: [Vega IAP overview](https://developer.amazon.com/docs/vega/0.22/vega-iap-overview.html) ·
[Use App Tester](https://developer.amazon.com/docs/vega/0.22/use-app-tester.html) ·
[RVS Cloud (Vega)](https://developer.amazon.com/docs/vega/0.22/rvs-cloud.html) ·
[Appstore integrations](https://developer.amazon.com/docs/vega/0.22/appstore-integrations-overview.html) ·
[Media Controls](https://developer.amazon.com/docs/vega/0.22/media-controls-get-started) ·
[Watch activity](https://developer.amazon.com/docs/vega/0.22/watch-activity.html).
