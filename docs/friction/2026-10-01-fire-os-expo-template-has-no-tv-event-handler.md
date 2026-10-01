# fire os expo template has no tv event handler

Task attempted: Receive remote keys (D-pad, Select, Play/Pause, Rewind, Fast Forward, Menu) in the Fire OS app
(`apps/expo`) for the LING-003 player.
Steps:
  1. Inspect `apps/expo/package.json`: Expo `~54.0.0` with plain `react-native` `0.81.0`.
  2. Look for `TVEventHandler` / `useTVEventHandler` in plain React Native on Android.
Expected: The Fire OS template can read TV remote events out of the box, since it targets Fire TV.
Actual: Plain React Native has no `TVEventHandler` / `useTVEventHandler` on Android. The D-pad only moves native focus
between focusable views, and media keys (Play/Pause, Rewind, Fast Forward) reach nothing in JS. TV event support comes from
the `react-native-tvos` fork, which Amazon's own cross-OS sample (`react-native-multi-tv-app-sample`) and the media kit's
device verification use.
Severity: Medium — blocks every remote-driven player interaction on Fire OS. The fix is a native rebuild, so it must be
proven on the Fire TV Stick (spike S1) before merge and before the Oct 15 freeze.
Workaround (planned, LING-003 G3): alias `"react-native": "npm:react-native-tvos@0.81.x-y"` (Expo SDK 54 ↔ RN 0.81), add
`@react-native-tvos/config-tv` to devDependencies and to `app.json` plugins, set `EXPO_TV=1`, and run `expo prebuild` to
regenerate the native project.
Suggestion: Ship the Fire OS starter on `react-native-tvos` with `@react-native-tvos/config-tv` already configured, or say in
the Fire TV React Native docs that plain RN cannot receive media keys.
Environment: macOS 26.2, Node 22.19.0, Expo SDK 54, react-native 0.81.0, Fire TV Stick.
Links:
  - Expo, building for TV: https://docs.expo.dev/guides/building-for-tv/
  - react-native-tvos README: https://github.com/react-native-tvos/react-native-tvos#readme
  - Amazon cross-OS sample: https://github.com/AmazonAppDev/react-native-multi-tv-app-sample
  - Fire TV remote input: https://developer.amazon.com/docs/fire-tv/remote-input.html
  - `docs/decisions/0006-word-focus.md` §2, `docs/plans/LING-003.md` (G3, spike S1)
