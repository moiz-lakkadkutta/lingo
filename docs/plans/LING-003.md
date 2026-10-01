# LING-003 — Player with dual cues, marker, word focus; cue-wise seek; long-press replay; 0.75×

Plan for an Opus implementer. Decision record: `docs/decisions/0006-word-focus.md` (read it first; it fixes the mechanism). Behaviour source: full plan §7.1, §7.3, §8 Player/Explain, §14 (`docs/PLAN.md` links it). LING-004 note in `TASKS.md`: the Explain-card anatomy and the Save UI land here.

Invariants (apply everywhere): sizes are px at 1920×1080 through `px()`; colours only from `tokens` (`packages/shared-ui/src/theme/tokens.ts`); focus = outline + 1.04 scale in 150 ms on buttons, outline only (no scale) on words; every focusable has `aria-label` stating purpose; Noto Sans for everything learner-facing (the `tokens.type` families); `shared-ui` imports nothing outside Vega's supported list (`eslint.config.js` enforces the deny-list; `react-native`, the kit, `@lingo/contracts` are fine); strings go through `strings.ts` and must pass `pnpm lint:words`; the kit's public interfaces are not changed.

Done when: `pnpm typecheck && pnpm test && pnpm lint:words` pass; every `it(...)` in §Acceptance exists and passes; the Fire TV manual steps pass on the stick (or the failures are filed as friction logs and the orchestrator is told).

## Files

Three groups. **G1 and G3 are independent of everything; G2 depends on G1's interfaces (given below, so G2 may start in parallel and run its tests once G1 lands).** One implementer per group.

### G1 — pure logic, tokens, strings (no React Native rendering; vitest in Node)

| File | Change |
|---|---|
| `packages/shared-ui/src/theme/tokens.ts` | add `color.scrim: 'rgba(15,21,27,0.4)'`, `color.stage: '#000000'`; `focus.wordOffset: 2`; `layout.holdBarH: 4`, `layout.wordGap: 12`, `layout.wordPadX: 6`, `layout.sheetW: 640`; `motion.longPressMs: 500`, `motion.seekGraceS: 1`. Nothing else moves. `test/tokens.test.ts` must still pass (the "no pure white" check iterates colours; black is allowed). |
| `packages/shared-ui/src/strings.ts` | add the `player`, `sheet` keys and the new `explain` keys listed in §Strings. Keep existing keys (Quiz uses `explain.continue`). |
| `packages/shared-ui/src/platformCaps.ts` | new: `Caps`, `capsFor(os)`, `caps` (§Interfaces). |
| `packages/shared-ui/src/remote/types.ts` | new: `RawRemoteEvent`, `RemoteSource`, `createRemoteBus()`, `noRemote`. |
| `packages/shared-ui/src/remote/normalise.ts` | new: `normalise(raw)` and `createPressTracker()` (§Interfaces). |
| `packages/shared-ui/src/screens/player/align.ts` | new: `alignHighlights(text, highlights)`, `stripToken(s)`. |
| `packages/shared-ui/src/screens/player/seek.ts` | new: `cueAt`, `lastStartedCue`, `seekTarget`. |
| `packages/shared-ui/src/screens/player/visibility.ts` | new: `nativeVisible(...)`, `statusParts(...)`. |
| `packages/shared-ui/src/screens/player/machine.ts` | new: the state machine (`PlayerState`, `PlayerEvent`, `Effect`, `reduce`, `initialState`). |
| `packages/shared-ui/test/align.test.ts`, `seek.test.ts`, `visibility.test.ts`, `machine.test.ts`, `remote.test.ts`, `caps.test.ts` | the `it(...)` names in §Acceptance, verbatim. |

### G2 — UI (React Native components; no renderer tests, typecheck + lint only)

| File | Change |
|---|---|
| `packages/shared-ui/src/remote/useRemoteKeys.ts` | new hook wiring `RemoteSource` → `normalise` → `createPressTracker` → `onEvent(RemoteEvent)`; subscribes only while `enabled`. |
| `packages/shared-ui/src/components/WordChip.tsx` | new: one word of the target cue, optionally highlighted/focusable (§Interfaces). |
| `packages/shared-ui/src/components/DualCue.tsx` | new: the two-line cue box, rows of `WordChip`s, hold bar. Replaces the kit's `CueOverlay` in the Player (decision 0006). |
| `packages/shared-ui/src/components/index.ts` | export `WordChip`, `DualCue`. |
| `packages/shared-ui/src/screens/player/StatusLine.tsx` | new: 28 px bottom-left status. |
| `packages/shared-ui/src/screens/player/SettingsSheet.tsx` | new: ▲ sheet (Speed · Native line · Subtitle size). |
| `packages/shared-ui/src/screens/Explain.tsx` | rewrite to the fixed anatomy and three actions (§Explain). |
| `packages/shared-ui/src/screens/Player.tsx` | rewrite as a thin shell over `machine.ts`; delete `markHighlights`. |
| `packages/shared-ui/src/index.tsx` | `RootProps.remote?: RemoteSource`; pass `savedIds`, `savedCount`, `remote`, `onPlus`, `onLearnerChange` to `Player`; `save()` returns `'error'` instead of throwing; add `patchLearner` (PUT `/me`). Export `createRemoteBus`, `noRemote`, `RemoteSource`, `RawRemoteEvent`. |

### G3 — platform entries

| File | Change |
|---|---|
| `apps/expo/package.json` | `"react-native": "npm:react-native-tvos@<0.81 line>"` — pick the newest `0.81.x-y` from `pnpm view react-native-tvos versions` (Expo SDK 54 ↔ RN 0.81; the Expo TV guide's alias form). Add devDependency `@react-native-tvos/config-tv`. Keep `react-native-video`. |
| `apps/expo/app.json` | add `"@react-native-tvos/config-tv"` to `plugins` (per the Expo TV guide); keep the Leanback intent filter. |
| `apps/expo/App.tsx` | create one `remoteBus = createRemoteBus()` at module level; render `<RemoteBridge />` next to `<Root remote={remoteBus} …/>`. `RemoteBridge` (same file or `apps/expo/RemoteBridge.tsx`): `useTVEventHandler((e) => remoteBus.emit({ eventType: e.eventType, eventKeyAction: e.eventKeyAction }))` from `'react-native'` (react-native-tvos). |
| `apps/expo/README.md` | the rebuild line: `EXPO_TV=1 npx expo prebuild --clean` then `pnpm --filter @lingo/expo android`; link the Expo TV guide. |
| `apps/vega/App.template.tsx` | same shape; `useTVEventHandler` imported from `'@amazon-devices/react-native-kepler'`; `<Root remote={remoteBus} scale={1} …/>`. |
| `apps/vega/README.md` | one line: the bridge is the only place `@amazon-devices/react-native-kepler` is imported; cite the Vega TVEventHandler doc. |
| `pnpm-lock.yaml` | updated by `pnpm i`. |

No change to `packages/contracts`, `apps/api`, `packages/pipeline`, or `../vega-media-kit`.

## Interfaces (typed; implement exactly)

```ts
// platformCaps.ts
export interface Caps { rate: boolean; wordFocusIn: 'cue' | 'card' }
/** 'kepler' | 'vega' → { rate: false, wordFocusIn: 'cue' }; anything else → { rate: true, wordFocusIn: 'cue' }. Flip wordFocusIn per OS here if a spike fails. */
export function capsFor(os: string): Caps
export const caps: Caps // capsFor(Platform.OS)

// remote/types.ts
export interface RawRemoteEvent { eventType: string; eventKeyAction?: number }
export interface RemoteSource { subscribe(cb: (e: RawRemoteEvent) => void): () => void }
export function createRemoteBus(): RemoteSource & { emit(e: RawRemoteEvent): void }
export const noRemote: RemoteSource // subscribe returns a no-op unsubscribe

// remote/normalise.ts
import type { RemoteKey, RemoteEvent } from '@moizp/vega-media-kit' // mapKey, RemoteKey, RemoteEvent come from the kit's platform module
export type KeyPhase = 'down' | 'up'
/** eventKeyAction 0 → [down]; 1 → [up]; undefined → [down, up]. eventType starting with 'long' → []. Unknown names (mapKey undefined) → []. */
export function normalise(e: RawRemoteEvent): Array<{ phase: KeyPhase; key: RemoteKey }>
export interface PressTracker { down(key: RemoteKey, now: number): RemoteEvent | null; up(key: RemoteKey, now: number): RemoteEvent | null }
/**
 * First down records the time. A later down (repeat) at ≥ longPressMs since the first fires { longPress: true, repeat: false } once,
 * then { longPress: true, repeat: true } for further repeats. Up: if a long press already fired → null; else if now − downAt ≥ longPressMs →
 * { longPress: true, repeat: false }; else { longPress: false, repeat: false }. Up without a down → short press. Per-key state.
 */
export function createPressTracker(longPressMs: number): PressTracker

// screens/player/align.ts
export interface WordSlot { text: string; highlightIdx: number | null }
export interface Alignment { lines: WordSlot[][]; unmatched: number[] }
/** Same strip as packages/pipeline/src/tokenize.ts: /^[^\p{L}\p{N}'’-]+/u and /[^\p{L}\p{N}'’-]+$/u. */
export function stripToken(s: string): string
/**
 * text.split('\n') → lines; each line .split(/\s+/).filter(Boolean) → slots. For each highlight in order: first slot (reading order) with
 * highlightIdx === null whose stripToken(text) === h.word; if none, first with equal lowercase; if none, push the index to `unmatched`.
 */
export function alignHighlights(text: string, highlights: ReadonlyArray<{ word: string }>): Alignment

// screens/player/seek.ts
export function cueAt(cues: readonly CueDto[], s: number): number | null          // startS <= s < endS
export function lastStartedCue(cues: readonly CueDto[], s: number): number | null // last index with startS <= s
/** 'prev': if the last-started cue began more than graceS ago → its startS; else the previous cue's startS; none → 0.
 *  'next': first cue with startS > s + 0.05 → its startS; none → null.
 *  'replay': lastStartedCue's startS; none → 0. */
export function seekTarget(cues: readonly CueDto[], s: number, dir: 'prev' | 'next' | 'replay', graceS?: number): number | null

// screens/player/visibility.ts
export function nativeVisible(a: { setting: 'always' | 'onPause' | 'never'; challenge: boolean; paused: boolean; revealedCue: number | null; cueIndex: number | null }): boolean
// challenge → revealedCue !== null && revealedCue === cueIndex; else always → true; onPause → paused || revealed; never → revealed
export function statusParts(a: { challenge: boolean; rate: 1 | 0.75 }): string[] // ['Challenge'?, '0.75×'?]

// screens/player/machine.ts
export type Phase = 'playing' | 'holding' | 'explain' | 'sheet'
export interface PlayerCtx { cues: readonly CueDto[]; caps: Caps; plus: boolean; challenge: boolean; autoPause: boolean; holdMs: number; chromeMs: number; graceS: number }
export interface PlayerState {
  phase: Phase; positionS: number; cueIndex: number | null; wordIdx: number; rate: 1 | 0.75
  revealedCue: number | null; chromeUntil: number; heldCue: number | null; stageKey: number; ended: boolean
}
export type PlayerEvent =
  | { type: 'position'; s: number; now: number }
  | { type: 'playerState'; s: 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'ended'; now: number }
  | { type: 'key'; key: RemoteKey; longPress: boolean; repeat: boolean; now: number }
  | { type: 'stageSelect'; now: number }
  | { type: 'back'; now: number }
  | { type: 'focusWord'; idx: number }
  | { type: 'action'; action: 'replay' | 'slower' | 'resume'; now: number }
  | { type: 'holdElapsed'; now: number }
  | { type: 'sheetClose'; now: number }
export type Effect =
  | { kind: 'seek'; s: number } | { kind: 'play' } | { kind: 'pause' } | { kind: 'rate'; r: 1 | 0.75 }
  | { kind: 'startHold'; ms: number } | { kind: 'cancelHold' } | { kind: 'end' } | { kind: 'exit'; positionS: number }
export function initialState(startAt: number): PlayerState // phase 'playing', cueIndex null, wordIdx 0, rate 1, chromeUntil 0, stageKey 0
export function reduce(s: PlayerState, e: PlayerEvent, ctx: PlayerCtx): [PlayerState, Effect[]]

// components/WordChip.tsx
export interface WordChipProps {
  text: string; highlighted: boolean; focusable: boolean; saved?: boolean
  label: string                           // aria-label, e.g. strings.explain.wordLabel(word)
  onFocus?(): void; onPress?(): void
  nextFocusDown?: number                  // node handle
  size: number                            // px at 1080p before scale (44 for cue, 32 in the card)
  userScale?: number                      // scales the marker padding with the text
  chipRef?: React.Ref<View>
}
// components/DualCue.tsx
export interface DualCueProps {
  cue: CueDto | null; alignment: Alignment | null; nativeVisible: boolean
  wordFocus: 'cue' | 'card'               // 'cue' → highlighted chips focusable; 'card' → chips not focusable
  focusedIdx: number | null; onFocusWord(idx: number): void
  savedIds: ReadonlySet<string>; userScale: number
  hold: Animated.Value | null             // 0→1 over holdMs while holding; null otherwise
  nextFocusDown?: number                  // Save button handle (chips → card)
  chipRefs?: React.MutableRefObject<Array<View | null>>  // indexed by highlightIdx, for nextFocusUp from the card
  onBlockLayout?(height: number): void    // cue block height, to place the Explain card above it
}
// screens/player/StatusLine.tsx
export function StatusLine(p: { parts: string[]; visible: boolean }): JSX.Element | null
// screens/player/SettingsSheet.tsx
export interface SettingsSheetProps {
  caps: Caps; plus: boolean; rate: 1 | 0.75; nativeLine: LearnerDto['nativeLine']; cueScale: number
  onRate(r: 1 | 0.75): void; onLearnerChange(p: Partial<Pick<LearnerDto, 'nativeLine' | 'cueScale'>>): void
}
export interface SettingsSheetHandle { cycle(dir: -1 | 1): void } // ◄► on the focused row; exposed via forwardRef
// screens/Explain.tsx
export interface ExplainProps {
  cue: CueDto; highlight: HighlightDto | null; alignmentOk: boolean; wordFocus: 'cue' | 'card'
  focusedIdx: number; onFocusWord(idx: number): void
  savedIds: ReadonlySet<string>; savedCount: number; plus: boolean; caps: Caps; rate: 1 | 0.75
  onSave(highlightId: string): Promise<'saved' | 'limit' | 'error'>; onReplay(): void; onSlower(): void; onPlus(): void
  chipRefs: React.MutableRefObject<Array<View | null>>; saveRef: React.RefObject<View>
  bottom: number                          // px from screen bottom: above the cue block
}
// screens/Player.tsx
export interface PlayerProps {
  clip: ClipDetail; learner: LearnerDto; scale: number; challenge: boolean; sessionCode?: string
  savedIds: ReadonlySet<string>; savedCount: number; remote: RemoteSource; caps?: Caps
  onBack(positionS: number): void; onEnd(): void
  onSave(highlightId: string): Promise<'saved' | 'limit' | 'error'>; onPlus(): void
  onLearnerChange(patch: Partial<Pick<LearnerDto, 'nativeLine' | 'cueScale'>>): void
}
// index.tsx
export interface RootProps { apiBaseUrl: string; scale: number; deviceId?: string; transport?: SessionTransport; remote?: RemoteSource }
```

`RemoteKey`/`RemoteEvent`/`mapKey` are the kit's (`@moizp/vega-media-kit`, `src/platform/remote.ts`); the kit's `useRemote` is **not** used (its release path cannot detect a long press without repeats; `createPressTracker` can).

## State machine (`machine.ts`)

`reduce` is pure and total: unknown (state, event) pairs return `[s, []]`. `chrome(s, now) = { ...s, chromeUntil: now + ctx.chromeMs }` is applied by every key, stageSelect, action and phase change. `cueAt`/`seekTarget` from `seek.ts`.
**Entering explain** (Select, Play/Pause, an external pause) sets `cueIndex = cueIndex ?? lastStartedCue(positionS)`, so in a gap the card explains the line that just ended and `cueIndex` is never null while a cue is shown; **leaving** explain or the sheet resets `cueIndex = cueAt(positionS)` so that line is not then held. **Auto-pause holds only on continuous playback**: the position moved forward by 0–1.0 s since the last position event (a larger or backward jump is a seek or a stale report from before one). (Review fixes, approved.)
**Every row that emits `seek(t)` also sets `positionS = t`, `cueIndex = cueAt(cues, t)`, `heldCue = null`** (◄/► short and long, Rewind/Fast-forward, Replay, and seeks out of holding). Otherwise the next position report is read against the cue being left: ► from cue 1 to 6.5 would hold cue 1, the line just skipped; and a replayed line would never auto-pause again. (Review fix, approved by the orchestrator.)

| Phase | Event | Next | Effects |
|---|---|---|---|
| playing | position(s) | positionS = s; cueIndex = cueAt(s); if cueIndex ≠ old and revealedCue ≠ cueIndex → revealedCue = null. If `ctx.autoPause` and old cueIndex `c` is not null and `s ≥ cues[c].endS` and `heldCue ≠ c` → phase holding, heldCue = c, cueIndex = c (the held line stays on screen). `old` is the cue the last seek or position put the state in, never a cue a seek has left | holding case: `pause`, `startHold(holdMs)` |
| playing | key left (short) | chrome; seek state (see above) | `seek(seekTarget(s,'prev'))` |
| playing | key left (longPress, !repeat) | chrome; seek state | `seek(seekTarget(s,'replay'))`, `play` |
| playing | key *, longPress && repeat | — | — |
| playing | key right (short) | chrome; seek state when t is not null | `seek(t)` if `t = seekTarget(s,'next')` not null; else none |
| playing | key rewind / fastForward | as left / right short | |
| playing | key playPause or pause | phase explain, wordIdx 0, chrome | `pause` |
| playing | stageSelect | phase explain, wordIdx 0, chrome | `pause` |
| playing | key up | phase sheet, chrome | — (video keeps playing) |
| playing | key menu | revealedCue = (revealedCue === cueIndex ? null : cueIndex); chrome | — |
| playing | key down / select / play | — | — (select arrives through the stage Pressable; key events named select are ignored in every phase) |
| playing | back | — | `exit(positionS)` |
| playing | playerState paused | phase explain, wordIdx 0, chrome | — (external pause, e.g. Media Controls) |
| playing | playerState ended | ended = true (once) | `end` (only on the first) |
| holding | holdElapsed | phase playing, chrome | `play` |
| holding | stageSelect / key playPause | phase explain, wordIdx 0, chrome | `cancelHold` |
| holding | key left/right/rewind/fastForward (short or long) | phase playing, then the playing row for the same key | `cancelHold`, the playing row's effects, then `play` |
| holding | key up | phase sheet | `cancelHold`, `play` |
| holding | key menu | as playing | — |
| holding | back | — | `cancelHold`, `exit(positionS)` |
| holding | playerState playing | phase playing | `cancelHold` |
| holding | position | — | — |
| explain | focusWord(i) | wordIdx = i | — |
| explain | action replay | phase playing, stageKey + 1, chrome; seek state | `seek(seekTarget(s,'replay'))`, `play` |
| explain | action slower | if `ctx.caps.rate && ctx.plus` → rate = (rate === 1 ? 0.75 : 1) | `rate(r)` in that case; otherwise nothing (the card shows the upsell line itself) |
| explain | action resume / key playPause / back / sheetClose | phase playing, stageKey + 1, chrome | `play` |
| explain | key menu | revealedCue toggle as in playing | — |
| explain | key left/right/up/down/select/rewind/fastForward | — | — (native focus owns the card) |
| explain | playerState playing | phase playing, stageKey + 1 | — |
| explain | playerState ended | ended = true | `end` |
| sheet | key left/right | — | — (the Player forwards these to `SettingsSheetHandle.cycle`, not to `reduce`) |
| sheet | back / sheetClose | phase playing, stageKey + 1, chrome | — |
| sheet | key playPause | phase explain, wordIdx 0 | `pause` |
| sheet | position / playerState | as playing (position keeps tracking; `ended` ends) | |
| any | playerState loading/ready/buffering | — | — |

Effects are applied by `Player.tsx` in order: `seek` → `ref.seek(s)`; `play`/`pause` → `ref.play()/pause()`; `rate` → `ref.setRate(r)`; `startHold` → `Animated.timing(hold, { toValue: 1, duration: ms, useNativeDriver: false })` plus a `setTimeout(ms)` that dispatches `holdElapsed`; `cancelHold` → clear both, `hold.setValue(0)`; `end` → `onEnd()`; `exit` → `onBack(positionS)`.

## Rendering (G2)

**Player.tsx** — `View` flex 1, background `tokens.color.stage`. Children in order: `KitPlayer` (source `{ uri: clip.manifestUrl, type: 'hls' }`, `autoplay`, `startAt: clip.resumeS ?? 0`, `onPosition → position`, `onState → playerState`); the stage `Pressable` (absolute fill, transparent, `aria-label={strings.player.stage}`, `key={state.stageKey}`, `hasTVPreferredFocus={state.phase === 'playing'}`, `focusable={state.phase === 'playing' || state.phase === 'holding'}`, `pointerEvents` `'auto'` in those phases and `'none'` otherwise, `onPress → stageSelect`); `DualCue`; `StatusLine`; `Explain` when phase is `explain`; `SettingsSheet` when phase is `sheet`. `useRemoteKeys(remote, handler, true)`; the handler drops `key === 'select'`, forwards left/right to the sheet ref in phase `sheet`, else dispatches `{ type: 'key', … }`. `BackHandler.addEventListener('hardwareBackPress', () => { dispatch back; return true })` for the Player's lifetime. `alignment = useMemo(alignHighlights(cue.text, cue.highlights))` per cue; `wordFocus = caps.wordFocusIn === 'cue' && alignment.unmatched.length === 0 ? 'cue' : 'card'`. Chrome visibility: `visible = phase !== 'playing' || now < chromeUntil`, with a `setTimeout` to re-render at `chromeUntil`.

**DualCue** — root absolute fill, `pointerEvents="box-none"`, `paddingHorizontal px(96)`, `paddingVertical px(54)`, `justifyContent 'flex-end'`, `alignItems 'center'`, `gap px(8)`. Sizes multiply by `userScale`. Native box (if `nativeVisible && cue.native`): `tokens.color.cueBox`, `paddingHorizontal px(20)`, `paddingVertical px(12)`, `borderRadius 6`, `maxWidth '86%'` (`'100%'`, the full safe width, at `userScale ≥ 1.5`); text `T variant="cueNative" color={tokens.color.nativeCue}`, `numberOfLines={2}`, centred. Target box: same box style; one `View` row per `alignment.lines[i]` (`flexDirection 'row'`, `justifyContent 'center'`, `columnGap px(tokens.layout.wordGap × userScale)`, `flexWrap 'wrap'` as the last resort when a row still does not fit); each slot is a `WordChip` with `size = tokens.type.cueTarget.size`, `highlighted = slot.highlightIdx !== null`, `focusable = wordFocus === 'cue' && highlighted`, `saved = savedIds.has(highlight.id)`, `label = saved ? strings.explain.wordSavedLabel(word) : strings.explain.wordLabel(word)`, `onFocus → onFocusWord(highlightIdx)`. The native box, target box and hold bar sit in one block whose height is reported by `onBlockLayout(h)` so the Player can place the Explain card above it. Hold bar: when `hold` is non-null, a `View` of `height px(tokens.layout.holdBarH)` and the target box's measured width (`onLayout`), containing an `Animated.View` with `backgroundColor tokens.color.interactive` and `width: hold.interpolate({ inputRange: [0, 1], outputRange: [0, boxWidth] })`; `accessibilityLabel={strings.player.hold}`. When `cue` is null render nothing but keep the root mounted.

**WordChip** — `Pressable` (non-focusable chips use `focusable={false}` **and** `pointerEvents="none"` — Vega ignores `focusable` on Pressable). Text `T` with `fontSize px(size)`, `lineHeight px(size * 1.3)`, family `tokens.type.cueTarget.family`; colour `tokens.color.text`, or `tokens.color.ground` on a highlighted chip whose background is `tokens.color.marker` (`paddingHorizontal px(tokens.layout.wordPadX × userScale)`, `borderRadius 3`). Highlighted chips reserve a check slot (a `Check` drawn with Views: Noto Sans has no ✓ glyph), visible when saved, so the line does not reflow on save; a saved chip is announced as `strings.explain.wordSavedLabel(word)` ("Explain <w>, saved"). Focus: an absolutely positioned outline `View` with `left/top/right/bottom = -px(tokens.focus.wordWidth + tokens.focus.wordOffset)`, `borderWidth px(tokens.focus.wordWidth)`, `borderColor tokens.color.focus`, `borderRadius 5`, opacity animated 0→1 in `tokens.motion.focusMs` (native driver); no scale. `aria-label={label}`, `accessibilityRole="button"`.

**StatusLine** — absolute, `left px(96)`, `bottom px(54)`, `T variant="label" color={tokens.color.textSecondary}`, text `parts.join(' · ')`; returns null when `!visible || parts.length === 0`.

**Explain** — the card must never cover the cue (review fix, orchestrator decision). The Player draws the scrim (`View` absolute fill, `backgroundColor tokens.color.scrim`, `pointerEvents none`) **below** `DualCue` while explaining, so the line stays bright; Explain renders only the card, in an absolute wrapper (`left 0`, `right 0`, `alignItems 'center'`, `accessibilityViewIsModal`) whose `bottom` prop = `px(54) + measured cue-block height + px(24)` (fallback `px(300)` before the first layout). Card `View` `width px(880)`, `minHeight px(420)`, `backgroundColor tokens.color.surface1`, `borderRadius 8`, `padding px(32)`, `gap px(12)`. Rows, top to bottom:
1. (only when `wordFocus === 'card'` and `cue.highlights.length > 0`) a row of `WordChip`s, `size = tokens.type.cueNative.size`, one per highlight, focusable, `onFocus → onFocusWord(i)`, `onPress` focuses Save; refs into `chipRefs`.
2. Line 1: word chip (marker background, `T variant="title" color={tokens.color.ground}`, a `Check` (Views) in a reserved slot, visible when saved) · `T body textSecondary` `· ${lemma}` · a chip on `tokens.color.surface2` with `T label` `strings.explain.rankChip(rank, level)`.
3. `T variant="cueTarget"` gloss.
4. `T variant="body" color textSecondary` grammar.
5. `T variant="body"` italic: `“${cue.text.replace('\n', ' ')}”` (the cue is the example, §7.3).
When `highlight` is null (cue without highlights): rows 2–5 are replaced by `T variant="cueTarget"` `cue.native`.
6. Actions row (`flexDirection 'row'`, `gap px(14)`, `marginTop 'auto'`), **never more than three**, each a `Focusable` with `paddingHorizontal px(28)`, `paddingVertical px(16)`:
   - Save: present when `highlight` is non-null. Not saved: label `strings.explain.saveLabel(word)`, text `strings.explain.save`, fill `tokens.color.interactive`, text colour `tokens.color.ground`, `hasTVPreferredFocus`, ref `saveRef`. After `'saved'`: text `strings.explain.savedState`, fill stays `tokens.color.interactive` (§7.1: the marker is never used on a button; the "Saved" text and the chip's check differentiate), label `strings.explain.savedLabel(word)`, press is a no-op. After `'limit'`: this slot becomes `strings.explain.plusCta` (`onPlus`), fill `tokens.color.interactive`. After `'error'`: unchanged, status shows `strings.explain.saveError`.
   - Replay: `strings.explain.replay`, fill `surface2`, `hasTVPreferredFocus` when there is no Save.
   - Slower: only when `caps.rate`. Text `rate === 0.75 ? strings.explain.normalSpeed : plus ? strings.explain.slower : strings.explain.slowerPlus`. Press: `plus ? onSlower() : setStatus(strings.explain.slowerUpsell)`.
7. `T variant="label" color textSecondary`: `status ?? strings.explain.continueHint`, `accessibilityLiveRegion="polite"`.
Status text after Save: `'saved'` → `strings.explain.saved(savedCount + 1)` (the Root's count updates asynchronously; show the optimistic number), `'limit'` → `strings.explain.limit`, `'error'` → `strings.explain.saveError`.
Focus wiring in `useLayoutEffect` after mount and whenever `focusedIdx` changes: `nextFocusUp` of every action = `findNodeHandle(chipRefs.current[focusedIdx] ?? chipRefs.current.find(Boolean))` when `wordFocus === 'cue'`, or the first card chip in `'card'` mode; every chip's `nextFocusDown = findNodeHandle(saveRef.current ?? firstActionRef)`. Left/right between chips and between actions stays platform-default. The card is **not** an RN `<Modal>` (decision 0006 §2).

**SettingsSheet** — absolute panel inside the safe zone, top-right: `right px(96)`, `top px(54)`, `width px(tokens.layout.sheetW)`, `backgroundColor tokens.color.surface1`, `borderRadius 8`, `padding px(24)`, `gap px(8)`. Rows (each a `Focusable`, `label = strings.sheet.rowLabel(name, value)`): Speed (only when `caps.rate`; values `strings.sheet.rateNormal` / `rateSlow`; choosing 0.75× without `plus` → status line `strings.explain.slowerUpsell`, value stays — upsell is one line, no navigation; the change goes through the machine's gated `slower` action), Native line (`strings.settings.nativeLineOpts`, `onLearnerChange({ nativeLine })`), Subtitle size (`[1, 1.25, 1.5]` shown with `strings.sheet.sizeValue(pct)`, `onLearnerChange({ cueScale })`). First row `hasTVPreferredFocus`. Select cycles forward; `cycle(dir)` from the handle cycles the row that last reported `onFocus`. Footer `T label textSecondary`: `strings.sheet.hint`. Native-line and size changes apply immediately in the Player via the learner prop (Root updates `learner` optimistically before the PUT resolves).

**Root** (`index.tsx`) — `remote = props.remote ?? noRemote`; `savedIds = new Set(saved.map(h => h.id))`; `save()` wraps the fetch in try/catch → `'error'`; `patchLearner(p)` sets state first, then `api('/me', { method: 'PUT', body: JSON.stringify(p) })`, ignoring failures (a later `/me` reload corrects); `onPlus = () => setRoute({ name: 'settings' })` (LING-005/007 own the Plus screen).

## Strings (additions to `strings.ts`)

```ts
explain: { …existing,
  continueHint: 'Back to continue watching', slowerPlus: 'Slower · Plus', normalSpeed: 'Normal speed',
  slowerUpsell: 'Slower playback is part of Lingo Plus.', savedState: 'Saved', saveError: 'Couldn’t save. Try again.',
  saveLabel: (w: string) => `Save word: ${w}`, savedLabel: (w: string) => `Saved: ${w}`, wordLabel: (w: string) => `Explain ${w}`, wordSavedLabel: (w: string) => `Explain ${w}, saved`,
  rankChip: (rank: number, level: string) => `rank ${rank} · about ${level}` },
player: { stage: 'Video. Press Select to pause and explain this line.', hold: 'Pausing at the end of the line', challenge: 'Challenge', slow: '0.75×' },
sheet: { title: 'Playback', speed: 'Speed', hint: 'Select or left and right to change · Back to close', rateNormal: '1×', rateSlow: '0.75×', sizeValue: (pct: number) => `${pct} %`, rowLabel: (name: string, value: string) => `${name}: ${value}. Select or left and right to change` },
```
Level chips say "about A2" (levels are approximate, decision 0002). None of the blocked words appear.

## Key handling per OS

Sources: Fire OS = `react-native-tvos` `TVEventHandler` (`eventType` names `left/right/up/down/select/playPause/menu/rewind/fastForward`, `eventKeyAction` 0 down / 1 up; `longLeft`… ignored); Vega = `@amazon-devices/react-native-kepler` `useTVEventHandler` (`playpause`, `skip_backward`, `skip_forward`, 0 pressed-and-repeating / 1 released). Both go through the kit's `mapKey`. Back is `BackHandler` on both. Select is the native press on the focused `Pressable` on both; `select` key events are dropped.

| Remote key | Fire OS name | Vega name | playing | holding | explain | sheet |
|---|---|---|---|---|---|---|
| ◄ short | `left` | `left` | seek to previous/current cue start | cancel hold, seek, play | native focus (chips/actions) | previous value |
| ◄ held ≥ 500 ms | `left` repeats (or long release) | `left` repeats | replay current line | cancel hold, replay | ignored | ignored |
| ► short | `right` | `right` | next cue start (no-op after last) | cancel hold, seek, play | native focus | next value |
| ► held | — | — | ignored | ignored | ignored | ignored |
| ▲ | `up` | `up` | open sheet (keeps playing) | cancel hold, play, open sheet | native: actions → word chips | native: rows |
| ▼ | `down` | `down` | ignored | ignored | native: chips → Save | native: rows |
| Select | stage `onPress` | stage `onPress` | pause → Explain | Explain | press focused chip/action | cycle focused row |
| Play/Pause | `playPause` | `playpause` | pause → Explain | Explain | resume | close sheet, pause → Explain |
| Rewind / FF | `rewind` / `fastForward` | `skip_backward` / `skip_forward` | as ◄ / ► short | as ◄ / ► short | ignored | ignored |
| Menu | `menu` (KEYCODE_MENU) | `menu` | toggle native line for this cue | same | same | ignored |
| Back | `BackHandler` | `BackHandler` (no long-press back on Vega) | exit → `onBack(position)` | exit | resume | close sheet |
| Home / mic | not interceptable | — | — | — | — | — |

Media keys are not on every Fire TV remote (Amazon's remote-input doc); every action above has a D-pad path.

## Acceptance tests (`packages/shared-ui/test/*.test.ts`, vitest, Node)

`align.test.ts`
- it('splits one row per pipeline line break and one slot per whitespace-separated token')
- it('places each highlight on the first unassigned slot whose stripped form equals the word')
- it('matches through trailing punctuation and surrounding quotes')
- it('assigns a repeated word to successive slots in order')
- it('falls back to case-insensitive matching before reporting unmatched')
- it('reports unmatched highlight indexes and leaves every slot null for them')

`seek.test.ts`
- it('cueAt returns the cue whose startS ≤ s < endS and null in a gap')
- it('prev within the grace second goes to the previous cue start')
- it('prev after the grace second goes to the current cue start')
- it('prev on the first cue goes to 0')
- it('next goes to the next cue start and is null after the last cue')
- it('next ignores a cue that starts within 50 ms of the position')
- it('replay returns the start of the last cue that began at or before the position')
- it('seeks resolve inside a gap between cues to the neighbouring cue starts')

`visibility.test.ts`
- it('always shows the native line unless Challenge')
- it('onPause shows when paused or when the current cue is revealed')
- it('never shows only when the current cue is revealed')
- it('Challenge shows only the revealed cue, even when paused')
- it('statusParts lists Challenge and 0.75× in that order and nothing at 1× outside Challenge')

`machine.test.ts`
- it('initialState is playing with no cue, wordIdx 0, rate 1, stageKey 0')
- it('position updates cueIndex and clears the Menu reveal when the cue changes')
- it('stage Select pauses and opens Explain on the current cue with wordIdx 0')
- it('Play/Pause while playing opens Explain; Play/Pause in Explain resumes and bumps stageKey')
- it('short ◄ while playing seeks to the previous cue start and shows chrome')
- it('long ◄ while playing seeks to the current cue start and plays')
- it('long-press repeats change nothing')
- it('► after the last cue emits no effect')
- it('Rewind and Fast-forward behave as short ◄ and ►')
- it('▲ while playing opens the sheet without pausing; Back closes it with a stageKey bump')
- it('Menu toggles the native reveal for the current cue only')
- it('select key events are ignored in every phase')
- it('with autoPause the end of a cue pauses, starts a hold of holdMs and keeps the held cue on screen')
- it('holdElapsed plays again and the same cue does not hold twice')
- it('a key during the hold cancels it: Select opens Explain; ◄ seeks and plays; ▲ opens the sheet')
- it('Back in Explain resumes; Back while playing exits with the position; Back in holding cancels and exits')
- it('focusWord sets wordIdx; replay seeks to the cue start and resumes')
- it('slower toggles the rate only when caps.rate and plus; otherwise the state is unchanged and no effect is emitted')
- it('an external paused report moves playing to explain; an external playing report moves explain to playing')
- it('ended emits end exactly once')
- it('arrow keys in Explain change nothing')
- it('the sheet ignores left and right (the component handles them) and Play/Pause from the sheet opens Explain')

`remote.test.ts`
- it('eventKeyAction 0 is down, 1 is up, absent is down then up')
- it('names starting with long are dropped')
- it('maps react-native-tvos and Vega names through the kit (playPause, playpause, skip_forward, menu)')
- it('a release under longPressMs is a short press')
- it('a repeat past longPressMs fires one long press and the release then fires nothing')
- it('a release past longPressMs without repeats fires a long press')
- it('keys are tracked independently')
- it('createRemoteBus delivers to every subscriber and stops after unsubscribe')

`caps.test.ts`
- it('kepler and vega have no rate; android, ios and web do')
- it('wordFocusIn defaults to cue on every OS')

Existing `tokens.test.ts`, `session.test.ts`, `qr.test.ts` keep passing. `pnpm lint:words` passes.

## Manual device steps (Fire TV Stick, after `EXPO_TV=1 npx expo prebuild --clean`; record in a friction log either way)

1. Open a clip. Target line 44 px bright, native line 32 px cooler above it; the highlighted word sits on the straw marker with dark text; no chrome.
2. Press ►: playback jumps to the next line's start; status line appears bottom-left for ~4 s. Press ◄ twice quickly: first to the current line's start, second to the previous line.
3. Hold ◄ for a second: the current line replays from its start; playback continues.
4. Press Select: picture dims, the line stays, the Explain card shows word · lemma · "rank N · about A2", gloss, grammar, the line in quotes, and Save word / Replay / Slower · Plus (free account). Focus is on Save word (outline + scale).
5. Press ▲: focus moves to the highlighted word in the cue (3 px outline, no scale); with two highlights, ◄► moves between them and the card follows. Press ▼: back to Save word.
6. Press Select on Save word: the word chip gains a check, the hint reads "Saved. 1 words this clip." (phone Live shows the chip within a second if paired, LING-004).
7. Press Slower · Plus (free): the hint reads "Slower playback is part of Lingo Plus."; rate unchanged. On a Plus account: status line shows 0.75× and speech is audibly slower.
8. Press Back: the card closes, playback resumes, focus returns to the stage (press ► once to prove the stage has it).
9. Press Menu with Native line = Never (set in the sheet) or Challenge mode: the native line appears for this line only and is gone on the next line.
10. Enable "Pause at the end of each line" (Settings, LING-005; until then flip `learner.autoPause` in Root's default for the test): at the end of a line playback pauses and a thin blue bar fills under the cue for 2 s, then playback continues; pressing Select during the bar opens Explain.
11. Press ▲ while playing: the sheet opens with Speed / Native line / Subtitle size; ◄► change values; Subtitle size 150 % visibly enlarges both lines; Back closes it.
12. Press Back while playing: returns to Home.
13. VoiceView on: the stage announces "Video. Press Select to pause and explain this line."; chips announce "Explain <word>"; Save announces "Save word: <word>".

## Spikes (precise briefs; Spike role, fable)

**S1 — Fire OS events and chip focus after the react-native-tvos switch** (blocks merge of G2/G3; run on the stick with the G3 branch).
Question: with the stage `Pressable` focused, do `left`/`right`/`up`/`menu`/`playPause` arrive through `TVEventHandler` with `eventKeyAction` 0 then 1, and does holding ◄ deliver repeated action-0 events (expected ~every 50–100 ms) so the long press fires at ≈500 ms while held? With the Explain card open, do `WordChip` `Pressable`s inside the overlay take focus from Save via ▲ (`nextFocusUp` node handle), draw the outline, and return via ▼? Evidence: a logcat line per event (`LINGO-SPIKE eventType action ts`), a photo of the focused chip, and whether `hasTVPreferredFocus` on the remounted stage regains focus after Back. If repeats do not arrive, the release-duration rule in `createPressTracker` already covers long press — note the latency. If chips cannot take focus, set `capsFor('android').wordFocusIn = 'card'` and re-run step 5 in card mode.

**S2 — Vega (when the VVD is installed; Vega is experimental per kit decision 0001)**
Question: (a) does `useTVEventHandler` from `@amazon-devices/react-native-kepler` deliver `left/right/up/menu/playpause` with `eventKeyAction` 0/1 while a `Pressable` has focus, and do repeats arrive while held; (b) do `WordChip` `Pressable`s with `pointerEvents="none"` stay unfocusable and the highlighted ones take focus with the outline; (c) does setting `playbackRate` on the w3cmedia element throw, no-op, or work (expected: unsupported; `caps.rate` stays false unless it works); (d) does the stage remount regain focus via `hasTVPreferredFocus`. Evidence: `journalctl` lines, screenshots, and a friction log for anything that differs from the Vega docs cited in decision 0006.

## Risks

- **react-native-tvos switch** (G3) is a native rebuild of the Fire OS app. It is the combination Amazon's multi-TV sample and the kit's device verification already use, but it must be proven on the stick before merge (S1). Keep the plain-RN package.json diff small so it can be reverted in one commit if S1 fails; in that case ◄► seek/long-press/Play-Pause are unavailable on Fire OS and the Player still works through Select/Back and the card's Replay.
- **Two `hasTVPreferredFocus` owners**: the stage (playing) and Save (explain). They are never mounted with the prop at the same time (stage only in playing/holding); keep it that way.
- **`onPosition` ≤ 4 Hz**: auto-pause lands up to ~250 ms after the cue's end and cue switches lag by the same. Acceptable; do not add a timer-based predictor in this ticket.
- **Fonts**: `NotoSans-*`/`Manrope-*` families are not yet loaded by the apps (`expo-font` plugin lists none); text falls back to the system font until LING-008. Not this ticket.
- **Vega `playbackRate` unsupported**: Slower is absent on Vega by `caps`; the sheet omits Speed. If S2 finds it works, flip `capsFor('kepler').rate`.
- **`nextFocus*` node handles** require mounted refs; wire them in `useLayoutEffect` keyed on `focusedIdx`, and never call `findNodeHandle` during render.
- **Explain scrim intercepts nothing**: the stage is `pointerEvents="none"` while the card is open so Select can never reach it.
- **Kit divergence**: the Lingo Player no longer renders through `CueOverlay`; geometry numbers are copied from `defaultCueTheme` (import the constant, do not retype the numbers). File the KIT follow-up named in decision 0006 after merge.

## Open questions (answer from PLAN.md or ask once; defaults chosen so implementation is not blocked)

1. Example line on the card: the cue itself (§7.3, chosen) or LING-002's second example sentence (`HighlightDto.example`)? Default: the cue; the phone shows `example`.
2. Replay from the card resumes playback (confirmed by the orchestrator) rather than re-pausing at the line's end; with auto-pause on, the hold does that: the seek clears `heldCue`, so a replayed line auto-pauses again at its end (as does long ◄ after a hold).
3. In Challenge mode a cue with no highlights shows its native line inside the Explain card (the learner asked). Confirm this one-button reveal is acceptable for a Plus feature.
4. Free-tier Slower shows "Slower · Plus" and a one-line upsell on the card; `onPlus` navigation is used only for the 20/day limit. Confirm.
5. The react-native-tvos switch for `apps/expo` is app-level (no kit interface change) but is a native rebuild; confirm the human is fine running the prebuild before the Oct 15 freeze.

## Doc URLs

- Vega TVEventHandler: https://developer.amazon.com/docs/react-native-vega/0.72/using_tveventhandler.html
- Vega focus management: https://developer.amazon.com/docs/vega/0.22/focus-management
- Vega Pressable: https://developer.amazon.com/docs/react-native-vega/0.72/pressable.html
- Vega BackHandler: https://developer.amazon.com/docs/react-native-vega/0.72/backhandler.html
- Vega W3C media: https://developer.amazon.com/docs/vega/0.22/media-player.html · `@amazon-devices/react-native-w3cmedia` README (`playbackRate` unsupported): https://www.npmjs.com/package/@amazon-devices/react-native-w3cmedia
- Vega supported libraries: https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html
- Fire TV remote input: https://developer.amazon.com/docs/fire-tv/remote-input.html
- Fire TV design guidelines: https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html
- Expo, building for TV: https://docs.expo.dev/guides/building-for-tv/
- react-native-tvos README: https://github.com/react-native-tvos/react-native-tvos#readme · long ◄►: https://github.com/react-native-tvos/react-native-tvos/discussions/409 · key repeat: https://github.com/react-native-tvos/react-native-tvos/discussions/728
- Amazon multi-TV sample: https://github.com/AmazonAppDev/react-native-multi-tv-app-sample
- react-native-video `rate`: https://docs.thewidlarzgroup.com/react-native-video/component/props#rate · Fire OS 0.75× evidence `../vega-media-kit/docs/device-matrix.md`
- React Native `nextFocus*`: https://reactnative.dev/docs/view#nextfocusdown-android · `BackHandler`: https://reactnative.dev/docs/backhandler
