# S1 — Fire OS remote events and chip focus (react-native-tvos)

From `docs/plans/LING-003.md` §Spikes. Blocks merge of LING-003 G2/G3. Needs a Fire TV Stick; about 45 minutes.
Record the result in a friction log (`pnpm friction "S1 …"`) whether it passes or not.

Expected behaviour is read from react-native-tvos 0.81.5-2 source (`ReactAndroidHWInputDeviceHelper.java`, decision 0006 §3):
key-up only unless `ReactFeatureFlags.enableKeyDownEvents` is on; no key repeats; a D-pad or Select key held past ~300 ms
sends `long<Key>` 0 once (at the first Android key repeat, ~400–500 ms) and `long<Key>` 1 on release. Media keys and Menu have
no long form.

## Build

```
cd apps/expo
EXPO_TV=1 npx expo prebuild --clean
EXPO_PUBLIC_LINGO_SPIKE=1 pnpm --filter @lingo/expo android     # stick on adb (adb connect <ip>)
adb logcat -s ReactNativeJS | grep LINGO-SPIKE                  # second terminal
```

For the API, media and ports on the stick (seed clip, `MEDIA_BASE_URL`, `adb reverse`), follow "Device spike on a Fire TV Stick" in
`apps/expo/README.md`; no proxy is needed.

**Release build for the Menu row (and the rows still open after 2026-10-04).** In a debug build the Menu key opens the React Native
Dev Menu over the Player, so the Player's Menu effect can only be checked on a release build. A release build bundles the JS, so
pass the `EXPO_PUBLIC_*` values at build time:

```
cd apps/expo && EXPO_TV=1 npx expo prebuild --clean          # once, or after native changes
EXPO_PUBLIC_LINGO_SPIKE=1 EXPO_PUBLIC_API_URL=http://localhost:4000 pnpm --filter @lingo/expo android:release
# or with Gradle: cd apps/expo/android && EXPO_PUBLIC_LINGO_SPIKE=1 EXPO_PUBLIC_API_URL=http://localhost:4000 ./gradlew assembleRelease
#                 adb install -r app/build/outputs/apk/release/app-release.apk
```

The release variant is signed with the debug keystore from the prebuild template, so it installs over adb. It does not load Metro,
so JS changes need a rebuild. `console.log` still reaches `adb logcat -s ReactNativeJS`, so the `LINGO-SPIKE` lines work the same.

`EXPO_PUBLIC_LINGO_SPIKE=1` makes `RemoteBridge.tsx` log `LINGO-SPIKE <eventType> <eventKeyAction> <ms>` per event.
`focus -1` and `blur -1` lines also appear as native focus moves; they are expected and ignored.

## 0. Record whether the key-down flag is on

- [ ] `grep -rn enableKeyDownEvents android/app/src/main/java` prints `ReactFeatureFlags.enableKeyDownEvents = true`
      (written by `plugins/withKeyDownEvents.js`). Write down **flag on** or **flag off** in the friction log.
- [ ] Cross-check on the device: a short ◄ press logs `left 0` and then `left 1` (flag on). Only `left 1` means the flag is off.

## 1. Keys while playing

Open a clip, wait until a line is on screen, leave the stage focused. For each key, check both the log and what the Player does.

| Action | Log, flag on | Log, flag off | Player must |
|---|---|---|---|
| ◄ short | `left 0`, `left 1` | `left 1` | jump to the start of the current line (press twice quickly: the previous line) |
| ◄ held ~1 s | `left 0`, `longLeft 0` at ~400–500 ms, `longLeft 1` on release; no `left 1` | `longLeft 0` at ~400–500 ms, `longLeft 1` on release | replay the current line from its start **while the key is still down**, then keep playing |
| ► short | `right 0`, `right 1` | `right 1` | jump to the next line's start; status line shows bottom-left |
| ▲ | `up 0`, `up 1` | `up 1` | open the settings sheet; playback continues |
| Play/Pause | `playPause 0`, `playPause 1` | `playPause 1` | pause and open the Explain card |
| Menu (**release build only**: a debug build opens the Dev Menu) | `menu 0`, `menu 1` | `menu 1` | toggle the native line for this line only (set Native line = Never in the sheet first so the change is visible) |
| Rewind / FF (if the remote has them) | `rewind`/`fastForward` 0 then 1 | 1 only | act as ◄ / ► short |

- [ ] Every row: the log matches the column for your flag state.
- [ ] Every row: the Player did what the last column says. Note any key that logs nothing (Menu and media keys are not on every remote).
- [ ] Held ◄: write down the ms between the first line and `longLeft 0`. That gap is the replay latency.
- [ ] Hold Play/Pause for a second (flag on): note whether `playPause 0` repeats. It has no long form, so repeats are expected.

## 2. Chip focus in the Explain card

- [ ] Press Select to open the Explain card. Focus is on Save word (outline + scale).
- [ ] Press ▲: a `WordChip` in the cue takes focus (`nextFocusUp` node handle) and draws the 3 px outline with no scale. Take a photo.
- [ ] Press ▲ again: focus stays on the chip (pinned to itself since 2026-10-10, decision 0006), never Replay.
- [ ] Press ▼: focus returns to Save word.
- [ ] Press ▼ again on Save word: focus stays on Save word (pinned), never a chip in the cue line.
- [ ] Save word focused: the fill turns light with dark text (tokens.button.primary.focused), an outline sits a few px outside it,
      and the button scales up. The text is easy to read from the sofa. Take a photo. Same for Watch on Clip detail.

## 3. Stage focus after Back

- [ ] With the card open, press Back. The card closes and playback resumes.
- [ ] Press ► once: playback jumps to the next line, which proves the remounted stage regained focus through `hasTVPreferredFocus`.

## Optional: the flag-off pass

Remove `"./plugins/withKeyDownEvents"` from `app.json` plugins, run `EXPO_TV=1 npx expo prebuild --clean` and reinstall, then
repeat section 1 against the flag-off column. Restore the plugin afterwards.

## If it fails

- No `longLeft 0` while held: with the flag on, `createPressTracker` still classes a hold of ≥ 500 ms as long on release (note the
  latency); with the flag off a hold is lost, so keep the flag.
- Chips cannot take focus: set `capsFor('android').wordFocusIn = 'card'` in `packages/shared-ui/src/platformCaps.ts` and re-run
  manual step 5 of the plan in card mode.
- No events at all: revert the react-native-tvos commits (package.json alias, `app.json` plugins, `metro.config.js`). The Player
  still works through Select, Back and the card's Replay, without ◄► seek, long press or Play/Pause.

## Evidence to attach

Flag state, the `LINGO-SPIKE` logcat lines per row, the photo of the focused chip, the Fire OS version and the remote model.
