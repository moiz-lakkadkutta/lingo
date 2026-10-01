# S1 — Fire OS remote events and chip focus (react-native-tvos)

From `docs/plans/LING-003.md` §Spikes. Blocks merge of LING-003 G2/G3. Needs a Fire TV Stick; about 30 minutes.
Record the result in a friction log (`pnpm friction "S1 …"`) whether it passes or not.

## Build

```
cd apps/expo
EXPO_TV=1 npx expo prebuild --clean
EXPO_PUBLIC_LINGO_SPIKE=1 pnpm --filter @lingo/expo android     # stick on adb (adb connect <ip>)
adb logcat -s ReactNativeJS | grep LINGO-SPIKE                  # second terminal
```

`EXPO_PUBLIC_LINGO_SPIKE=1` makes `RemoteBridge.tsx` log `LINGO-SPIKE <eventType> <eventKeyAction> <ms>` per event.

## Checklist

Open a clip so the stage `Pressable` has focus.

- [ ] **Short presses.** Press ◄, ►, ▲, Menu, Play/Pause once each. Each logs `eventKeyAction` 0 then 1 with the expected
      `eventType` (`left`, `right`, `up`, `menu`, `playPause`). Note any key that logs nothing (Menu and media keys are not on
      every remote).
- [ ] **Hold ◄ for about a second.** Repeated `left 0` lines arrive while held (expected every 50–100 ms), and the current line
      replays at about 500 ms, while the key is still down. If no repeats arrive, the release-duration rule in
      `createPressTracker` still fires on release: note the latency you see.
- [ ] **Chip focus.** Press Select to open the Explain card (focus on Save word). Press ▲: a `WordChip` in the cue takes focus
      (`nextFocusUp` node handle) and draws the outline. Press ▼: focus returns to Save word. Take a photo of the focused chip.
- [ ] **Stage focus after Back.** With the card open, press Back. The remounted stage regains focus through
      `hasTVPreferredFocus`: press ► once and check that playback seeks to the next line.

## If it fails

- Chips cannot take focus: set `capsFor('android').wordFocusIn = 'card'` in `packages/shared-ui/src/platformCaps.ts` and re-run
  manual step 5 of the plan in card mode.
- No events at all: revert the react-native-tvos commit (package.json alias, `app.json` plugin, `metro.config.js`). The Player
  still works through Select, Back and the card's Replay, without ◄► seek, long press or Play/Pause.

## Evidence to attach

The `LINGO-SPIKE` logcat lines, the photo of the focused chip, the Fire OS version and remote model.
