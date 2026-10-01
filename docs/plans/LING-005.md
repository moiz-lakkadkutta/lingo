# LING-005 — Home, Clip, Summary, Quiz (TV), Words, Settings, First run (placement)

Plan for Opus implementers. Behaviour source: full plan §2 (placement, level nudges), §6 (API), §7 (design), §8 (TV screens); the TASKS.md follow-up from LING-001 (decision 0007 M5); decisions 0002 (wording), 0005 (session), 0006 (focus, remote keys, BackHandler).

Invariants (apply everywhere): sizes are px at 1920×1080 through `px()`; colours only from `tokens`; focus = outline + 1.04 scale in 150 ms (the existing `Focusable`), never colour alone; every focusable has an `aria-label` of purpose; Noto Sans for learner-facing text, Manrope only through `variant="display"`; `shared-ui` imports nothing outside Vega's supported list (`packages/shared-ui/eslint.config.js`); every learner-facing string goes through `strings.ts` and passes `pnpm lint:words`; no `'✓'` glyph (Noto Sans lacks it; use `components/Check.tsx`); no RN `<Modal>` (Vega swallows Back behind it, decision 0006 §2); exactly **one** `hasTVPreferredFocus` per mounted screen state.

Done when: `pnpm typecheck && pnpm test && pnpm lint:words` pass (the known `apps/expo/RemoteBridge.tsx` TS2305 baseline failure excepted); every `it(...)` in §Acceptance exists and passes; `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/test pnpm --filter @lingo/api exec prisma migrate deploy` applies the new migration cleanly; the manual device steps are written up as a checklist for the stick (no device in this environment).

Out of scope (owned elsewhere): phone app, `x-session-code`, `GET /me/words` and `POST /me/reviews` changes (LING-006); the Plus screen, IAP, Content Launcher, Personalization, Media Controls (LING-007); fonts loading, Vega build, docs (LING-008). Polly pronunciation on Clip word chips (§8 "tap to hear") is **not** in this ticket: it would add an AWS call; chips are display-only. Streak/"Welcome back" computation lives with Progress (LING-006); see Open question 6.

---

## 0. Decisions this plan makes (record as `docs/decisions/0009-tv-navigation-and-level.md` after merge — orchestrator)

1. **Navigation is a hand-rolled stack, not react-navigation.** react-navigation v6 is on Vega's supported list, but it is not installed and its native-stack needs `react-native-screens`/`safe-area-context` on both OSes (a native rebuild for nothing we need). A pure reducer (`nav/stack.ts`) plus one `BackHandler` listener in Root is Vega-safe by construction, testable in Node, and matches what Root already does (a `route` switch). Only the top route is mounted.
2. **Focus memory = remount + `hasTVPreferredFocus` on the remembered element.** Vega honours `hasTVPreferredFocus` on initial mount only (decision 0006 §5); because popped-back screens remount, the remembered element mounts with the prop and takes focus on both OSes. Memory is a per-route-key map of element ids (`nav/focusMemory.ts`), held by Root for the app's lifetime. The kit's `useFocusMemory` is not used: its module-global map cannot be reset from tests (`_resetFocusMemory` is not exported from the kit index) and its resolver model is imperative.
3. **◄► "change values" on Words and Settings uses the `RemoteSource`** (`useRemoteKeys`, decision 0006 §3): both screens are single vertical columns with no horizontal focus neighbours, so native focus does not move on ◄► and the key events are free to drive the value. Rail is rendered on Home only, so nothing sits to the left of those columns.
4. **Level rule** (`PUT /me/level`, source `quiz`): attempts since the learner's last level change are considered; an attempt is *eligible* when the quiz had ≥ 5 items and the clip's level ≥ the learner's level at the time; ineligible attempts neither count nor break a run; consecutive attempts on the same clip collapse to the latest; when the two newest eligible attempts are on distinct clips and both ≥ 90 % → up one band (B2 stays B2) and `levelChangedAt = now`. Never down automatically (Settings can lower it). Placement and Settings also set `levelChangedAt`.
5. **M5 is applied in `GET /clips/:slug`**: a highlight is returned only when `rank ≥ BANDS[NEXT[learner.level]][0]` (A1 → 1000, A2 → 2000, B1 → 4000, B2 → 4000); `wordsYoullMeet` = first 8 distinct lemmas of the filtered set in cue order. `BANDS`/`NEXT`/`LEVELS` move to `@lingo/contracts` (`base.ts`); `packages/pipeline/src/highlights.ts` imports and re-exports them. `Learner.knownRank` is **dropped** (derivable from `level` × `BANDS`; nothing reads it).
6. **`PUT /me` stays as already narrowed in the working tree** (uncommitted at planning time: `LearnerSettingsPatch` strict in `packages/contracts/src/index.ts`, `NativeLine` enum + `nativeLine`/`autoPause`/`cueScale` columns in migration `20261001231452_learner_settings`, `apps/api/test/me.test.ts`, `packages/shared-ui/src/lib/learnerPatch.ts`). LING-005 builds on it and does not redefine any of it. Level changes only through `PUT /me/level`.
7. **"Learned" = SM-2 interval ≥ 21 days** (Anki's "mature" threshold, https://docs.ankiweb.net/getting-started.html#cards). **"Due today" = due ≤ end of the local day.**
8. **New TV-only routes go in a new router file** `apps/api/src/routes/learning.ts`, mounted at `/me` *before* the existing `me` router, with its own device-id learner lookup (same as `catalog.ts`). This keeps LING-005 out of the `learner()` helper in `me.ts`, which LING-006 rewrites for `x-session-code`.

---

## 1. Work split (who can run in parallel)

```
Phase 1:  A1 contracts ───────────────┐            (small; everything imports it)
Phase 2:  A2 API + Prisma   ║   B shared-ui foundation (nav, api client, selectors, strings, components, session)
Phase 3:  C1 Home + Clip    ║   C2 Summary + Quiz + Words   ║   C3 Settings + About + First run + Pair
Phase 4:  D Root wiring (app/Root.tsx), render smoke tests, manual checklist
```
A2 is independent of B/C/D (only A1's types). C1–C3 are independent of each other: each screen is prop-driven, all strings and shared components land in B, and each C chunk only adds its own files. D only edits `app/Root.tsx`, `index.tsx` and `test/root.test.tsx`. One implementer per chunk.

---

## 2. Files

### A1 — contracts (`packages/contracts`)

| File | Change |
|---|---|
| `src/base.ts` | add `LEVELS`, `BANDS`, `NEXT`, `highlightFloor` (moved from pipeline; values unchanged). |
| `src/tv.ts` | **new**: `NATIVE_LANGS`, `ProgressPut`, `LevelPut`, `LevelResult`, `LibraryWord` (§3). No clip schemas here (they would import `index.ts` → cycle). |
| `src/index.ts` | (1) `export { LEVELS, BANDS, NEXT, highlightFloor } from './base'` next to the existing `export { Lang, Level } from './base'`; (2) `export * from './tv'` after `export * from './ai'`; (3) `ClipCard` gains `completed: z.boolean().default(false), attribution: z.string().default('')`; (4) `ClipDetail` drops its own `attribution` (inherited now); (5) three new lines right after `ClipDetail`: `ClipReady`, `ClipPreparing`, `ClipResponse` (§3), plus their types on the type-export line. No other line changes. |
| `test/tv.test.ts` | **new** (contracts already has vitest). |
| `packages/pipeline/src/highlights.ts` | delete the local `BANDS`/`NEXT` consts and `highlightFloor`; `import { BANDS, NEXT, highlightFloor } from '@lingo/contracts'` and `export { BANDS, NEXT, highlightFloor }`. `prepare.ts` re-export stays as is. Pipeline tests must stay green unchanged. |

### A2 — API (`apps/api`)

| File | Change |
|---|---|
| `prisma/schema.prisma` | (`NativeLine`, `nativeLine`, `autoPause`, `cueScale` already exist — do not touch.) `Learner`: add `levelChangedAt DateTime?`, `quizAttempts QuizAttempt[]`; **remove** `knownRank`. `Clip`: add `quizAttempts QuizAttempt[]`. New `model QuizAttempt { id String @id @default(cuid()) learnerId String learner Learner @relation(fields:[learnerId], references:[id], onDelete: Cascade) clipId String clip Clip @relation(fields:[clipId], references:[id], onDelete: Cascade) correct Int total Int at DateTime @default(now()) @@index([learnerId, at]) }`. Additive lines only, plus the one `knownRank` deletion. |
| `prisma/migrations/<ts>_ling005_level_attempts/migration.sql` | generated: `pnpm --filter @lingo/api exec prisma migrate dev --name ling005_level_attempts --create-only`; the timestamp must sort **after** `20261001231452_learner_settings`. Then `migrate deploy`; `pnpm db:generate`. |
| `src/lib/levelRule.ts` | **new**, pure: `levelAfterQuiz` (§3). |
| `src/lib/library.ts` | **new**, pure: `toLibraryWord(row, cdn)`, `isLearned(intervalD)`. |
| `src/routes/learning.ts` | **new** router: `PUT /progress`, `PUT /level`, `GET /library` (§4). |
| `src/routes/catalog.ts` | rewrite per §4 (rows, `completed`, `attribution`, fresh = last 7 days, optional `?learning=&level=` overrides). |
| `src/routes/clips.ts` | rewrite per §4 (learner lookup, M5 filter, `wordsYoullMeet` from the filtered set, `resumeS`/`completed` from Progress, `status: 'preparing'` for unpublished, 404 for unknown). |
| `src/routes/me.ts` | **no change** (already narrowed to `LearnerSettingsPatch`; LING-006 owns `learner()` there). |
| `src/app.ts` | **two lines**: `import { learning } from './routes/learning'` and `app.use('/me', learning)` placed **immediately before** `app.use('/me', me)`. |
| `test/levelRule.test.ts`, `test/catalog.test.ts`, `test/clips.test.ts`, `test/learning.test.ts` | **new** (§Acceptance). DB tests follow `test/realtime.test.ts`: unique device ids `test-005-<rnd>`, clips with slug prefix `test-005-`, `afterAll` deletes learners first (SavedWord → Highlight has no cascade), then clips, then `db.$disconnect()`. |

### B — shared-ui foundation (`packages/shared-ui/src`)

| File | Change |
|---|---|
| `nav/stack.ts` | **new**, pure: `Route`, `NavState`, `NavAction`, `navReduce`, `routeKey`, `canPop`, `top`. |
| `nav/focusMemory.ts` | **new**, pure: `createFocusMemory`, `pickPreferred`. |
| `api/client.ts` | **new**: `ApiError`, `NetworkError`, `createApi`. |
| `api/endpoints.ts` | **new**: typed calls (§3). |
| `data/resource.ts` | **new**: pure `resourceReducer` + hook `useResource`. |
| `a11y.ts` | **new**: `announce(text)` (guarded `AccessibilityInfo.announceForAccessibility`). |
| `app/selectors.ts` | **new**, pure: `pickHero`, `homeRows`, `nextClip`, `formatMinutes`, `formatClock`, `progressBody`, `dueLabel`, `isDueToday`, `filterWords`, `speakOptions`. |
| `settings/options.ts` | **new**: `LINES`, `SIZES`, `step` (moved out of `SettingsSheet.tsx`; `SettingsSheet.tsx` imports them — a 3-line edit, behaviour unchanged). |
| `strings.ts` | additions/changes in §Strings. Do not touch the `plus` key (LING-007). |
| `components/Focusable.tsx` | add optional `nextFocusLeft?`, `nextFocusRight?` (passed through `tvFocusProps`), and `disabled?` (sets `aria-disabled`, no `onPress`). Additive. |
| `components/Card.tsx` | new props (§3): level chip on `surface2` with `text` colour (not `badge`/marker), duration chip bottom-right on `cueBox`, optional resume bar, focus pass-throughs. `tokens.color.badge` stays defined (unused). |
| `components/LevelChip.tsx` | **new**. |
| `components/Skeleton.tsx` | **new**: `SkeletonBlock`, `SkeletonCard`, `SkeletonRow`. |
| `components/StateMessage.tsx` | **new**: centred title/body + 1–3 actions, live region; the empty/error/offline/preparing pattern. |
| `components/Button.tsx` | **new**: the primary/secondary `Focusable` used by every screen (fill `interactive` + `ground` text, or `surface2` + `text`), `paddingHorizontal px(28)`, `paddingVertical px(16)`. |
| `components/MiniPlayer.tsx` | **new**: `KitPlayer` that plays one cue span and pauses at its end. |
| `components/Rail.tsx` | rewrite (§Rendering): expands to an overlay on focus; refs for `nextFocus*`. |
| `components/index.ts` | export `LevelChip`, `Skeleton*`, `StateMessage`, `Button`, `MiniPlayer` (append lines). |
| `session/types.ts` | `SessionTransport` gains `quizStart(p: z.input<typeof QuizStartPayload>): void`. New `PhoneQuizState` + `phoneQuizReducer` (do **not** add fields to `SessionState`; the `initialSession` test asserts its exact shape). |
| `session/socketTransport.ts` | implement `quizStart` (`socket?.emit('quiz:start', p)`). |
| `session/useSession.ts` | return `SessionHandle = SessionState & { phoneQuiz: PhoneQuizState; startPhoneQuiz(clipSlug: string): void }`; subscribe to `quiz:result` (only while a phone quiz is `sent`) → `phoneQuizReducer`. |
| `test/stubs` / `test/setup.tsx` | add `AccessibilityInfo: { announceForAccessibility: vi.fn(), isScreenReaderEnabled: async () => false }` to the mocked module (additive). Update the fake transport in `test/session.test.ts` with a `quizStart: vi.fn()`. |
| `test/nav.test.ts`, `focusMemory.test.ts`, `api.test.ts`, `resource.test.ts`, `selectors.test.ts`, `phoneQuiz.test.ts`, `components.test.tsx` | **new** (§Acceptance). |

### C1 — Home + Clip

| File | Change |
|---|---|
| `screens/Home.tsx` | rewrite (§Rendering). |
| `screens/Clip.tsx` | **new**. |
| `test/home.test.tsx`, `test/clip.test.tsx` | **new**. |

### C2 — Summary + Quiz + Words

| File | Change |
|---|---|
| `screens/Summary.tsx` | rewrite. |
| `screens/quiz/machine.ts` | **new**, pure quiz reducer. |
| `screens/Quiz.tsx` | rewrite as a shell over the machine. |
| `screens/Words.tsx` | **new**. |
| `test/quizMachine.test.ts`, `test/summary.test.tsx`, `test/quiz.test.tsx`, `test/words.test.tsx` | **new**. Render tests `vi.mock('../src/components/MiniPlayer', () => ({ MiniPlayer: (p) => React.createElement('MiniPlayer', p) }))`. |

### C3 — Settings + About + First run + Pair

| File | Change |
|---|---|
| `screens/settings/model.ts` | **new**, pure: rows + `cycleSetting` + `selectSetting`. |
| `screens/Settings.tsx` | **new**. |
| `screens/About.tsx` | **new**. |
| `screens/firstRun/placement.ts` | **new**: `PLACEMENT` items (§Placement content), `placeLevel`. |
| `screens/firstRun/machine.ts` | **new**, pure first-run reducer. |
| `screens/FirstRun.tsx` | **new**: four panels. |
| `screens/Pair.tsx` | edit: one persistent action button (`Later` → `Continue` when connected, same element so focus stays), `Check` instead of `'✓'`, optional `embedded` prop (no display title when used inside First run? — no: keep title; `embedded` only changes the button text to `strings.firstRun.done` when connected). |
| `test/settingsModel.test.ts`, `test/placement.test.ts`, `test/firstRunMachine.test.ts`, `test/settings.test.tsx`, `test/firstRun.test.tsx`, `test/pair.test.tsx` | **new**. |

### D — Root wiring

| File | Change |
|---|---|
| `app/Root.tsx` | **new**: the `Root` component moves here from `index.tsx` and is rebuilt over `navReduce` (§Root). `RootProps` unchanged. |
| `index.tsx` | becomes exports only: keep every current export line; replace the inline `Root` with `export { Root } from './app/Root'; export type { RootProps } from './app/Root'`; add `export type { Route } from './nav/stack'`. |
| `test/root.test.tsx` | **new**: boot/first-run/offline/back wiring with a fake `fetch` and fake transport. |

**No change**: `apps/expo/App.tsx`, `apps/vega/App.template.tsx` (Root's props are unchanged), `Player.tsx`, `Explain.tsx`, `machine.ts` of the Player, `apps/api/src/routes/{sessions,iap}.ts`, `sockets.ts`, `sm2.ts`, the kit.

---

## 3. Interfaces (typed; implement exactly)

```ts
// ── packages/contracts/src/base.ts (moved; values unchanged) ──
export const LEVELS = ['A1', 'A2', 'B1', 'B2'] as const
export const BANDS: Record<Level, [number, number]> = { A1: [0, 1000], A2: [1000, 2000], B1: [2000, 4000], B2: [4000, 8000] }
export const NEXT: Record<Level, Level> = { A1: 'A2', A2: 'B1', B1: 'B2', B2: 'B2' }
/** The lowest rank a highlight may have for a clip (pipeline) or a learner (API, decision 0007 M5) at `level`. */
export function highlightFloor(level: Level): number // BANDS[NEXT[level]][0]

// ── packages/contracts/src/tv.ts ──
/** "I speak" options, native names (Intl.DisplayNames is not reliable on TV runtimes). First run shows the first 8 ≠ learning. */
export const NATIVE_LANGS = [
  { code: 'en', name: 'English' }, { code: 'de', name: 'Deutsch' }, { code: 'tr', name: 'Türkçe' }, { code: 'ar', name: 'العربية' },
  { code: 'uk', name: 'Українська' }, { code: 'ru', name: 'Русский' }, { code: 'pl', name: 'Polski' }, { code: 'fa', name: 'فارسی' },
  { code: 'ro', name: 'Română' },
] as const
// NativeLine, CueScale, LearnerSettingsPatch already live in index.ts (working tree) — import them, do not redefine.
export const ProgressPut = z.object({ clipSlug: z.string().min(1), positionS: z.number().min(0), completed: z.boolean().default(false) })
export const LevelPut = z.discriminatedUnion('source', [
  z.object({ source: z.literal('placement'), level: Level }),
  z.object({ source: z.literal('settings'), level: Level }),
  z.object({ source: z.literal('quiz'), clipSlug: z.string().min(1), correct: z.number().int().min(0), total: z.number().int().min(1) }),
]).refine((b) => b.source !== 'quiz' || b.correct <= b.total, 'correct ≤ total')
export const LevelResult = z.object({ level: Level, changed: z.enum(['up', 'set']).nullable() })
export const LibraryWord = z.object({
  savedWordId: z.string(), word: z.string(), lemma: z.string(), gloss: z.string(),
  due: z.string().datetime(), intervalD: z.number().int(), reps: z.number().int(), learned: z.boolean(),
  clip: z.object({ slug: z.string(), title: z.string(), manifestUrl: z.string().url().nullable() }),
  cue: z.object({ index: z.number().int(), startS: z.number(), endS: z.number(), text: z.string(), native: z.string() }),
})
// + inferred types: ProgressPut, LevelPut (z.input), LevelResult, LibraryWord, NativeLangCode

// ── packages/contracts/src/index.ts (three lines right after ClipDetail) ──
export const ClipReady = ClipDetail.extend({ status: z.literal('ready') })
export const ClipPreparing = ClipCard.extend({ status: z.literal('preparing'), etaMin: z.number().int().positive() })
export const ClipResponse = z.discriminatedUnion('status', [ClipReady, ClipPreparing])
```

```ts
// ── apps/api/src/lib/levelRule.ts ──
export interface Attempt { clipId: string; clipLevel: Level; correct: number; total: number }
/** attempts: since levelChangedAt, oldest → newest, including the one just recorded. See decision §0.4. */
export function levelAfterQuiz(level: Level, attempts: readonly Attempt[]): { level: Level; changed: 'up' | null }
export const MIN_ITEMS = 5, UP_SHARE = 0.9

// ── apps/api/src/lib/library.ts ──
export const LEARNED_INTERVAL_D = 21
export function isLearned(intervalD: number): boolean
export function toLibraryWord(row: SavedWordWithHighlightCueClip, nativeLang: string, cdn: (key: string | null) => string | null): LibraryWord

// ── packages/shared-ui/src/nav/stack.ts ──
export type WordsFilter = 'all' | 'due' | 'learned'
export type Route =
  | { name: 'firstRun' } | { name: 'home' } | { name: 'clip'; slug: string }
  | { name: 'player'; slug: string; challenge: boolean } | { name: 'summary'; slug: string } | { name: 'quiz'; slug: string }
  | { name: 'words'; filter: WordsFilter } | { name: 'settings' } | { name: 'pair' } | { name: 'about' } | { name: 'plus' }
export interface NavState { stack: readonly Route[] }       // never empty
export type NavAction = { type: 'push'; route: Route } | { type: 'replace'; route: Route } | { type: 'pop' } | { type: 'reset'; route: Route }
export function initialNav(route?: Route): NavState          // default { stack: [{ name: 'home' }] }
/** push of a route equal (routeKey) to the top is a no-op; pop on a single-entry stack is a no-op; reset → [route]. Pure, returns a new object. */
export function navReduce(s: NavState, a: NavAction): NavState
export function top(s: NavState): Route
export function canPop(s: NavState): boolean
/** 'home' · 'clip:<slug>' · 'player:<slug>' · 'summary:<slug>' · 'quiz:<slug>' · 'words' · 'settings' · 'pair' · 'about' · 'plus' · 'firstRun'. words ignores its filter (one memory). */
export function routeKey(r: Route): string

// ── packages/shared-ui/src/nav/focusMemory.ts ──
export interface FocusMemory { get(key: string): string | undefined; set(key: string, id: string): void; forget(key: string): void }
export function createFocusMemory(): FocusMemory
/** remembered if it is in `available`, else fallback if it is in available, else available[0], else null. */
export function pickPreferred(remembered: string | undefined, available: readonly string[], fallback: string): string | null
/** Prop every screen with focus memory takes. Root builds it from the route key. */
export interface FocusMemoryProps { initialFocus?: string; onFocusId(id: string): void }

// ── packages/shared-ui/src/api/client.ts ──
export class ApiError extends Error { constructor(readonly status: number, readonly code: string, message: string) }
export class NetworkError extends Error {}
export type Api = <T>(path: string, init?: RequestInit) => Promise<T>
/** Headers: content-type json, x-device-id, x-native (read via getNative() per call). fetch rejects → NetworkError; non-JSON body → ApiError(status,'BAD_BODY');
 *  { success:false, error:{code,message} } → ApiError(status, code, message); { success:true, data } → data. */
export function createApi(o: { baseUrl: string; deviceId: string; getNative(): string; fetchImpl?: typeof fetch }): Api

// ── packages/shared-ui/src/api/endpoints.ts ──
export interface Endpoints {
  me(): Promise<LearnerDto>                                  // LearnerDto.parse (extra server fields stripped)
  patchMe(p: LearnerSettingsPatch): Promise<LearnerDto>
  catalog(): Promise<Catalog>                                // Catalog.parse
  clip(slug: string): Promise<ClipResponse>                  // ClipResponse.parse
  putProgress(b: ProgressPut): Promise<void>
  putLevel(b: LevelPut): Promise<LevelResult>
  library(): Promise<LibraryWord[]>
  saveWord(highlightId: string, sessionCode?: string): Promise<{ limit: boolean; saved: { highlight: HighlightDto } | null }>
}
export function endpoints(api: Api): Endpoints

// ── packages/shared-ui/src/data/resource.ts ──
export type ResourceError = 'offline' | 'notFound' | 'server'
export type Resource<T> = { state: 'loading'; data?: T } | { state: 'ready'; data: T } | { state: 'error'; error: ResourceError; data?: T }
export type ResourceEvent<T> = { type: 'load' } | { type: 'ok'; data: T } | { type: 'fail'; error: unknown }
/** load keeps previous data (stale-while-revalidate); fail maps NetworkError → offline, ApiError 404 → notFound, anything else → server, and keeps data. */
export function resourceReducer<T>(s: Resource<T>, e: ResourceEvent<T>): Resource<T>
export function errorKind(e: unknown): ResourceError
/** Runs load on mount and on reload(); ignores results that arrive after unmount or after a newer reload. `initial` seeds data (Root's cache). */
export function useResource<T>(load: () => Promise<T>, deps: readonly unknown[], initial?: T): Resource<T> & { reload(): void }

// ── packages/shared-ui/src/a11y.ts ──
/** For changes that have no focus move (◄► value changes, offline). Prefer live regions; this is the fallback VoiceView reliably speaks.
 *  https://developer.amazon.com/docs/react-native-vega/0.72/accessibilityinfo.html */
export function announce(text: string): void                 // try { AccessibilityInfo.announceForAccessibility?.(text) } catch {}

// ── packages/shared-ui/src/app/selectors.ts ──
export type RowKey = 'continue' | 'justRight' | 'harder' | 'fresh'
export interface HomeRow { key: RowKey; title: string; cards: ClipCard[] }
/** first justRight card with !completed && resumeS === null; else first justRight !completed; else first harder !completed; else first fresh; else null. */
export function pickHero(c: Catalog): ClipCard | null
/** Order continue, justRight, harder, fresh; drops empty rows; titles from strings.home (harder uses NEXT[level]). */
export function homeRows(c: Catalog, level: Level): HomeRow[]
/** Next in justRight after `slug` that is !completed; else pickHero excluding slug; else null. */
export function nextClip(c: Catalog | null, slug: string): ClipCard | null
export function formatMinutes(s: number): string             // strings.time.minutes(max(1, round(s/60)))
export function formatClock(s: number): string               // m:ss, floor
/** Back from the player: completed when positionS ≥ durationS − 10 or ≥ 0.97·durationS. */
export function progressBody(slug: string, positionS: number, durationS: number): ProgressPut
export function isDueToday(dueIso: string, now: Date): boolean // due ≤ local end of `now`'s day
export function dueLabel(dueIso: string, now: Date): string  // today/overdue → dueToday; tomorrow → dueTomorrow; else dueIn(n calendar days)
export function filterWords(ws: readonly LibraryWord[], f: WordsFilter, now: Date): LibraryWord[] // all · due (isDueToday) · learned; keeps due-ascending order
/** First 8 of NATIVE_LANGS whose code ≠ learning. */
export function speakOptions(learning: Lang): Array<{ code: string; name: string }>

// ── packages/shared-ui/src/session/types.ts (additions) ──
export type PhoneQuizState = { status: 'idle' } | { status: 'sent'; clipSlug: string } | { status: 'done'; clipSlug: string; correct: number; total: number }
export type PhoneQuizEvent = { type: 'sent'; clipSlug: string } | { type: 'result'; correct: number; total: number } | { type: 'reset' }
/** result only applies in 'sent'; sent from any state restarts. */
export function phoneQuizReducer(s: PhoneQuizState, e: PhoneQuizEvent): PhoneQuizState
export type SessionHandle = SessionState & { phoneQuiz: PhoneQuizState; startPhoneQuiz(clipSlug: string): void }

// ── components ──
export interface ButtonProps { label: string; text: string; onPress(): void; primary?: boolean; preferred?: boolean; id?: string; onFocusId?(id: string): void; focusRef?: React.Ref<View>; nextFocusUp?: number; nextFocusDown?: number; nextFocusLeft?: number; nextFocusRight?: number; testID?: string; children?: React.ReactNode /* e.g. a Check before the text */ }
export interface CardProps {
  title: string; imageUrl?: string; level?: Level; durationS?: number; progress?: number /* 0..1 resume bar */
  label: string; onPress(): void; onFocus?(): void; preferred?: boolean; focusRef?: React.Ref<View>; nextFocusLeft?: number; testID?: string
}
export function LevelChip(p: { level: Level }): JSX.Element // surface2 fill, T label, text colour; aria-hidden (cards carry the level in their label)
export function SkeletonBlock(p: { w: number; h: number; radius?: number }): JSX.Element // surface2, accessibilityElementsHidden, importantForAccessibility no-hide-descendants
export function SkeletonCard(): JSX.Element                 // 412×232 block + two text bars
export function SkeletonRow(p: { count?: number }): JSX.Element // a label bar + `count` (default 4) cards
export interface StateAction { label: string; text: string; onPress(): void; primary?: boolean }
export function StateMessage(p: { title: string; body?: string; actions: StateAction[]; announceOnMount?: boolean; testID?: string }): JSX.Element
  // first action preferred; title has accessibilityLiveRegion="polite"; announceOnMount → announce(`${title} ${body ?? ''}`)
export interface MiniPlayerProps { manifestUrl: string; startS: number; endS: number; playKey: number; caption?: string; onEnd?(): void }
  // 640×360, surface1 frame, not focusable; KitPlayer key={`${manifestUrl}:${startS}:${playKey}`}, autoplay, startAt startS;
  // onPosition(s): if s ≥ endS → ref.pause(), onEnd() once. caption rendered under the video, T cueTarget at size 32.
export function shouldStop(positionS: number, endS: number): boolean // positionS ≥ endS − 0.05
export interface RailItem { key: 'home' | 'review' | 'words' | 'plus' | 'settings'; label: string; text: string }
export interface RailProps { items: RailItem[]; current: RailItem['key']; onSelect(k: RailItem['key']): void
  /** handle of the element ► should land on */ rightTarget?: number; itemRefs?: React.MutableRefObject<Partial<Record<RailItem['key'], View | null>>>
  initialFocus?: string; onFocusId?(id: string): void }

// ── screens (props) ──
export interface HomeProps extends FocusMemoryProps {
  catalog: Resource<Catalog>; learner: LearnerDto; onReload(): void
  onWatch(card: ClipCard): void; onOpen(slug: string): void; onRail(k: RailItem['key']): void; onSettings(): void
}
export interface ClipProps extends FocusMemoryProps {
  clip: Resource<ClipResponse>; learner: LearnerDto; inContinue: boolean; onReload(): void
  onWatch(challenge: boolean): void; onPlus(): void; onAddToContinue(): Promise<boolean>; onBack(): void
}
export interface SummaryProps {
  clip: ClipDetail; saved: HighlightDto[]; lang: Lang; phoneName: string | null; phoneQuiz: PhoneQuizState
  lastTvQuiz: { correct: number; total: number } | null
  onQuizTv(): void; onQuizPhone(): void; onAgain(): void; onNext(): void
}
export interface QuizProps {
  clip: ClipDetail                                          // items, cues (native line, replay span), manifestUrl
  onFinish(r: { correct: number; total: number }): Promise<LevelResult | null> // Root: PUT /me/level; null on failure (result still shown)
  onNext(): void; onAgain(): void; onDone(): void
}
export interface WordsProps extends FocusMemoryProps {
  words: Resource<LibraryWord[]>; filter: WordsFilter; onFilter(f: WordsFilter): void; remote: RemoteSource
  now?: Date; onReload(): void; onFindClip(): void
}
export interface SettingsProps extends FocusMemoryProps {
  learner: LearnerDto; phoneName: string | null; remote: RemoteSource; status: string | null
  onAction(a: SettingsAction): void                         // Root applies it (PUT /me, PUT /me/level, navigation)
}
export interface AboutProps { clips: ClipCard[] /* from the cached catalog; may be empty */ ; onBack(): void }
export interface FirstRunProps {
  learner: LearnerDto; session: SessionState; remote?: never
  onProfile(p: { learning: Lang; native: string }): void; onLevel(level: Level): void; onDone(): void
}
export interface PairProps { code: string | null; joinUrl: string | null; connected: string | null; onLater(): void; embedded?: boolean }

// ── screens/quiz/machine.ts ──
export type QuizPhase = 'answering' | 'correct' | 'revealed' | 'done'
export interface QuizState { i: number; picked: number | null; correct: number; phase: QuizPhase; replayKey: number; replaying: boolean }
export type QuizEvent = { type: 'pick'; k: number } | { type: 'advance' } | { type: 'continue' } | { type: 'replay' } | { type: 'replayEnd' }
export type QuizEffect = { kind: 'autoAdvance'; ms: number } | { kind: 'finish'; correct: number; total: number }
export const AUTO_ADVANCE_MS = 600
export function initialQuiz(): QuizState
/** pick in answering: correct → phase correct, correct+1, [autoAdvance 600]; else → phase revealed, []. pick in any other phase → unchanged.
 *  advance (only in correct) / continue (only in revealed) → next item (picked null, answering, replaying false) or phase done + [finish].
 *  replay → replaying true, replayKey+1 (any phase but done); replayEnd → replaying false. */
export function quizReduce(s: QuizState, e: QuizEvent, items: readonly QuizItemDto[]): [QuizState, QuizEffect[]]
export function optionState(s: QuizState, item: QuizItemDto, k: number): 'idle' | 'correct' | 'picked' // correct: shown when phase correct|revealed and k === answer; picked: phase revealed and k === picked ≠ answer

// ── screens/settings/model.ts ──
export type SettingsKey = 'learning' | 'native' | 'level' | 'nativeLine' | 'autoPause' | 'cueSize' | 'pair' | 'plus' | 'about'
export interface SettingsRow { key: SettingsKey; name: string; value: string; kind: 'cycle' | 'link'; label: string /* aria-label */ }
export type SettingsAction =
  | { kind: 'patch'; patch: LearnerSettingsPatch; announce: string } | { kind: 'level'; level: Level; announce: string }
  | { kind: 'open'; route: 'pair' | 'plus' | 'about' }
export function settingsRows(l: LearnerDto, phoneName: string | null): SettingsRow[] // order = §8 list
/** ◄► on a cycle row. learning: de↔en, and when the new learning === native, native flips to the other of de/en in the same patch.
 *  native: steps NATIVE_LANGS skipping the learning language. level: LEVELS, no wrap (A1 ◄ stays → null; B2 ► → null).
 *  nativeLine: LINES wrap. autoPause: toggle. cueSize: SIZES no wrap. link rows → null. announce = row label with the new value. */
export function cycleSetting(key: SettingsKey, dir: -1 | 1, l: LearnerDto): SettingsAction | null
/** Select: cycle rows → cycleSetting(key, +1) but wrapping for level and cueSize (A2→B1…B2→A1; 150 %→100 %); link rows → open. */
export function selectSetting(key: SettingsKey, l: LearnerDto): SettingsAction | null

// ── screens/firstRun ──
export type Answer = 'yes' | 'mostly' | 'no'
export interface PlacementItem { level: Level; text: string /* pre-wrapped with '\n', ≤ 2 × 42 */ }
export const PLACEMENT: Record<Lang, readonly PlacementItem[]> // 6 each, levels A1, A2, A2, B1, B1, B2 in that order
export const SCORE: Record<Answer, number>                       // yes 1, mostly 0.5, no 0
/** Walk LEVELS ascending over the bands present in items; band mean ≥ 0.75 passes; stop at the first band that does not pass.
 *  Result = highest passed band, or 'A1' when A1 does not pass. answers.length must equal items.length (else throws). */
export function placeLevel(items: readonly PlacementItem[], answers: readonly Answer[]): Level
export const DEFAULT_LEVEL: Level // 'A2' (skip)
export type FirstRunPanel = 'learning' | 'speak' | 'placement' | 'pair'
export interface FirstRunState { panel: FirstRunPanel; learning: Lang; native: string; answers: Answer[]; level: Level | null }
export type FirstRunEvent = { type: 'learning'; lang: Lang } | { type: 'speak'; code: string } | { type: 'answer'; a: Answer } | { type: 'skip' } | { type: 'back' } | { type: 'finish' }
export type FirstRunEffect = { kind: 'profile'; learning: Lang; native: string } | { kind: 'level'; level: Level } | { kind: 'done' } | { kind: 'unhandledBack' }
export function initialFirstRun(l: LearnerDto): FirstRunState     // panel learning; learning/native from l (native forced ≠ learning)
export function firstRunReduce(s: FirstRunState, e: FirstRunEvent): [FirstRunState, FirstRunEffect[]]
```

### First-run reducer table

| Panel | Event | Next | Effects |
|---|---|---|---|
| learning | learning(lang) | panel speak, learning = lang; native = (native === lang ? (lang === 'de' ? 'en' : 'de') : native) | — |
| learning | back | — | unhandledBack (Root lets the OS exit) |
| speak | speak(code) | panel placement, native = code, answers [] | profile(learning, native) |
| speak | back | panel learning | — |
| placement | answer(a) | answers + a; when length = 6 → panel pair, level = placeLevel | level(level) on the 6th |
| placement | skip | panel pair, level A2 | level('A2') |
| placement | back | panel speak, answers [] | — |
| pair | finish | — | done |
| pair | back | panel placement, answers [], level null | — |
| any | anything else | unchanged | — |

## 4. API behaviour (A2)

All responses keep the `{ success, data }` envelope (`lib/http.ts`). Learner lookup in `catalog.ts`, `clips.ts`, `learning.ts`: `db.learner.upsert({ where: { deviceId }, create: { deviceId }, update: {} })` with `deviceId = String(req.header('x-device-id') ?? 'anon')`.

**GET /catalog** (`?learning=de|en&level=A1..B2` optional, Zod-validated, override the learner's values; invalid → 400).
`clips = published ∧ sourceLang = learning`, include this learner's progress. `card(c)` = `{ slug, title, level, durationS, posterUrl, resumeS: p && !p.completed ? p.positionS : null, completed: !!p?.completed, attribution }`.
- `continue`: clips with progress and `!completed`, ordered by `progress.updatedAt` desc.
- `justRight`: `level === learner level`, not-completed first, then by `createdAt` desc.
- `harder`: `level === NEXT[level]` (empty for B2 — the row hides; do not repeat B2 clips).
- `fresh`: `createdAt ≥ now − 7 days`, max 10, `createdAt` desc.

**GET /clips/:slug**
- unknown slug → 404 `NOT_FOUND` (unchanged).
- `status !== 'published'` → 200 `ClipPreparing` (`status: 'preparing'`, `etaMin: 3`, card fields; `posterUrl` may be null).
- published → `ClipReady`: highlights filtered per §0.5 (`h.rank >= highlightFloor(learner.level)`); `wordsYoullMeet` = filtered highlights in cue order, distinct by `lemma`, first 8; `resumeS`/`completed` from this learner's Progress (same rule as the card); `posterUrl` via the same `cdn()` helper as catalog (no `https://undefined/…` when `CLOUDFRONT_DOMAIN` is unset — `manifestUrl` stays as today, it must be a URL for `ClipDetail`; with no domain use `http://localhost/<manifestKey>` and note it in the test). Quiz items unchanged (a quiz item whose word was filtered still references its cue; fine).

**PUT /me** — body `LearnerSettingsPatch` (strict). Unknown keys (`plus`, `level`, `streak`) → 400 VALIDATION.

**PUT /me/progress** — body `ProgressPut`. Unknown clip → 404. Upsert `Progress` (`learnerId_clipId`) with `positionS`, `completed`. Returns `{ clipSlug, positionS, completed }`.

**PUT /me/level** — body `LevelPut`.
- `placement`/`settings`: set `level`, `levelChangedAt = now`; `changed: 'set'` (or `null` if the level is unchanged — still update `levelChangedAt`).
- `quiz`: unknown clip → 404; insert `QuizAttempt`; load attempts with `at ≥ levelChangedAt` (all if null) ordered by `at` asc, joined to clip level; `levelAfterQuiz(learner.level, attempts)`; when `changed === 'up'` update `level`, `levelChangedAt`. Return `LevelResult`.

**GET /me/library** — saved words of this learner, include `highlight → cue → clip`, ordered `due` asc, mapped by `toLibraryWord` (native line chosen by `x-native` header, fallback `en`, then `''`; `manifestUrl` null unless clip is published; `learned = intervalD ≥ 21`).

## 5. Rendering (C chunks) — layout, focus, states

Common: every screen sits in `Screen` (ground + safe zone); Home also passes `rail`. Buttons via `Button`. Focus memory ids are strings listed per screen; a screen computes `preferred = pickPreferred(initialFocus, availableIds, fallbackId)` once per mount (`useState(() => …)`) and gives `hasTVPreferredFocus` to that id only; every focusable calls `onFocusId(id)` from `onFocus`.

**Home** (`ids`: `hero:watch`, `hero:meet`, `card:<rowKey>:<slug>`, `rail:<key>`; fallback `hero:watch`)
- Rail (left, 96 px collapsed; while any rail item has focus it renders an absolutely positioned 336 px `surface1` panel over the content with full labels — content never reflows). Items: Watch (`home`), Review (`review` → Words filter `due`), Words (`words` → filter `all`), Plus (`plus`), Settings (`settings`). Current item has the `selected` ring and the `interactive` text colour plus a 4 px `interactive` bar on its left edge (not colour alone). Collapsed items show the item's first letter **and** keep the full `aria-label` (`strings.rail.label(name)`).
- `catalog.state === 'loading'` with no data → hero skeleton (`SkeletonBlock` 1728×520) + 2 × `SkeletonRow`, plus a hidden live-region `T` reading `strings.home.loading`. No focusable on screen until data arrives (the hero Watch then mounts with preferred focus).
- `error` with no data → `StateMessage` (offline: `strings.offline` + Retry, `announceOnMount`; server: `strings.common.error` + Retry). With stale data → keep rendering data, no message.
- ready: hero (if `pickHero`): poster at right 768×432 (`Image`, surface2 behind), left column: `LevelChip` + `formatMinutes` meta, `T display` title (2 lines max), actions `Watch` (primary; text `strings.home.watch`, or `strings.home.resume(formatClock(resumeS))` when resumeS) and `Words you'll meet` (secondary → `onOpen(slug)`). Rows from `homeRows` (empty rows absent, so empty Continue is hidden). Cards: `Card` with level chip top-left, duration bottom-right, resume bar for Continue; `label = strings.home.cardLabel(title, level, minutes)`; press → `onOpen(slug)`.
- No hero and no rows → `StateMessage(strings.home.empty, actions [Open Settings → onSettings])`.
- Explicit neighbours (in `useLayoutEffect`, after mount, via `findNodeHandle`): hero Watch and the **first card of every row** get `nextFocusLeft = rail item 'home'`; every rail item gets `nextFocusRight = hero Watch` (or the first card when there is no hero).
- Back on Home: not handled → app exits (Fire TV guideline: Back on the top-level screen leaves the app).

**Clip** (`ids`: `watch`, `challenge`, `continue`; fallback `watch`)
- loading → poster skeleton (768×432) + three text bars; preparing → `StateMessage(strings.clip.preparing(etaMin), body strings.clip.preparingBody, [Back])` and a 30 s `setInterval(onReload)` while mounted; notFound → `StateMessage(strings.clip.notFound, [Back])`; server/offline → `StateMessage(…, [Retry, Back])`.
- ready: left poster 768×432; right column: `T display` title, `LevelChip` + duration, `T label` "WORDS YOU'LL MEET" + up to 8 marker chips (marker fill, `ground` text, `T body`, not focusable, `accessibilityElementsHidden` false; the row has an `aria-label` = `strings.clip.meetLabel(words.join(', '))`), or `strings.clip.noWords` when empty; actions row: Watch (primary, preferred; resume text as on Home), Challenge (plus: `strings.clip.challenge` → `onWatch(true)`; free: `strings.clip.challengePlus` → `onPlus()`), Add to Continue (hidden when `inContinue` or `resumeS !== null`; on success the button text becomes `strings.clip.inContinue`, `disabled`, status `strings.clip.added`; on failure status `strings.common.saveError`). Attribution at the bottom, `T label textSecondary`, `numberOfLines 2`.
- Back → `onBack`.

**Summary** (no memory; preferred: Quiz on TV, else Watch again)
- `T display` `strings.summary.newWords(n, lang)`, or `strings.summary.none` (as `T title`) when n = 0. Saved chips (marker, `ground` text, `Check` before each word, not focusable). Accuracy line (`T body textSecondary`, live region): phone `done` → `phoneResult`; else `sent` → `phoneSent(phoneName)`; else `lastTvQuiz` → `lastQuiz`.
- Actions (max 4, one row): Quiz on TV (when `clip.quiz.length > 0`), Quiz on phone (when `phoneName !== null && saved.length > 0`), Watch again, Next clip.
- Back → Root pops (Summary replaced the Player, so Back returns to Clip or Home).

**Quiz** (no memory; options remount per item via `key={item.id}`)
- Header row: kind label (`strings.quiz.meaningKind`/`clozeKind`, `T label`) left, `strings.quiz.progress(i+1, n)` right. Prompt `T cueTarget` (44 px), `maxWidth px(1000)`.
- 2×2 grid, `width px(640)`, `height px(140)`, gap `px(20)`, wrap within `maxWidth px(1320)`. Option 0 preferred while answering. `label = strings.quiz.optionLabel(text, k+1, 4)`.
  - `correct` option state: `selected` ring (interactive, 3 px) + `Check` (interactive) before the text.
  - `picked` (incorrect pick): border `px(3)` `tokens.color.incorrect` + text unchanged; the correct option shows the `correct` state at the same time.
  - While phase ≠ answering, option `onPress` is a no-op (keep them focusable so focus is not lost).
- Feedback line (live region): phase correct → `strings.quiz.right(option)`; revealed → `strings.quiz.answerIs(option)` plus, for `meaning` items with a cue, a second line `strings.quiz.inClip(cue.native)` (`T body nativeCue` colour).
- Cloze items with a cue: a `Replay the line` button under the grid in every phase but done; press → `replay` → `MiniPlayer` (top-right, absolutely positioned at `top px(0)`, `right px(0)`) for `cues[cueIndex]` span with `playKey = replayKey`; `onEnd → replayEnd`.
- Revealed: a `Continue` primary button mounts with preferred focus (`key` per item so it is a fresh mount). Correct: `setTimeout(600)` → `advance`, cleared on unmount and on item change.
- `done`: `onFinish` once (guard with a ref); render `T display strings.quiz.done(c, n)`, then `levelUp(level)` when the result says `up`; actions Next clip (preferred), Watch again, Done.
- `clip.quiz.length === 0` → `StateMessage(strings.quiz.empty, [Back → onDone])`.

**Words** (`ids`: `word:<savedWordId>`, `find`; fallback first row)
- Filter pills row at top (not focusable): All / Due today / Learned; current pill `selected` ring + `interactive` text + `T label` with a leading `Check` (never colour alone). Under it `T label textSecondary` `strings.words.hint`.
- `useRemoteKeys(remote, onKey, true)`: short `left`/`right` (ignore `longPress`) step the filter without wrap; on change `announce(strings.words.filterLabel(name, count))`.
- Rows (`ScrollView`, one `Button`-like `Focusable` per word, full width `px(1100)`): lemma `T title`, gloss `T body textSecondary`, right side `dueLabel` (`T label`) and the clip title (`T label textSecondary`). `label = strings.words.rowLabel(lemma, gloss, due, clipTitle)`. Select → set `playing = { word, key+1 }` → `MiniPlayer` on the right (`left px(1180)`), caption = `cue.text.replace('\n', ' ')`. Words with `manifestUrl === null` → status `strings.words.noLine`, no player.
- Back while the mini player is open closes it (own `BackHandler` listener added while open, returns true) — otherwise Root pops.
- Empty per filter (`all` → `strings.words.empty`, `due` → `emptyDue`, `learned` → `emptyLearned`): `StateMessage` with action `strings.words.findClip` → `onFindClip` (Root: reset to Home). Loading → 5 `SkeletonBlock` rows; errors as Home.

**Settings** (`ids`: `row:<key>`; fallback `row:learning`)
- Title `T display strings.settings.title`; rows from `settingsRows`, each a `Focusable` (`label = row.label`, `onFocus` records `focused.current = key`), name left `T body`, value right `T body interactive` (cycle) or `T body textSecondary` + `strings.settings.open` (link). `useRemoteKeys`: short left/right → `cycleSetting(focused.current, ±1, learner)`; non-null → `onAction`, and `announce(action.announce)`. Select → `selectSetting`. Status line (`T label`, live region): `status ?? strings.settings.hint`.

**About** — `T display` title; `strings.about.machine`; `strings.about.fonts`; `strings.about.freq`; heading `strings.about.clips` + one `T label` per clip `title — attribution` (cards with empty attribution skipped); a Back button (preferred). Content in a `ScrollView`; the Back button is the only focusable.

**First run** — one panel at a time, `Screen` without rail, own `BackHandler` listener → `firstRunReduce({type:'back'})`, returns `false` only on `unhandledBack`.
- learning: `T display strings.firstRun.learning`, two 560×320 cards (`Focusable`, `T display` native name, `aria-label strings.firstRun.learningLabel(name)`); preferred = current learning.
- speak: `T display strings.firstRun.speak`, 4×2 grid of 400×140 buttons from `speakOptions(learning)`; preferred = current native when present, else the first.
- placement: header `strings.firstRun.placementTitle`, `T body` `placementBody`, `strings.firstRun.item(i+1, 6)` top-right, the line in a cue box (`cueBox` fill, `T cueTarget`, centred, the `'\n'` kept), `T title strings.firstRun.placement`, buttons Yes / Mostly / No (Yes preferred; `key` per item for a fresh preferred focus), and a secondary `strings.firstRun.skip` button. Native line never shown.
- pair: `<Pair embedded …>` from the session; `onLater → finish`.

**Pair** — keep layout; replace the connected/Later branch with: when connected, a line `Check` + `T title interactive strings.pair.connected(name)` (live region); always one button (same element, `key="pair-action"`, preferred): text `connected ? (embedded ? strings.firstRun.done : strings.pair.continue) : strings.pair.later`, `onPress = onLater`.

## 6. Root (D) — `app/Root.tsx`

- State: `nav` (`useReducer(navReduce, initialNav({ name: 'home' }))`), `memory = useRef(createFocusMemory())`, `learner`, `boot: 'loading' | 'ready' | 'offline'`, `catalogCache: Catalog | null`, `clipCache: Map<slug, ClipReady>`, `saved: HighlightDto[]` (per Player visit, as today), `tvQuiz: Map<slug, {correct,total}>`, `settingsStatus`.
- `api = createApi({ baseUrl, deviceId, getNative: () => learnerRef.current.native })`; `ep = endpoints(api)`.
- Boot: `ep.me()` → set learner; `firstRunDone ? reset(home) : reset(firstRun)`; `boot = 'ready'`. `NetworkError`/any failure → `boot = 'offline'` → `StateMessage(strings.offline, [Retry → re-run boot], announceOnMount)`.
- Session: `useSession({ enabled: boot === 'ready', … })` (now `SessionHandle`; `onOffline` sets `boot = 'offline'` as today).
- Back: one `BackHandler` listener at Root mount: `canPop(nav) ? (dispatch pop, true) : false`. Player/Words/FirstRun listeners are added later and therefore run first (RN calls the most recent listener first) — keep it that way.
- Focus memory: `focusProps(route) = { initialFocus: memory.get(routeKey(route)), onFocusId: (id) => memory.set(routeKey(route), id) }`. Changing learning language → `memory.forget('home')`.
- Routes:
  - `home` → `Home` with `useResource(ep.catalog, [learner.learning, learner.level, homeVisit], catalogCache)`; results stored back into `catalogCache`. `onWatch(card)` → push player(slug, false). `onOpen` → push clip. Rail: `review` → push words(due); `words` → push words(all); `plus` → push plus; `settings` → push settings; `home` → nothing.
  - `clip` → `Clip` with `useResource(() => ep.clip(slug), [slug])`; ready results go into `clipCache`. `inContinue = !!catalogCache?.continue.some(c => c.slug === slug)`. `onAddToContinue` → `putProgress({ clipSlug, positionS: 0, completed: false })` → true/false, and refresh `catalogCache` lazily (Home refetches on mount anyway).
  - `player` → `clipCache.get(slug)` (fetch through `ep.clip` with a loading `StateMessage` if absent, e.g. hero Watch first). `challenge = route.challenge && learner.plus`. `onBack(pos)` → `putProgress(progressBody(slug, pos, durationS))` (fire and forget), update `clipCache` resumeS, `pop`. `onEnd` → `putProgress({ clipSlug, positionS: durationS, completed: true })`, clear resumeS in cache, `replace(summary(slug))`. `onSave` = existing `save()` via `ep.saveWord`. `onPlus` → push plus. `onLearnerChange` → `patchLearner`. Reset `saved` on entering a player route for a different slug than the last one (Watch again keeps the list).
  - `summary` → `Summary`; `onQuizTv` → push quiz; `onQuizPhone` → `session.startPhoneQuiz(slug)`; `onAgain` → replace player(slug, false); `onNext` → `nextClip(catalogCache, slug)` → replace clip(next.slug), else reset home.
  - `quiz` → `Quiz`; `onFinish` → `ep.putLevel({ source: 'quiz', clipSlug, correct, total })`, store `tvQuiz`, update `learner.level` when changed, return result (null on error); `onNext`/`onAgain` as Summary but from the quiz (pop then replace); `onDone` → pop.
  - `words` → `Words` with `useResource(ep.library, [wordsVisit])`; `onFilter` → `replace(words(f))`; `onFindClip` → reset home.
  - `settings` → `Settings`; `onAction`: `patch` → `patchLearnerOptimistic({ put: ep.patchMe, setLearner }, p)` (existing `lib/learnerPatch.ts`, rolls back on failure); resolves false → `settingsStatus = strings.common.saveError`; learning change → `memory.forget('home')`, `catalogCache = null`. `level` → optimistic, `ep.putLevel({ source: 'settings', level })`. `open` → push route.
  - `pair` → `Pair` (`onLater` → pop). `about` → `About` with `catalogCache` cards (all four rows, deduped by slug). `plus` → **placeholder owned by LING-007**: `Screen` + `T display strings.plus.title` + `T body strings.plus.body` + Back button. LING-007 replaces exactly this `case 'plus':` block.
  - `firstRun` → `FirstRun`; `onProfile` → `patchMe({ learning, native })` (optimistic); `onLevel` → `putLevel({ source: 'placement', level })`; `onDone` → `patchMe({ firstRunDone: true })`, `reset(home)`.
- `patchLearner` (Player sheet) keeps using `patchLearnerOptimistic`, with `put: ep.patchMe`. `onProfile`/`onDone` in First run use it too.

## 7. Strings (`strings.ts` — exact additions/changes; keep every other existing key)

```ts
rail: { …existing, label: (name: string) => `${name}. Menu`, reviewLabel: 'Review: words due today', wordsLabel: 'Words: everything you saved', plusLabel: 'Lingo Plus', settingsLabel: 'Settings', watchLabel: 'Watch: home' },
common: { back: 'Back', retry: 'Try again', error: 'Something went wrong on our side.', saveError: 'Couldn’t save. Try again.', loading: 'Loading' },
level: { about: (l: string) => `about ${l}`, label: (l: string) => `Level about ${l}` },
time: { minutes: (m: number) => `${m} min` },
home: { continue: 'Continue', justRight: (l: string) => `Just right for you · about ${l}`, harder: (l: string) => `A bit harder · about ${l}`, fresh: 'New this week', watch: 'Watch',
  resume: (at: string) => `Resume from ${at}`, meet: 'Words you’ll meet', watchLabel: (t: string) => `Watch ${t}`, resumeLabel: (t: string, at: string) => `Resume ${t} from ${at}`,
  meetLabel: (t: string) => `Words you’ll meet in ${t}`, cardLabel: (t: string, l: string, min: string) => `Open ${t}. About ${l}, ${min}.`,
  loading: 'Loading clips', empty: 'No clips in this language yet.', emptyAction: 'Open Settings' },
clip: { …existing (wordsYoullMeet, watch, challenge, preparing), challengePlus: 'Challenge mode · Plus', challengeLabel: 'Watch in Challenge mode: native line hidden, Menu shows it',
  challengePlusLabel: 'Challenge mode is part of Lingo Plus. Select to see Lingo Plus', addContinue: 'Add to Continue', inContinue: 'In Continue', added: 'Added to Continue.',
  preparingBody: 'This page checks again by itself.', notFound: 'This clip isn’t available.', noWords: 'No new words at your level in this clip.',
  meetLabel: (ws: string) => `Words you’ll meet: ${ws}` },
summary: { …existing, newWords: (n: number, lang: 'de' | 'en') => (lang === 'de' ? (n === 1 ? '1 neues Wort' : `${n} neue Wörter`) : n === 1 ? '1 new word' : `${n} new words`),
  phoneSent: (name: string) => `Quiz sent to ${name}.`, phoneResult: (c: number, n: number) => `Phone quiz: ${c} of ${n} right.`, lastQuiz: (c: number, n: number) => `Last quiz on TV: ${c} of ${n} right.` },
quiz: { …existing (progress, replayLine, done), meaningKind: 'What does it mean?', clozeKind: 'Fill the gap', right: (o: string) => `Right: ${o}`, answerIs: (o: string) => `The answer: ${o}`,
  inClip: (native: string) => `In the clip: ${native}`, continue: 'Continue', optionLabel: (o: string, i: number, n: number) => `Answer ${i} of ${n}: ${o}`,
  empty: 'This clip has no quiz yet.', levelUp: (l: string) => `Your level is now about ${l}.`, next: 'Next clip', again: 'Watch again', finish: 'Done' },
words: { …existing (empty, filters), title: 'Words', hint: 'Left and right change the list. Select plays the line.', emptyDue: 'Nothing is due today.',
  emptyLearned: 'Words you know well show up here after a few reviews.', findClip: 'Find a clip to watch', dueToday: 'Due today', dueTomorrow: 'Due tomorrow',
  dueIn: (n: number) => `Due in ${n} days`, rowLabel: (lemma: string, gloss: string, due: string, clip: string) => `${lemma}: ${gloss}. ${due}. From ${clip}. Select to play the line.`,
  filterLabel: (name: string, count: number) => `${name}: ${count} words`, noLine: 'This line isn’t available yet.' },
settings: { …existing, title: 'Settings', learningOpts: { de: 'Deutsch', en: 'English' }, autoPauseOpts: { on: 'On', off: 'Off' }, sizeValue: (pct: number) => `${pct} %`,
  pairValue: (name: string | null) => (name ? `Connected: ${name}` : 'Not paired'), plusValue: (on: boolean) => (on ? 'On' : 'Off'), open: 'Open',
  rowLabel: (name: string, value: string) => `${name}: ${value}. Left and right to change`, linkLabel: (name: string, value: string) => `${name}: ${value}. Select to open`,
  hint: 'Left and right change a value. Back to go home.' },
about: { title: 'About & attributions', machine: 'Subtitles are transcribed and translated by machine. Explanations and quizzes are written by AI and spot-checked by people.',
  fonts: 'Noto Sans and Manrope: SIL Open Font License 1.1.',
  freq: 'Word frequencies: hermitdave/FrequencyWords (OpenSubtitles 2018), CC BY-SA 4.0.', clips: 'Clips' },
firstRun: { …existing (learning, speak, placement, yes, mostly, no), placementTitle: 'A quick check of your level', placementBody: 'Six short lines. Answer honestly; you can change your level in Settings.',
  item: (i: number, n: number) => `${i} of ${n}`, skip: 'Skip · start at about A2', learningLabel: (name: string) => `Learn ${name}`, speakLabel: (name: string) => `I speak ${name}`,
  yesLabel: 'Yes, I understood it', mostlyLabel: 'I mostly understood it', noLabel: 'No, not yet', skipLabel: 'Skip the check and start at about A2', done: 'Start watching' },
pair: { …existing, continue: 'Continue' },
offline: 'Can’t reach Lingo. Check the network and press Select to retry.',   // unchanged; the Retry button now exists
```
Blocklist check: none of "streak broken", "failed", "wrong answer" appears. Levels always say "about".

## 8. Placement content (`screens/firstRun/placement.ts`, verbatim)

German (`de`): A1 `Ich trinke morgens gern Kaffee.` · A2 `Kannst du mir sagen,\nwann der Zug fährt?` · A2 `Wir haben am Wochenende\nunsere Eltern besucht.` · B1 `Obwohl es regnete, sind wir\nspazieren gegangen.` · B1 `Ich habe mich endlich für\ndie neue Stelle beworben.` · B2 `Die Verhandlungen wurden\nergebnislos abgebrochen.`

English (`en`): A1 `I usually drink coffee in the morning.` · A2 `Could you tell me when\nthe train leaves?` · A2 `We visited our parents\nlast weekend.` · B1 `Although it was raining,\nwe went for a walk anyway.` · B1 `I finally applied for the\nnew job at the hospital.` · B2 `The negotiations broke down\nwithout reaching an agreement.`

Every line ≤ 42 characters (a test asserts it). The bands are hand-judged; a follow-up may check them against `data/freq-*.txt` ranks (Open question 2).

## 9. Acceptance tests (tests first; names verbatim)

`packages/contracts/test/tv.test.ts`
- it('LevelPut accepts placement, settings and quiz bodies and rejects correct > total')
- it('ClipResponse parses a ready clip and a preparing clip by status')
- it('ClipCard defaults completed to false and attribution to empty')
- it('NATIVE_LANGS has nine unique codes including en and de')
- it('highlightFloor is 1000, 2000, 4000, 4000 for A1, A2, B1, B2')

`apps/api/test/levelRule.test.ts`
- it('two eligible attempts on different clips at 90 % or more move up one band')
- it('one attempt is not enough')
- it('an eligible attempt under 90 % breaks the run')
- it('a retake of the same clip replaces the earlier attempt instead of counting twice')
- it('attempts on clips below the learner level are ignored, neither counting nor breaking')
- it('quizzes with fewer than 5 items are ignored')
- it('B2 stays B2')
- it('never moves down')

`apps/api/test/catalog.test.ts` (DB)
- it('returns the four rows for the learner language and level')
- it('continue holds started, unfinished clips, newest progress first')
- it('completed clips carry completed true and no resumeS')
- it('harder is empty for a B2 learner')
- it('fresh holds only clips from the last seven days')
- it('query overrides learning and level, and rejects an unknown level with 400')
- it('drafts never appear')

`apps/api/test/clips.test.ts` (DB)
- it('returns 404 for an unknown slug')
- it('returns status preparing with etaMin for an unpublished clip')
- it('filters highlights below the floor of the band above the learner level')  — ranks 500/1500/2500/5000: A1 sees 1500,2500,5000; A2 sees 2500,5000; B2 sees 5000
- it('builds wordsYoullMeet from the filtered set, distinct lemmas, at most eight')
- it('fills resumeS and completed from this learner progress only')

`apps/api/test/learning.test.ts` (DB)
- it('PUT /me/progress upserts position and completed and 404s an unknown clip')
- it('PUT /me/level placement sets the level and levelChangedAt')
- it('PUT /me/level quiz records an attempt and moves up after two qualifying clips')
- it('PUT /me/level quiz only counts attempts since the last level change')
- it('PUT /me/level rejects correct greater than total')
- it('GET /me/library lists saved words due first with clip, cue span and native line')
- it('GET /me/library marks intervals of 21 days or more as learned')
- it('GET /me/library gives a null manifestUrl for an unpublished clip')

`packages/shared-ui/test/nav.test.ts`
- it('initialNav starts at home')
- it('push adds a route and pop returns to the previous one')
- it('pop on a single route is a no-op and canPop is false')
- it('replace swaps the top route and keeps the rest')
- it('reset leaves exactly one route')
- it('pushing the route already on top changes nothing')
- it('routeKey is stable per screen and slug and ignores the words filter')

`focusMemory.test.ts`
- it('remembers the last id per route key and forgets on request')
- it('pickPreferred returns the remembered id when it is still on screen')
- it('pickPreferred falls back to the fallback, then the first id, then null')

`api.test.ts`
- it('sends x-device-id, x-native and json content type on every call')
- it('reads x-native per call so a changed language is used at once')
- it('unwraps the success envelope')
- it('throws ApiError with status and code for an error envelope')
- it('throws NetworkError when fetch rejects')
- it('throws ApiError BAD_BODY for a non-JSON body')

`resource.test.ts`
- it('load keeps previous data while reloading')
- it('a network error becomes offline, a 404 notFound, anything else server')
- it('a failure keeps stale data')

`selectors.test.ts`
- it('pickHero prefers an unstarted just-right clip, then any unfinished one, then harder, then fresh')
- it('homeRows drops empty rows, so an empty Continue is hidden')
- it('homeRows titles say about and name the next band for harder')
- it('nextClip walks just-right after the current clip and skips completed ones')
- it('formatMinutes rounds and never shows 0 min; formatClock pads seconds')
- it('progressBody marks the last ten seconds or 97 % as completed')
- it('isDueToday counts overdue and later-today as due and tomorrow as not')
- it('dueLabel says today, tomorrow or in N days')
- it('filterWords keeps due order and applies all, due and learned')
- it('speakOptions shows eight languages and never the learning language')

`phoneQuiz.test.ts`
- it('sent moves to sent and a result then moves to done')
- it('a result while idle is ignored')
- it('sending again restarts from sent')

`components.test.tsx` (react-test-renderer, as `render.test.tsx`)
- it('Card puts the level chip on surface2 with text colour, never the marker')
- it('Card shows duration bottom-right and a resume bar only with progress')
- it('StateMessage gives the first action preferred focus and announces on mount when asked')
- it('Skeleton pieces are hidden from accessibility and not focusable')
- it('Rail labels every item with its purpose and marks the current one with a ring and a bar')
- it('Button primary uses the interactive fill with ground text')
- it('shouldStop is true from 50 ms before the cue end')

`home.test.tsx`
- it('shows skeletons and nothing focusable while the catalog loads')
- it('gives preferred focus to hero Watch by default and to the remembered card when it is on screen')
- it('hides empty rows and shows the empty message with a Settings action when there are no clips')
- it('shows the offline message with Retry when loading fails with no data')
- it('keeps showing stale rows when a reload fails')
- it('reports the focused id for focus memory')
- it('Watch shows Resume from m:ss for a started hero')

`clip.test.tsx`
- it('ready: focus on Watch, up to eight marker chips, attribution shown')
- it('free learner sees Challenge mode · Plus and pressing it opens Plus')
- it('Plus learner starts Challenge mode')
- it('Add to Continue turns into In Continue after success and is hidden for started clips')
- it('preparing shows the three-minute message with Back focused')
- it('not found shows the message and Back; server error adds Retry')

`quizMachine.test.ts`
- it('a correct pick counts, shows the answer and schedules a 600 ms advance')
- it('an incorrect pick reveals the answer and waits for continue')
- it('picks after the first are ignored')
- it('advance only works after a correct pick; continue only after a reveal')
- it('the last item finishes once with the totals')
- it('replay bumps replayKey and replayEnd clears replaying')
- it('optionState marks the right answer and the picked one')

`quiz.test.tsx`
- it('shows the prompt at 44 px, a 2×2 grid of 640×140 options and "1 of n" top-right')
- it('option 0 has preferred focus while answering')
- it('a correct pick shows a blue ring and a check on the answer')
- it('an incorrect pick shows a coral ring on the pick, the answer highlighted and a focused Continue')
- it('a meaning item shows the cue native line after an incorrect pick')
- it('a cloze item offers Replay the line, which mounts the mini player on the cue span')
- it('no feedback text contains wrong or failed')
- it('the done screen shows the score and the level-up line when the level moved')
- it('an empty quiz shows the empty message with Back')

`summary.test.tsx`
- it('shows "7 neue Wörter" for German and singular for one word')
- it('shows the no-words line when nothing was saved')
- it('Quiz on TV has preferred focus; without quiz items Watch again does')
- it('Quiz on phone appears only with a connected phone and saved words')
- it('shows the phone quiz status and result')

`words.test.tsx`
- it('lists lemma, gloss, due label and clip per row with a purpose label')
- it('right and left keys change the filter without wrapping and announce it')
- it('Select plays the cue span in the mini player; a word without a manifest shows the not-available line')
- it('each filter has its own empty message with a Find a clip action')
- it('Back closes the mini player before leaving')

`settingsModel.test.ts`
- it('rows follow the plan order with current values')
- it('learning flips de and en and moves native off the learning language')
- it('native cycles through the list and skips the learning language')
- it('level steps without wrapping on left and right and wraps on Select')
- it('native line wraps; auto-pause toggles; cue size steps 100, 125, 150')
- it('pair, Lingo Plus and About open their screens on Select and ignore left and right')
- it('every action carries an announcement with the new value')

`settings.test.tsx`
- it('focus starts on the remembered row, else Learning language')
- it('left and right on the focused row call onAction and announce')
- it('shows the status line when a save did not go through')

`placement.test.ts`
- it('each language has six items in the order A1, A2, A2, B1, B1, B2')
- it('every line is at most two lines of 42 characters')
- it('all yes places B2 and all no places A1')
- it('a band passes at a mean of 0.75 and placement stops at the first band that does not pass')
- it('mostly on A1 alone places A1')

`firstRunMachine.test.ts`
- it('starts on learning with the learner values and native different from learning')
- it('choosing a language moves to speak and keeps native different')
- it('choosing what I speak saves the profile and starts placement')
- it('the sixth answer places the level, saves it and moves to pair')
- it('skip saves A2 and moves to pair')
- it('back walks one panel back and clears answers; back on the first panel is unhandled')
- it('finish on pair emits done')

`firstRun.test.tsx`
- it('learning panel shows Deutsch and English with the current one focused')
- it('speak panel shows eight native names, never the learning language')
- it('placement shows one line at a time in a cue box with Yes focused and a Skip button')
- it('pair panel shows the code and turns Later into Start watching when a phone connects, keeping one focusable')

`pair.test.tsx`
- it('shows a check and the phone name when connected, never a check glyph')
- it('always renders exactly one focusable with preferred focus')

`root.test.tsx` (fake `fetch` returning envelopes; fake transport; `react-native` stub `BackHandler` extended to record listeners)
- it('boots into first run when firstRunDone is false and into Home otherwise')
- it('shows the offline message with Retry when /me cannot be reached, and Retry boots again')
- it('Back pops the stack and is unhandled on Home')
- it('leaving the player saves progress and returns to the clip')
- it('the end of a clip saves completed progress and replaces the player with the summary')
- it('PUT /me is sent with only the changed setting')

Existing tests (`apps/api/test/me.test.ts`, `packages/contracts/test/learner.test.ts`, `learnerPatch.test.ts`, `tokens`, `session`, `qr`, `tvFocus`, `render`, `machine`, `align`, `seek`, `visibility`, `remote`, `caps`, all pipeline and API tests) keep passing.

## 10. Manual device steps (Fire TV Stick after the LING-003 rebuild; VVD when it exists — record results in a friction log either way)

Reset first: `psql $DATABASE_URL -c "update \"Learner\" set \"firstRunDone\"=false where \"deviceId\"='<tv id>'"`.
1. Launch: "I'm learning" with Deutsch focused (outline + scale). ► then Select English → "I speak" grid of eight native names without English. Back → learning panel. Back again → app exits.
2. Pick Deutsch → English → placement: one line in a cue box, "1 of 6", Yes focused. Answer six → pairing panel. Repeat with Skip → level about A2 in Settings.
3. On the pairing panel, join from a phone (LING-004 flow): within a second a check and "<name> connected" appear and the button reads "Start watching" with focus kept. Select → Home.
4. Home: skeleton cards flash on a cold start, then focus is on hero Watch. Empty Continue is not shown on a fresh learner. Cards: level chip top-left on dark grey (not yellow), duration bottom-right.
5. ▼ to a card in the second row, ► twice, Select → Clip; Back → the same card has focus (focus memory) and the row is scrolled to it.
6. From the first card of a row press ◄ → the rail opens over the content with full labels; ▼ moves through Watch/Review/Words/Plus/Settings; ► returns to hero Watch.
7. Clip: focus on Watch; up to eight marker chips; attribution at the bottom. Free learner: "Challenge mode · Plus" opens the Plus placeholder. "Add to Continue" → "In Continue"; Back → Home shows a Continue row.
8. Watch, ► a few lines, Back → Clip; Home's Continue card shows a resume bar and "Resume from m:ss".
9. Seek to the end (or watch out) → Summary: "N neue Wörter" with chips, focus on Quiz on TV. With a phone connected, "Quiz on your phone" sends the quiz (phone shows Quiz me now, LING-006); the TV shows the phone's score when it arrives.
10. Quiz on TV: a correct answer shows a blue ring and a check and moves on after ~0.6 s; an incorrect one shows a coral ring on the pick, the answer ringed in blue, the native line (meaning item), and focus on Continue. Cloze item: Replay the line plays only that line in the corner. No timer anywhere.
11. Finish two quizzes on two different clips at your level with ≥ 9/10 → "Your level is now about B1." and Settings shows about B1.
12. Rail → Words: rows sorted by due; ◄► switches All / Due today / Learned and VoiceView speaks the list name and count; Select plays the line in the mini player; Back closes it, Back again leaves.
13. Settings: ◄► changes each value and VoiceView speaks it; Subtitle size 150 % is visible in the Player; switching Learning language to English reloads Home with English clips.
14. Pull the network: cold start shows "Can't reach Lingo…" with Try again focused, VoiceView reads it; reconnect, Select → Home.
15. Repeat 4–6 and 12–13 on the VVD (Vega). Note any element that does not take `hasTVPreferredFocus` on remount or any row that does not scroll to the focused card.

## 11. Risks

- **ScrollView auto-scroll to the focused card on Vega** is unverified (Android TV does it natively). If step 15 fails, add `scrollTo` from each card's `onFocus` (`onLayout` x offset) in `Home`, behind no flag. Friction log either way.
- **Focus after data refresh**: Home refetches on every visit; if the focused card disappears from a row (e.g. Continue changes), Android picks a neighbour. Rows are keyed by slug so unchanged cards keep their native views.
- **`AccessibilityInfo.announceForAccessibility`** exists on Vega (doc below) but Amazon recommends live regions first; we use both. Fire OS TalkBack/VoiceView behaviour with live regions on TV is a device check (step 12–14).
- **Native names in Arabic/Persian script** need Noto Sans Arabic; fonts land in LING-008 (until then the system font renders them). Clips without a translation for the learner's language fall back to English native lines (`clips.ts`), and glosses are in one language only (LING-002) — say so in the LING-008 docs.
- **Migration drops `knownRank`**: harmless (nothing reads it), but irreversible; the down path is re-adding the column with default 1000.
- **Merge order**: `index.tsx` is rewritten to exports-only. LING-007 adds its Plus screen by replacing the `case 'plus':` block in `app/Root.tsx` and adding props to `RootProps` there; any LING-007 branch that edited the old inline Root must rebase onto that block.
- **Two levels of BackHandler**: Root's listener must be registered before any screen's; if Root ever re-subscribes (effect deps), it would jump ahead of the Player's. Register it once with empty deps and read `nav` through a ref.
- **Clip preparing poll** (30 s) must stop on unmount; covered by the effect cleanup.

## 12. Open questions (answered from the plan where possible)

1. *Review rail item opens what?* No TV review deck is specified; answered: **Words filtered to "Due today"** (the phone owns SM-2 grading). If the human wants a TV review quiz, that is a follow-up using `POST /me/reviews`.
2. *Are the placement lines at the right bands?* Hand-judged; answered as good enough to ship. Follow-up (LING-008 polish): assert every content word's rank in `data/freq-*.txt` sits in or below the line's band.
3. *Does the phone's quiz count toward the level rule?* Answered **no**: the phone quizzes saved words (SM-2), not the clip's quiz; only `PUT /me/level` with `source: 'quiz'` from the TV counts. LING-006 may call the same endpoint if it ever runs the clip quiz.
4. *Level chip text "A2" vs "about A2"?* Answered: the chip shows **"A2"** (the §7.3 card spec, space-limited); every row title, the hero meta, Settings and every `aria-label` say "about".
5. *Auto level-down?* Answered **no** (never discourage; Settings lowers it).
6. *Who computes the streak and "Welcome back"?* **Not answered here** — no TV screen in §8 shows it; recommend LING-006 (Progress) owns it server-side and Home gains a one-line greeting later. Orchestrator to confirm.
7. *Should Summary show Quiz on TV when no words were saved?* Answered **yes** (quiz items are per clip, not per saved word); only the headline changes.
8. *Polly pronunciation on Clip chips* (§8) — **deferred** (AWS call, not in this ticket); orchestrator to file a follow-up if wanted.

## 13. Doc URLs

- Fire TV design and UX guidelines (visible focus; Back on the top level leaves the app): https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html
- Fire TV remote input: https://developer.amazon.com/docs/fire-tv/remote-input.html
- Vega focus management (`hasTVPreferredFocus` initial mount, `nextFocus*`): https://developer.amazon.com/docs/vega/0.22/focus-management
- Vega BackHandler: https://developer.amazon.com/docs/react-native-vega/0.72/backhandler.html
- Vega AccessibilityInfo (`announceForAccessibility`): https://developer.amazon.com/docs/react-native-vega/0.72/accessibilityinfo.html · Vega accessibility (prefer live regions): https://developer.amazon.com/docs/react-native-vega/0.72/accessibility
- Vega supported libraries (react-navigation v6 listed; not used, decision §0.1): https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html
- Vega TVEventHandler (◄► on Words/Settings via RemoteSource): https://developer.amazon.com/docs/react-native-vega/0.72/using_tveventhandler.html
- Anki "mature" cards (interval ≥ 21 days → Learned): https://docs.ankiweb.net/getting-started.html#cards
- React Native `nextFocus*`: https://reactnative.dev/docs/view#nextfocusdown-android
