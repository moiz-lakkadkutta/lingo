# 0006 — Word focus in the Player, and where remote keys come from

Status: accepted (LING-003 plan, 2026-10-01). Supersedes the mechanism named in the LING-003 ticket text ("CueOverlay `selectable` mode"); the behaviour the plan asks for is unchanged.

## Context

The plan (§7.1, §8 Player/Explain, §14) wants: while paused, ◄► moves a focus outline (3 px, 2 px offset, no scale) between words of the current target-language cue and the Explain card follows the focused word; while playing, ◄► seeks by cue, long-press ◄ replays the line, Select/Pause opens Explain, Menu reveals the native line in Challenge mode, ▲ opens a settings sheet. The marker colour (`tokens.color.marker`) sits only on the word to learn. The fallback named in §14 is "the Explain card shows the cue's highlighted words as a focusable row".

What the pieces actually offer today:

1. **Kit `CueOverlay.selectable`** (`../vega-media-kit/src/cues/CueOverlay.tsx`) is *controlled only*: it takes `focusedIndex` and declares `onFocusWord` but never calls it; it renders the primary cue as nested `<Text>` with `textDecorationLine: 'underline'` on the focused word; it strips every inline tag, so the `<b>` the current `Player.markHighlights` injects is lost; and the kit is colour-free by rule (`../vega-media-kit/CLAUDE.md`), so the marker background cannot live there. Nested `<Text>` cannot draw a border on Android, so the specified outline is unreachable with this renderer.
2. **Fire OS**: `apps/expo` runs plain `react-native 0.81.0`. Plain RN has no `TVEventHandler`/`useTVEventHandler` on Android; D-pad only moves native focus between focusable views, and media keys (Play/Pause, Rewind, FF) reach nothing. Amazon's own cross-OS sample (`react-native-multi-tv-app-sample`, the setup the kit was device-verified with) runs Expo on `react-native-tvos`, which emits `eventType` (`left`, `right`, `select`, `playPause`, `menu`, …) with `eventKeyAction` 0 = down / 1 = up on Android TV, plus `longLeft`/`longRight`/`longSelect`.
3. **Vega**: `useTVEventHandler` is imported from `@amazon-devices/react-native-kepler` (a native import `shared-ui` may not make), emits `up/down/left/right/select/back/menu/playpause/skip_backward/skip_forward/…` with `eventKeyAction` 0 pressed (repeated while held) / 1 released, and "doesn't allow overriding the default behavior": a key event is observed, never consumed, so native focus moves regardless. Focus is Cartesian with no platform ring; `Pressable` supports `onFocus`/`onBlur`, `hasTVPreferredFocus` (initial mount only), `nextFocus*`, `aria-label`, `onLongPress` (500 ms). `BackHandler` publishes nothing while an RN `<Modal>` is open.
4. **Playback rate**: react-native-video `rate` 0.75 is device-verified on the Fire TV Stick (`../vega-media-kit/docs/device-matrix.md`). The Vega W3C media README lists `playbackRate` under *unsupported* `HTMLMediaElement` features.
5. **Data**: `CueDto.text` is pre-wrapped by the pipeline (`'\n'`, ≤ 2 lines × 42 chars, `packages/contracts/src/prepared.ts`), and `CueDto.highlights[].word` is the surface form with punctuation stripped (`packages/pipeline/src/tokenize.ts`). There is no token index on a highlight. Explanations (gloss/grammar) exist only for highlighted words (LING-002).

## Options

**A. Kit `selectable` driven by remote key events.** Player keeps `wordIdx`, feeds `focusedIndex`, moves it on ◄► events while paused. Rejected: (i) underline-only focus and no marker — fails the §7.1 spec; (ii) on Vega the same ◄► also moves native focus between the Explain card's buttons, and on both OSes two focus systems disagree about "where the user is"; (iii) needs per-OS key plumbing for the paused state, the most focus-sensitive moment.

**B. Native focus over per-word `Pressable`s in a Lingo-owned cue renderer (chosen).** `packages/shared-ui/src/components/DualCue.tsx` renders the target line as rows of word views (one row per pre-wrapped line), the native line as plain text, using the kit's geometry constants (`defaultCueTheme`: 96/54 inset, 20/12 padding, radius 6, line-height 1.3, 0.65 box) and Lingo's colours. Highlighted words are `Pressable`s: marker background, dark text, `aria-label` "Explain <word>", focus = `tokens.focus.wordWidth` outline at `tokens.focus.wordOffset`, no scale. `onFocus` sets the Explain card's word. ◄► is then the platform's own focus movement — no key events, no OS branch, VoiceView labels for free. ▲ from the card's action row → the word row; ▼ → back to Save (explicit `nextFocus*`).

**C. Words row inside the Explain card (the §14 fallback, kept).** The same `WordChip` component rendered as a row above the gloss; cue words are not focusable. Selected per OS by one constant (`caps.wordFocusIn`) and automatically for any cue whose highlight cannot be aligned to a word in the text (B needs an alignment; C does not).

**D. Extend the kit's `CueOverlay` with a `renderWord` render-prop and view-based rows in `selectable` mode.** The right long-term home, but a cross-repo interface change (ORCHESTRATOR §6 escalation) and the kit's Vega surface is deferred (kit decision 0001). Filed as a follow-up, not a dependency.

**Remote keys while playing** (seek, long-press replay, Play/Pause, Menu, ▲): there is no focusable to move, so these *must* be key events. Options were (a) `react-native-keyevent` (not on Vega's list, native), (b) invisible `nextFocus*` neighbour views (no long-press, no media keys), (c) a `RemoteSource` injected by each platform entry, mirroring `SessionTransport` (decision 0005). Chosen: (c), with `apps/expo` moved to `react-native-tvos` and `apps/vega` bridging `useTVEventHandler` from `@amazon-devices/react-native-kepler`. Both feed raw `{ eventType, eventKeyAction }` into the kit's `useRemote` key-down/key-up model, which already derives long-press at 500 ms from held repeats.

## Decision

1. Word focus is **native focus over highlighted-word `Pressable`s** rendered by `DualCue` in `shared-ui` (B). The kit's `CueOverlay` is not used by the Lingo Player; `KitPlayer` still owns playback. Only highlighted words (1–2 per cue) are focusable: a non-highlighted word has nothing to explain, and making it focusable would open an empty card. The fallback (C) ships behind `caps.wordFocusIn: 'cue' | 'card'` in `packages/shared-ui/src/platformCaps.ts` (default `'cue'` on both OSes) and is forced per cue when `alignHighlights` cannot place a highlight.
2. The paused state never consumes remote key events for navigation. The Player's key handling (`useRemoteKeys`) is active only in the `playing`/`holding` phases, plus Play/Pause and Menu in every phase. Back is `BackHandler`, never a TV event, and the Explain card is an absolutely positioned view, never an RN `<Modal>` (Vega swallows back events behind a Modal).
3. Remote keys enter `shared-ui` through a `RemoteSource` prop on `Root` (`subscribe(cb) → unsubscribe`, raw `{ eventType: string; eventKeyAction?: number }`), defaulting to a no-op source so tests and the web harness need nothing. `apps/expo` switches to `react-native-tvos` (Expo SDK 54 line) and bridges `TVEventHandler`; `apps/vega` bridges `useTVEventHandler` from `@amazon-devices/react-native-kepler`. Normalisation (`eventKeyAction` 0 → keyDown, 1 → keyUp, absent → down+up; name mapping through the kit's `mapKey`; `long*` names ignored because the kit's timer already derives long-press) is a pure function with tests.
4. 0.75× is offered only where the adapter can honour it: `caps.rate` is `true` on Fire OS/web and `false` on Vega (`Platform.OS` `kepler`/`vega`), and gated by `learner.plus` (free tier sees "Slower · Plus" and an upsell line, never a silent no-op). On Vega the Slower action and the Speed row are absent, not disabled.
5. Focus restoration after the card closes uses a remount of the full-screen stage `Pressable` (`key` bump) so `hasTVPreferredFocus` applies again on both OSes (Vega honours it on initial mount only).

## Consequences

- `Player.markHighlights` and the `<b>` convention go away; the marker is a view style in `DualCue`. `tokens` gain `color.scrim`, `color.stage`, `focus.wordOffset`, `layout.holdBarH`, `motion.longPressMs`.
- A kit follow-up ticket (KIT: "CueOverlay selectable as view rows + `renderWord`") can later upstream `DualCue`'s row renderer without changing Lingo's behaviour. Until then Described and Lingo render cues differently; both keep the same geometry numbers from `defaultCueTheme`.
- `apps/expo` needs a native rebuild (`EXPO_TV=1 npx expo prebuild --clean`) — a device check is on the LING-003 done-list, and the result goes in a friction log either way.
- Two device spikes are open (see `docs/plans/LING-003.md` §Spikes): Fire OS after the RNTV switch (events + chip focus), and Vega when the VVD exists (events, chip focus, `playbackRate` behaviour). A failed chip-focus spike flips `caps.wordFocusIn` to `'card'` for that OS; nothing else changes.
- Non-highlighted-word explanations ("what does *Stunden* mean?") become an LING-002 follow-up (on-demand gloss); the renderer already has a slot per word, so enabling them later is a data change.

## Doc URLs

- Vega TVEventHandler (event names, `eventKeyAction`, no override): https://developer.amazon.com/docs/react-native-vega/0.72/using_tveventhandler.html
- Vega focus management (Cartesian focus, `hasTVPreferredFocus` initial mount, `nextFocus*`, `onFocus`/`onBlur`, no platform ring, FocusManager): https://developer.amazon.com/docs/vega/0.22/focus-management
- Vega Pressable (`onLongPress` 500 ms, `aria-label`): https://developer.amazon.com/docs/react-native-vega/0.72/pressable.html
- Vega BackHandler (no events behind a Modal; no long-press back): https://developer.amazon.com/docs/react-native-vega/0.72/backhandler.html
- Vega W3C media overview: https://developer.amazon.com/docs/vega/0.22/media-player.html · package README listing `playbackRate` as unsupported: https://www.npmjs.com/package/@amazon-devices/react-native-w3cmedia
- Vega supported libraries (socket.io 4.7.5, react-native-svg, expo-font; TVFocusGuideView): https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html
- Fire TV remote input (keycodes; Home and mic not interceptable; media keys not on every remote): https://developer.amazon.com/docs/fire-tv/remote-input.html
- Fire TV design guidelines (focus must be visible, physical): https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html
- Expo, building for TV (react-native-tvos alias, `@react-native-tvos/config-tv`, `EXPO_TV=1`): https://docs.expo.dev/guides/building-for-tv/
- react-native-tvos README (TVEventHandler, `nextFocus*`, `focusable`, TVFocusGuideView; "Expo SDK 54 and RNTV 0.81"): https://github.com/react-native-tvos/react-native-tvos#readme · long-press on ◄► and `eventKeyAction` 0/1: https://github.com/react-native-tvos/react-native-tvos/discussions/409 · key repeat: https://github.com/react-native-tvos/react-native-tvos/discussions/728
- Amazon cross-OS sample (Expo + react-native-tvos + shared-ui, the kit's verified setup): https://github.com/AmazonAppDev/react-native-multi-tv-app-sample
- react-native-video `rate` prop: https://docs.thewidlarzgroup.com/react-native-video/component/props#rate · Fire OS 0.75× evidence: `../vega-media-kit/docs/device-matrix.md`
- React Native `nextFocus*` (Android TV) https://reactnative.dev/docs/view#nextfocusdown-android · `BackHandler` https://reactnative.dev/docs/backhandler
