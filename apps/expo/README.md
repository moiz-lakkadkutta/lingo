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

## Device spike on a Fire TV Stick (no proxy)

The stick reaches the Mac only through `adb reverse`, which cannot bind port 80, and the API's manifest fallback is
`http://localhost/<key>`. So run the API, the media and Metro on high ports and reverse each one. Postgres runs on the Mac;
export `DATABASE_URL` in each shell (the API reads the environment, not `.env`; see `.env.example`).

```
adb connect <stick-ip>                                   # adb devices → <stick-ip>:5555 device
# 1. A test stream: 66 s ffmpeg test pattern as HLS in ./media/demo-de/ (ignored by git)
mkdir -p media/demo-de && ffmpeg -f lavfi -i testsrc2=size=1280x720:rate=25 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 66 \
  -c:v libx264 -g 150 -pix_fmt yuv420p -c:a aac -f hls -hls_time 6 -hls_playlist_type vod \
  -hls_segment_filename 'media/demo-de/seg%03d.ts' media/demo-de/master.m3u8
pnpm media:dev                                           # serves ./media on :8090 (--dir, --port, or MEDIA_DIR / MEDIA_PORT)
# 2. The clip: the demo-de fixture (23 cues, 7 highlights with test glosses), published; safe to re-run
pnpm --filter @lingo/api seed:dev                        # manifest key demo-de/master.m3u8
# 3. The API with local media
MEDIA_BASE_URL=http://localhost:8090 LINGO_PLUS_MODE=off pnpm api     # :4000
# 4. Ports on the stick: the API, the media, Metro
adb reverse tcp:4000 tcp:4000
adb reverse tcp:8090 tcp:8090
adb reverse tcp:8081 tcp:8081                            # if another project's Metro owns 8081: run Lingo's on 8082 and
                                                         # adb reverse tcp:8081 tcp:8082 (the app is not a dev client)
# 5. The app, pointed at the reversed API (the default http://10.0.2.2:4000 is the emulator's host)
EXPO_PUBLIC_API_URL=http://localhost:4000 EXPO_PUBLIC_LINGO_SPIKE=1 pnpm --filter @lingo/expo android
adb shell am start -a android.intent.action.VIEW -d "lingo://clip/demo-de"
```

`adb reverse` rules are dropped when the stick reconnects; run `adb reverse --list` and repeat step 4 if requests stop. The clip
API returns only highlights at or above the learner's rank floor: set the level to A1 in Settings to see all 7 (an A2 learner sees 3).
Cues with a highlight: 2, 5, 6, 10, 19, 20. Open the Explain card on one of them for the chip checks.

**Release build** (the S1 Menu row: a debug build opens the Dev Menu on Menu): `EXPO_PUBLIC_API_URL=http://localhost:4000
EXPO_PUBLIC_LINGO_SPIKE=1 pnpm --filter @lingo/expo android:release`. It bundles the JS at build time (no Metro, so skip the 8081
reverse) and is signed with the template's debug keystore. Gradle path: `cd apps/expo/android && ./gradlew assembleRelease`, then
`adb install -r app/build/outputs/apk/release/app-release.apk`.

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
