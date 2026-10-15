# react-native-iap init on Fire OS says the build targets the amazon store, not Google Play
Task attempted: Launch the Lingo debug build (react-native-iap 16.7.x, `openiapStore=amazon` in `android/gradle.properties`) on a Fire
TV Stick without Amazon App Tester installed, while preparing the 2026-10-14 device run (LING-007 checklist A).
Steps:
  1. `adb shell am start -n dev.moizp.lingo/.MainActivity` with Metro on 8082 (`adb reverse tcp:8081 tcp:8082`), API on 4000.
  2. Read the Metro console: the app calls `Iap.initConnection()` at startup (apps/expo/src/fireosStore.ts:36).
Expected: On a Fire OS device with the Amazon build, `initConnection` resolves (the Appstore SDK is on every Fire OS device), or fails
with an Amazon-specific reason (sandbox off, App Tester missing).
Actual: `ERROR [RN-IAP] Failed to initialize IAP connection: [Error: {"code":"init-connection","message":"Failed to initialize billing
connection. This build targets the amazon store, not Google Play."}]`. The message names the wrong store and does not say what is
missing on the device. `adb shell pm list packages | grep sdktestclient` is empty (no App Tester) and `debug.amazon.sandboxmode` is unset,
so the sandbox was simply off, but nothing in the error says so. The Plus screen then shows the "Price unavailable" / "isn't available"
copy, which is the right fallback.
Severity: Low. No time lost beyond reading the log twice, but it will confuse whoever reads the device log during the run.
Workaround: Install App Tester from the Appstore on the stick, `adb shell setprop debug.amazon.sandboxmode debug`, restart the app, and
check the line is gone (docs/spot-checks/2026-10-14-device-run.md rows 30–31).
Suggestion: In `fireosStore.ts`, map `init-connection` to the unavailable state with a log line that says "Amazon Appstore SDK not
reachable: install Amazon App Tester and set debug.amazon.sandboxmode=debug for sandbox testing", and report upstream to react-native-iap
that the Amazon build's init failure message should not mention Google Play.
Environment: Fire TV Stick AFTSS, Fire OS 7.7.1.7 (Android 9), react-native-tvos 0.81.5-2, react-native-iap ~16.7.2, Expo SDK 54, debug build.
Links:
  - apps/expo/src/fireosStore.ts:36, apps/expo/plugins/withAmazonIap.js, apps/expo/README.md (IAP sandbox section)
  - https://developer.amazon.com/docs/appstore-sdk/appstore-sdk-troubleshooting.html
  - docs/plans/LING-007.md (Manual checklist A), docs/decisions/0012-lingo-plus.md
