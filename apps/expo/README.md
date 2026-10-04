# Lingo — Fire OS (Expo)

`react-native` here is **react-native-tvos** (`npm:react-native-tvos@0.81.5-2`, the 0.81 line that matches Expo SDK 54) with the
`@react-native-tvos/config-tv` plugin, per Expo's [Building for TV](https://docs.expo.dev/guides/building-for-tv/) guide.
`RemoteBridge.tsx` feeds its `useTVEventHandler` into shared-ui's `RemoteSource`.

Native rebuild (after any change to native dependencies or `app.json`; `android/` is generated and not committed):

```
cd apps/expo && EXPO_TV=1 npx expo prebuild --clean
pnpm --filter @lingo/expo android
```

Then press `a` in `pnpm expo` with the stick connected (`adb connect <ip>`). (`build:tv` is the EAS APK build; see the EAS note below.)
The Leanback launcher intent is set so the app shows on the Fire TV home. JS-only check: `EXPO_TV=1 npx expo export --platform android`.

`plugins/withKeyDownEvents.js` sets `ReactFeatureFlags.enableKeyDownEvents = true` in `MainApplication.kt` during prebuild, so
remote presses arrive as key-down then key-up (react-native-tvos sends key-up only by default; decision 0006 §3).

**EAS builds:** `@moizp/vega-media-kit` is a `link:` to a checkout outside this repo (`../vega-media-kit`). EAS uploads only this
repo, so `build:tv` on EAS cannot resolve the kit until it is published to npm. Build the APK locally (`expo run:android
--variant release`) until then.

`metro.config.js` watches the linked kit checkout, keeps react-native-tvos the only `react-native` in the bundle, and bundles the
kit's Vega-only requires (`shaka-player`, `@amazon-devices/*`, from the kit's adapters directory only) as empty modules. It stops
with a clear error if the kit link does not resolve.

## IAP sandbox (Lingo Plus, LING-007)

`react-native-iap` 16.7.x (OpenIAP) builds against the Amazon Appstore SDK because `plugins/withAmazonIap.js` writes
`openiapStore=amazon` to `android/gradle.properties` at prebuild (and drops any `fireOsEnabled` line). The same plugin copies
`amazon/AppstoreAuthenticationKey.pem` to `android/app/src/main/assets/`. Download the key from Developer Console → your app →
**Public Key**. It is git-ignored. Without it, App Tester answers `AUTH_TOKEN_VERIFICATION_FAILURE`, and prebuild warns once.

`amazon.sdktester.json` is a fallback catalog (`lingo.plus` parent, `lingo.plus.monthly` monthly term). Replace it with the Developer
Console export (**Export Multiple IAPs / JSON**) once the items exist. The client always buys `lingo.plus.monthly`. The API verifies
every receipt with the RVS Cloud Sandbox (`LINGO_PLUS_MODE=iap RVS_ENV=sandbox`) before the app calls `finishTransaction`
(Amazon `notifyFulfillment`).

Install **Amazon App Tester** from the Appstore on the stick, then:

```
adb push apps/expo/amazon.sdktester.json /sdcard/amazon.sdktester.json   # → 1 file pushed
adb shell setprop debug.amazon.sandboxmode debug                         # turn sandbox on
adb shell getprop debug.amazon.sandboxmode                               # → debug
adb shell setprop debug.amazon.sandboxmode none                          # turn it off when done
```

Deep link (Content Launcher / catalog target): `adb shell am start -a android.intent.action.VIEW -d "lingo://clip/<slug>?t=30"`.

`LINGO_PLUS_MODE=demo` on the API gives everyone Plus (for filming when the sandbox is flaky). `off` gives nobody Plus. The Plus
screen says which mode is on.

Docs: [Integrate the Appstore SDK](https://developer.amazon.com/docs/appstore-sdk/integrate-appstore-sdk.html) ·
[Troubleshooting](https://developer.amazon.com/docs/appstore-sdk/appstore-sdk-troubleshooting.html) ·
[Install and configure App Tester](https://developer.amazon.com/docs/in-app-purchasing/iap-install-and-configure-app-tester.html) ·
[RVS Cloud Sandbox](https://developer.amazon.com/docs/in-app-purchasing/rvs-cloud-sandbox.html) ·
[Create IAP items](https://developer.amazon.com/docs/in-app-purchasing/iap-create-and-submit-iap-items.html) ·
[Integrate with the launcher](https://developer.amazon.com/docs/catalog/integrate-with-launcher.html).
