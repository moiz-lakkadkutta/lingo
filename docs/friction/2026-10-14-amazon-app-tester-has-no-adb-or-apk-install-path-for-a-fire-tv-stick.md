# Amazon App Tester has no adb or APK install path for a Fire TV Stick
Task attempted: Put Amazon App Tester on the Fire TV Stick over adb before the 2026-10-14 device run, so the human only presses buttons
(LING-007 checklist A step 1; video shot S07b needs the App Tester purchase dialog).
Steps:
  1. `adb shell pm list packages | grep -i -E "sdktest|tester"` → nothing installed.
  2. Read https://developer.amazon.com/docs/in-app-purchasing/iap-install-and-configure-app-tester.html: install is "start the Amazon
     Appstore app, search for Amazon App Tester, tap through the prompts"; the only other link is the amazon.com product page
     (B00BN3YZM2). The page gives no APK, no package name (only the adb `appops set com.amazon.sdktestclient SYSTEM_ALERT_WINDOW allow`
     line implies `com.amazon.sdktestclient`), and does not mention `debug.amazon.sandboxmode` at all.
  3. Not tried (the human was already using the remote on the stick): the Appstore deep link
     `adb shell am start -a android.intent.action.VIEW -d "amzn://apps/android?p=com.amazon.sdktestclient"` may open the detail page, but
     the Get step would still be a remote press, so it saves one search at most.
Expected: A developer tool for sideloading-style testing can itself be installed from a shell (`adb install`), like the Vega App Tester
(`vega install`), so an agent can prepare the stick unattended.
Actual: The human must install it with the remote through the Appstore UI. The sandbox switch (`adb shell setprop debug.amazon.sandboxmode
debug`) is documented on the Appstore SDK troubleshooting page, not on the App Tester page.
Severity: Low. About 15 minutes; one manual step for the human (checklist row 30).
Workaround: Checklist row 30: Fire TV home → Find → "Amazon App Tester" → Get; then the adb lines for appops, the JSON push and the
sandbox property.
Suggestion: Amazon could publish App Tester as a downloadable APK for developers (as the Fire TV docs do for other tools) and put the
sandboxmode property on the install page. Our side: keep `LINGO_PLUS_MODE=demo` as the filming fallback (decision 0012).
Environment: Fire TV Stick AFTSS, Fire OS 7.7.1.7, adb over Wi-Fi (192.168.1.232:5555), macOS host.
Links:
  - https://developer.amazon.com/docs/in-app-purchasing/iap-install-and-configure-app-tester.html
  - https://developer.amazon.com/docs/appstore-sdk/appstore-sdk-troubleshooting.html
  - docs/plans/LING-007.md (Manual checklist A), apps/expo/README.md (IAP sandbox), docs/spot-checks/2026-10-14-device-run.md
