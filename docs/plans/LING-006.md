# LING-006 — Phone app: Join (QR/code), Live, Quiz (SM-2 server-side), Progress; EAS build

Plan for an Opus implementer. Behaviour source: full plan §2 (retrieval, SM-2, "Welcome back"), §6 (API), §7.1 (colour), §9 (phone screens) — `docs/PLAN.md` links it; excerpts in the orchestrator brief. Realtime rules: `docs/decisions/0005-realtime-session.md`. Wording: `docs/decisions/0002-wording.md`. LING-004 follow-up in `TASKS.md`: resolve `learner()` from `x-session-code`.

Invariants (apply everywhere): colours only from `tokens.color` (`packages/shared-ui/src/theme/tokens.ts`; the phone re-exports them, never a hex literal in `apps/phone/src/**`); the marker colour is only for saved-word chips and the marked word in a cue (never hints, buttons or errors); never pure white; Noto Sans for all text, Manrope 800 only for the one display number (Progress "Day 6"); tap targets ≥ 56 dp; every `Pressable`/`TextInput` has `aria-label` stating purpose and `accessibilityRole`; status is never colour alone (always text); copy lives in `apps/phone/src/strings.ts` and passes `pnpm lint:words`; quiz copy never says wrong/failed; a missed day says "Welcome back"; no fire anywhere; SM-2 stays literal and server-side (`apps/api/src/lib/sm2.ts` is **not** changed — the phone never computes an interval).

Done when: `pnpm typecheck && pnpm test && pnpm lint:words` pass (the known `apps/expo/RemoteBridge.tsx` TS2305 baseline excepted); every `it(...)` in §Acceptance exists and passes (API tests with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/test` after `pnpm --filter @lingo/api exec prisma migrate deploy`); `pnpm --filter @lingo/phone exec expo export --platform android --output-dir /tmp/lingo-phone-export` and the same with `--platform ios` succeed; the manual device steps are written to run (they are run by the human, not the implementer).

## Ownership and merge rules (other agents plan LING-005, LING-007, LING-008 in parallel)

| Shared file | What LING-006 adds or changes — nothing else |
|---|---|
| `packages/contracts/src/index.ts` | (1) replace the single `export const DueWord = …` line with the extended schema in §Interfaces; (2) add `export * from './review'` directly under `export * from './ai'`. The type-export line already exports `DueWord`; leave it. |
| `packages/contracts/src/review.ts` | **new**, owned here: `SESSION_CODE_HEADER`, `KNOWN_MIN_INTERVAL_D`, `Grade`, `ReviewResult`, `BandStat`, `ProgressStats`. |
| `apps/api/src/routes/me.ts` | (1) delete the local `const learner = …` line and import `learner` from `../lib/learner`; (2) every call `learner(req.header('x-device-id'))` becomes `learner(req)` (4 sites); (3) in `POST /words`, one line `await touchStreak(l, new Date())` right before `ok(res, { limit: false, saved }, 201)`; (4) the bodies of `GET /words` and `POST /reviews` are replaced (owned here); (5) one new handler `GET /stats` appended at the end of the file. `GET /`, `PUT /` bodies untouched apart from the call-site change. **LING-005 handlers added to me.ts (`PUT /progress`, `PUT /level`) must call `learner(req)`** — after merge, the old `learner(req.header(…))` form is a type error, which is the intended tripwire. |
| `apps/api/src/sockets.ts` | only the two handlers `socket.on('quiz:start', …)` and `socket.on('quiz:result', …)` are replaced (§Sockets). `join` and `disconnecting` untouched. |
| `apps/api/prisma/schema.prisma` | one field on `Learner`: `lastStudyDay String?`. One new migration directory `apps/api/prisma/migrations/<timestamp>_ling006_last_study_day/`. |
| `scripts/lint-words.mjs` | add `"wrong"` to `BLOCK` (no current hits in `packages/shared-ui/src` or `apps/phone/src`; re-run to confirm). |

Not touched: `apps/api/src/lib/sm2.ts` and its test, `routes/catalog.ts`, `routes/clips.ts`, `routes/iap.ts`, `routes/sessions.ts`, `packages/shared-ui/**` (tokens are read, not edited), `apps/expo/**`, `apps/vega/**`, `packages/pipeline/**`, `infra/**`, `../vega-media-kit`.

Handshake with LING-005 (state this to its implementer; nothing to build here): the TV emits `quiz:start { code, clipSlug }` from Summary → "Quiz on your phone" (LING-005 adds `emit` to `SessionTransport`); the TV listens for `quiz:result { code, correct, total }` and shows it. The server no longer echoes either event to its sender. A phone `quiz:result` is an SM-2 review tally, **not** a clip quiz score, so it must never feed `PUT /me/level`. The TV Words screen should read the extended `DueWord` from `GET /me/words` (lemma, clipTitle, cueIndex, due) rather than add its own fields, and may reuse `KNOWN_MIN_INTERVAL_D` for its "Learned" filter and `touchStreak` from `PUT /me/progress` when a clip completes.

## Files

Three groups. **G1 is independent. G2 needs only the contract types (given verbatim below), so it can start in parallel. G3 depends on G2's modules.** One implementer per group, or G2+G3 together.

### G1 — API + contracts (vitest in Node; integration tests against local Postgres)

| File | Change |
|---|---|
| `packages/contracts/src/review.ts` | new (§Interfaces). |
| `packages/contracts/src/index.ts` | the two edits in the ownership table. |
| `packages/contracts/test/review.test.ts` | new: the contract `it(...)`s. |
| `apps/api/prisma/schema.prisma` | `Learner.lastStudyDay String?` ('YYYY-MM-DD', UTC day of the last study activity). |
| `apps/api/prisma/migrations/<ts>_ling006_last_study_day/migration.sql` | generate with `pnpm --filter @lingo/api exec prisma migrate dev --name ling006_last_study_day` against the local DB; expected SQL: `ALTER TABLE "Learner" ADD COLUMN "lastStudyDay" TEXT;`. Then `pnpm db:generate`. |
| `apps/api/src/lib/day.ts` | new: `DAY_MS`, `utcDay`, `startOfNextUtcDay`, `addUtcDays`. |
| `apps/api/src/lib/streak.ts` | new: `nextStreak`, `displayStreak`, `touchStreak`. |
| `apps/api/src/lib/learner.ts` | new: `learner(req)` with `x-session-code` resolution. |
| `apps/api/src/lib/words.ts` | new: `nativeLine`, `toDueWord`. |
| `apps/api/src/lib/stats.ts` | new: `computeStats` (pure). |
| `apps/api/src/routes/me.ts` | edits per the ownership table; route bodies in §Routes. |
| `apps/api/src/sockets.ts` | quiz handlers per §Sockets. |
| `apps/api/scripts/fake-tv.ts` | new: a stand-in TV for manual phone testing without a Fire TV (§Fake TV). Not in `tsconfig` `include` if `src`-only; run with `pnpm --filter @lingo/api exec tsx scripts/fake-tv.ts`. |
| `apps/api/test/day.test.ts`, `streak.test.ts`, `words.test.ts`, `stats.test.ts` | unit tests (no DB). |
| `apps/api/test/me-review.test.ts` | integration (supertest on `createServer().app`, real DB). |
| `apps/api/test/quiz-events.test.ts` | integration (Socket.IO over a local server, same harness pattern as `test/realtime.test.ts`; do **not** edit `realtime.test.ts`). |
| `scripts/lint-words.mjs` | add `"wrong"`. |

### G2 — phone logic (pure TypeScript; vitest in Node)

| File | Change |
|---|---|
| `apps/phone/package.json` | §Phone package. |
| `apps/phone/tsconfig.json` | `"include": ["src", "test"]`, `"types": ["react", "node", "vitest/globals"]`. |
| `apps/phone/vitest.config.ts` | new; same shape as `packages/shared-ui/vitest.config.ts`: `test: { globals: true, setupFiles: ['./test/setup.tsx'] }`, alias `react-native` → `./test/stubs/react-native.ts`. |
| `apps/phone/test/stubs/react-native.ts`, `apps/phone/test/setup.tsx` | copy the shared-ui pair, then add hosts `TextInput`, `KeyboardAvoidingView`, `ActivityIndicator`, `FlatList` (render `data.map(renderItem)`), and `AccessibilityInfo: { announceForAccessibility: vi.fn() }`. `vi.mock` stand-ins: `expo-speech` (`speak`, `stop` spies), `expo-camera` (`CameraView` host, `useCameraPermissions` → `[{ granted: true }, vi.fn()]`), `expo-device` (`deviceName: 'Test phone'`), `expo-linking` (`useURL` → `null`), `expo-crypto` (`randomUUID` → fixed), `@react-native-async-storage/async-storage` (in-memory map), `react-native-safe-area-context` (`SafeAreaView` host, `SafeAreaProvider` passthrough), `expo-status-bar` (`StatusBar` → null). |
| `apps/phone/src/theme.ts` | new (§Interfaces). |
| `apps/phone/src/strings.ts` | new (§Strings). |
| `apps/phone/src/lib/codeInput.ts` | new: six-box code entry logic. |
| `apps/phone/src/lib/deck.ts` | new: the review deck state machine (local SM-2 same-session repeats; no interval maths). |
| `apps/phone/src/lib/progress.ts` | new: Progress view-model. |
| `apps/phone/src/lib/api.ts` | new: typed REST client (identity headers, envelope + Zod parse, `ApiError`). |
| `apps/phone/src/lib/storage.ts` | new: device id, remembered TV, server address. |
| `apps/phone/src/lib/link.ts` | new: the Socket.IO wrapper (join, events, `quiz:result`). |
| `apps/phone/src/lib/speech.ts` | new: `speakWord`. |
| `apps/phone/src/state/app.ts` | new: `AppState`, `AppEvent`, `appReducer`, `initialApp`. |
| `apps/phone/test/codeInput.test.ts`, `deck.test.ts`, `progress.test.ts`, `api.test.ts`, `storage.test.ts`, `link.test.ts`, `app.test.ts`, `strings.test.ts` | the `it(...)`s in §Acceptance, verbatim. |

### G3 — phone UI, config, build

| File | Change |
|---|---|
| `apps/phone/src/components/Button.tsx` | new: `Button` (primary = interactive fill + ground text; secondary = surface2 + text; `minHeight: tap`; disabled = 0.5 opacity + `aria-disabled`). |
| `apps/phone/src/components/CodeBoxes.tsx` | new: six `TextInput`s driven by `codeInput.ts`. |
| `apps/phone/src/components/WordChip.tsx` | new: marker chip; open state shows gloss + example + "Hear it". |
| `apps/phone/src/components/BandBar.tsx` | new: one bar (track surface2, fill interactive) + text value. |
| `apps/phone/src/components/TabBar.tsx` | new: Live · Review · Progress (no drawer). |
| `apps/phone/src/screens/JoinScreen.tsx`, `LiveScreen.tsx`, `QuizScreen.tsx`, `ProgressScreen.tsx` | new, presentational + their own fetches through the injected `PhoneApi` (§Screens). |
| `apps/phone/src/App.tsx` | rewrite: fonts, store, api, link, reducer, screen switch, tab bar. All of today's behaviour is kept (deep link, scan, single socket) but moved into the modules above. |
| `apps/phone/test/screens.test.tsx` | react-test-renderer tests (§Acceptance). |
| `apps/phone/test/config.test.ts` | eas.json / app.json / package.json checks. |
| `apps/phone/app.json` | §App config. |
| `apps/phone/eas.json` | new, §EAS. |
| `apps/phone/scripts/eas-pre-install.sh` | new, §EAS. `chmod +x`. |
| `apps/phone/README.md` | new, ≤ 25 lines: run locally (`EXPO_PUBLIC_API_URL=http://<LAN-IP>:4000 pnpm --filter @lingo/phone start`), tests, the build commands, link to the manual checklist in this plan. |
| `pnpm-lock.yaml` | updated by `pnpm i`. |

## Interfaces (typed; implement exactly)

### Contracts — `packages/contracts/src/index.ts` (replacement line) and `review.ts`

```ts
// index.ts — replaces the old DueWord line (fields are a superset; old consumers keep working)
export const DueWord = z.object({
  savedWordId: z.string(), highlightId: z.string(),
  word: z.string(), lemma: z.string(), gloss: z.string(), example: z.string(), level: Level,
  due: z.string(), reps: z.number().int(), lapses: z.number().int(), intervalD: z.number().int(),
  clipSlug: z.string(), clipTitle: z.string(),
  cueIndex: z.number().int(), cueText: z.string(), cueNative: z.string().nullable(),
})

// review.ts
import { z } from 'zod'
import { Level } from './base'
/** Header the phone sends so /me/* resolves the TV's learner (the code is the pairing secret; docs/decisions/0005). */
export const SESSION_CODE_HEADER = 'x-session-code'
/** A word counts as known once it has survived the 1-day review: SM-2 interval ≥ 6 days. LING-005's "Learned" filter may reuse this. */
export const KNOWN_MIN_INTERVAL_D = 6
export const Grade = z.enum(['again', 'hard', 'good', 'easy'])
export const ReviewResult = z.object({
  savedWordId: z.string(), ease: z.number(), intervalD: z.number().int(), reps: z.number().int(), lapses: z.number().int(), due: z.string().datetime(),
})
export const BandStat = z.object({ level: Level, saved: z.number().int().min(0), known: z.number().int().min(0) })
export const ProgressStats = z.object({
  level: Level,
  bands: z.array(BandStat).length(4),            // always A1, A2, B1, B2 in that order
  clipsWatched: z.number().int().min(0),
  streak: z.object({ day: z.number().int().min(0), welcomeBack: z.boolean() }),
  dueNow: z.number().int().min(0),              // due before the next UTC midnight, already reviewed at least once
  newNow: z.number().int().min(0),              // due now and never reviewed (reps 0 and lapses 0)
  dueTomorrow: z.number().int().min(0),         // due during the next UTC day
})
export type Grade = z.infer<typeof Grade>; export type ReviewResult = z.infer<typeof ReviewResult>
export type BandStat = z.infer<typeof BandStat>; export type ProgressStats = z.infer<typeof ProgressStats>
```

`ReviewPost` in index.ts stays as is (its enum equals `Grade`).

### API libs

```ts
// lib/day.ts — every "day" in LING-006 is a UTC calendar day (see Open questions)
export const DAY_MS = 86_400_000
export function utcDay(d: Date): string                      // 'YYYY-MM-DD' = d.toISOString().slice(0, 10)
export function startOfNextUtcDay(d: Date): Date             // next 00:00:00.000Z strictly after d's day start
export function addUtcDays(day: string, n: number): string   // '2026-10-01', -1 → '2026-09-30'

// lib/streak.ts
export interface StreakState { streak: number; lastStudyDay: string | null }
/** today === last → unchanged; last === yesterday → streak + 1; otherwise (null or older) → 1. */
export function nextStreak(s: StreakState, today: string): StreakState
/** last is today or yesterday → { day: streak, welcomeBack: false }; null → { day: 0, welcomeBack: false }; older → { day: 0, welcomeBack: true }. */
export function displayStreak(s: StreakState, today: string): { day: number; welcomeBack: boolean }
/** Applies nextStreak(utcDay(now)) and writes { streak, lastStudyDay } only when they change. Called from POST /me/reviews and POST /me/words. */
export async function touchStreak(l: { id: string; streak: number; lastStudyDay: string | null }, now: Date): Promise<void>

// lib/learner.ts
import type { Learner } from '@prisma/client'
export interface HeaderSource { header(name: string): string | undefined }
/**
 * x-session-code present and non-empty → trim + uppercase; fails SESSION_CODE_RE → AppError(400, 'VALIDATION', 'x-session-code: six characters, no 0/O/1/I');
 * no Session with that code → AppError(404, 'UNKNOWN_CODE', 'No TV with that code'); else the session's learner, lastActive = now.
 * Otherwise: upsert by x-device-id (default 'anon'), lastActive = now — exactly today's behaviour. The session code wins over the device id.
 */
export async function learner(req: HeaderSource): Promise<Learner>

// lib/words.ts
/** Cue.native is Json { [lang]: text }. Returns json[native] if a string, else json.en if a string, else null. Never throws on odd JSON. */
export function nativeLine(json: unknown, native: string): string | null
type SavedRow = { id: string; due: Date; reps: number; lapses: number; intervalD: number
  highlight: { id: string; word: string; lemma: string; gloss: string; example: string; level: 'A1' | 'A2' | 'B1' | 'B2'
    cue: { index: number; text: string; native: unknown; clip: { slug: string; title: string } } } }
export function toDueWord(r: SavedRow, native: string): DueWord   // due as ISO string

// lib/stats.ts
export function computeStats(a: {
  level: Level; words: Array<{ intervalD: number; reps: number; lapses: number; due: Date; level: Level }>
  clipsWatched: number; streak: StreakState; now: Date
}): ProgressStats
// bands: per level, saved = count, known = count with intervalD ≥ KNOWN_MIN_INTERVAL_D
// t = startOfNextUtcDay(now), t2 = t + DAY_MS; dueNow/newNow split words with due < t by isNew = reps === 0 && lapses === 0; dueTomorrow = t ≤ due < t2
// streak = displayStreak(streak, utcDay(now))
```

### API routes (`apps/api/src/routes/me.ts`)

```ts
// GET /me/words?due=today — owned by LING-006
const l = await learner(req); const now = new Date()
const rows = await db.savedWord.findMany({
  where: { learnerId: l.id, ...(req.query.due === 'today' ? { due: { lt: startOfNextUtcDay(now) } } : {}) },
  include: { highlight: { include: { cue: { include: { clip: { select: { slug: true, title: true } } } } } } },
  orderBy: [{ due: 'asc' }, { createdAt: 'asc' }],
})
ok(res, DueWord.array().parse(rows.map((r) => toDueWord(r, l.native))))

// POST /me/reviews — owned by LING-006
const l = await learner(req)
const { savedWordId, grade } = valid
const w = await db.savedWord.findFirst({ where: { id: savedWordId, learnerId: l.id } })
if (!w) throw notFound('Saved word')                      // another learner's id is a 404, nothing written
const now = new Date()
const n = sm2({ ease: w.ease, intervalD: w.intervalD, reps: w.reps, lapses: w.lapses }, grade)
const due = new Date(now.getTime() + n.intervalD * DAY_MS) // replaces the local-time setDate()
await db.$transaction([db.review.create({ data: { savedWordId, grade } }), db.savedWord.update({ where: { id: savedWordId }, data: { ...n, due } })])
await touchStreak(l, now)
ok(res, ReviewResult.parse({ savedWordId, ...n, due: due.toISOString() }))   // 200

// GET /me/stats — new, appended
const l = await learner(req)
const words = await db.savedWord.findMany({ where: { learnerId: l.id }, select: { intervalD: true, reps: true, lapses: true, due: true, highlight: { select: { level: true } } } })
const clipsWatched = await db.progress.count({ where: { learnerId: l.id, completed: true } })
ok(res, ProgressStats.parse(computeStats({ level: l.level, words: words.map((w) => ({ ...w, level: w.highlight.level })), clipsWatched, streak: { streak: l.streak, lastStudyDay: l.lastStudyDay }, now: new Date() })))
```

Use `next(e)` in the existing try/catch shape; `AppError` from `learner()` flows to `errorHandler` (400/404 envelopes).

### Sockets (`apps/api/src/sockets.ts`, the two handlers only)

```ts
socket.on('quiz:start', (p) => guard(() => {
  const r = QuizStartPayload.safeParse(p)
  if (!r.success) return fail({ code: 'VALIDATION', message: validationMessage(r.error.issues) })
  if (socket.data.code !== r.data.code) return fail({ code: 'VALIDATION', message: 'Join the session first' })
  socket.to(r.data.code).emit('quiz:start', r.data)        // everyone in the room except the sender
})())
// quiz:result: identical shape with QuizResultPayload and 'quiz:result'
```

Docs: `socket.to(room).emit` excludes the sender — https://socket.io/docs/v4/emit-cheatsheet/.

### Phone modules

```ts
// src/theme.ts — the phone reuses the TV token values; sizes are phone dp, not 1080p px
import { tokens } from '../../../packages/shared-ui/src/theme/tokens' // relative on purpose: no @lingo/shared-ui dependency (it would pull the kit link into the phone)
export const color = tokens.color
export const font = { regular: 'NotoSans_400Regular', semibold: 'NotoSans_600SemiBold', display: 'Manrope_800ExtraBold' } as const
export const type = {
  display: { fontFamily: font.display, fontSize: 40, lineHeight: 48 },        // "Day 6" only
  title:   { fontFamily: font.semibold, fontSize: 24, lineHeight: 30 },
  card:    { fontFamily: font.semibold, fontSize: 36, lineHeight: 44 },       // quiz front
  body:    { fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
  label:   { fontFamily: font.semibold, fontSize: 15, lineHeight: 20, letterSpacing: 0.3 },
  code:    { fontFamily: font.semibold, fontSize: 30, lineHeight: 36 },
} as const
export const tap = 56
export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32 } as const
export const radius = { chip: 6, button: 8, card: 12 } as const

// src/lib/codeInput.ts
export const CODE_LEN = 6
export type Boxes = readonly string[]                 // length 6; '' or one char
export function emptyBoxes(): string[]
/**
 * Text typed or pasted into box i. If extractSessionCode(text) finds a full code (paste, autofill, a joinUrl) → all six boxes, focus 5, complete = code.
 * Else uppercase, keep chars matching /[A-HJ-NP-Z2-9]/; none kept and text non-empty → rejected: true, boxes unchanged.
 * Kept chars fill boxes i, i+1, … (overflow dropped); focus = index after the last filled (max 5); complete = joined code when all six are filled.
 */
export function typeInto(b: Boxes, i: number, text: string): { boxes: string[]; focus: number; complete: string | null; rejected: boolean }
/** Box i non-empty → clear i, focus i. Box i empty and i > 0 → clear i − 1, focus i − 1. */
export function backspace(b: Boxes, i: number): { boxes: string[]; focus: number }

// src/lib/deck.ts — SM-2 same-session rule (SuperMemo): items graded below "good" (again, hard) come back at the end of today's session
// until graded good or easy. Only the first grade of a word in a session is posted; repeats are local and never change the schedule.
export interface DeckCard { word: DueWord; repeat: boolean }
export interface DeckState {
  queue: DeckCard[]; flipped: boolean; posting: boolean; error: boolean; done: boolean
  firstPass: { graded: number; correct: number }   // correct = good | easy on the first grade
}
export type DeckEvent =
  | { type: 'flip' }
  | { type: 'gradeStart' }                         // only when !posting && flipped
  | { type: 'gradeOk'; grade: Grade }
  | { type: 'gradeFail' }
export function isNew(w: DueWord): boolean         // reps === 0 && lapses === 0
export function deckCounts(words: readonly DueWord[]): { due: number; fresh: number } // due = !isNew, fresh = isNew
/** Reviewed words first (input order = due asc), then new words; words whose clipSlug === firstClip go first within each group. Stable. */
export function buildDeck(words: readonly DueWord[], firstClip?: string | null): DeckCard[]
export function initialDeck(cards: DeckCard[]): DeckState  // done = cards.length === 0
export function deckReducer(s: DeckState, e: DeckEvent): DeckState
// flip → flipped true. gradeStart → posting true, error false (ignored unless flipped && !posting).
// gradeOk → head card leaves the queue; if !repeat, firstPass.graded++ and correct++ for good|easy; again|hard → push { word, repeat: true } to the end;
//           flipped false, posting false, done = queue empty.  gradeFail → posting false, error true, card stays, flipped stays.
export function needsPost(c: DeckCard): boolean    // !c.repeat

// src/lib/progress.ts
export function streakView(s: ProgressStats['streak']): { kind: 'day' | 'welcome' | 'first'; text: string } // welcomeBack → welcome; day ≥ 1 → day; else first
export function bandRows(b: ProgressStats['bands']): Array<{ level: Level; known: number; saved: number; fraction: number; value: string; label: string }> // fraction = saved ? known / saved : 0
export function nextReview(s: Pick<ProgressStats, 'dueNow' | 'newNow' | 'dueTomorrow'>): { text: string; canReview: boolean }
// dueNow + newNow > 0 → strings.progress.dueNow(n), canReview; else dueTomorrow > 0 → strings.progress.dueTomorrow(n); else strings.progress.nothingDue

// src/lib/api.ts
export interface Identity { deviceId: string; tvCode: string | null }
export class ApiError extends Error { constructor(public status: number, public code: string, message: string) }
export interface PhoneApi {
  me(): Promise<LearnerDto>                                  // GET /me
  dueWords(): Promise<DueWord[]>                             // GET /me/words?due=today
  review(savedWordId: string, grade: Grade): Promise<ReviewResult> // POST /me/reviews
  stats(): Promise<ProgressStats>                            // GET /me/stats
}
/** Headers on every call: content-type json, x-device-id; plus x-session-code (SESSION_CODE_HEADER) when identity().tvCode.
 *  { success: false, error } → ApiError(status, error.code, error.message); fetch throws → ApiError(0, 'NETWORK', …); data parsed with the Zod schema. */
export function createApi(baseUrl: () => string, identity: () => Identity, fetchImpl?: typeof fetch): PhoneApi

// src/lib/storage.ts
export interface KV { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> }
export const KEYS = { deviceId: 'lingo.deviceId', tv: 'lingo.tv', apiUrl: 'lingo.apiUrl' } as const
export interface Store {
  deviceId(): Promise<string>            // created once: 'phone-' + newId(), then stable
  tv(): Promise<string | null>           // stored value that fails SESSION_CODE_RE → null
  setTv(code: string): Promise<void>; forgetTv(): Promise<void>
  apiUrl(): Promise<string | null>; setApiUrl(u: string | null): Promise<void>
}
export function createStore(kv: KV, newId: () => string): Store
/** Trim; add 'http://' when there is no scheme; drop trailing '/'; must parse with new URL() and be http(s) → else null. */
export function normaliseApiUrl(input: string): string | null

// src/lib/link.ts
export interface LinkHandlers {
  onJoined(): void                       // phone:connected for our code (the server sends it to the whole room, us included)
  onRefused(e: SessionErrorPayload): void // session:error → the socket is closed first (a refused join is never re-sent)
  onTransport(up: boolean): void         // connect / disconnect
  onUnreachable(): void                  // connect_error before the first successful connect of this join (once)
  onWordSaved(p: WordSavedPayload): void
  onQuizStart(p: QuizStartPayload): void
}
export interface PhoneLink {
  join(code: string, deviceName?: string): void // closes any previous socket first; emits join on every connect (rooms are lost on reconnect)
  sendQuizResult(correct: number, total: number): boolean // emits only when connected and joined; returns whether it did
  leave(): void
}
export type Connect = (url: string) => Socket<ServerToClientEvents, ClientToServerEvents>
export function createPhoneLink(baseUrl: () => string, h: LinkHandlers, connect?: Connect): PhoneLink // default: io(url, { transports: ['websocket'], forceNew: true })

// src/lib/speech.ts — on-device TTS, no AWS (expo-speech)
export function langTag(l: Lang): string          // de → 'de-DE', en → 'en-US'
export function speakWord(word: string, l: Lang): void // Speech.stop(); Speech.speak(word, { language: langTag(l), rate: 0.9 })

// src/state/app.ts
export type Screen = 'join' | 'live' | 'quiz' | 'progress'
export type LinkState = 'none' | 'joining' | 'joined' | 'reconnecting'
export type Hint = 'badCode' | 'unknownCode' | 'unreachable' | 'cameraOff' | 'invalidChar'
export interface AppState {
  screen: Screen; tv: string | null; pending: string | null; link: LinkState; hint: Hint | null
  saved: WordSavedPayload[]; open: string | null; quizOffer: { clipSlug: string | null } | null; deckClip: string | null
}
export type AppEvent =
  | { type: 'boot'; tv: string | null }               // tv → screen live, link joining; else screen join
  | { type: 'submit'; code: string }                  // pending = code, link joining, hint null
  | { type: 'joined' }                                // tv = pending ?? tv, pending null, link joined, screen join → live
  | { type: 'refused' }                               // tv null, pending null, link none, screen join, hint unknownCode
  | { type: 'unreachable' }                           // link none unless tv (then reconnecting), hint unreachable; screen unchanged
  | { type: 'transport'; up: boolean }                // joined + down → reconnecting; reconnecting + up → joining
  | { type: 'wordSaved'; w: WordSavedPayload }        // append unless savedWordId already present
  | { type: 'quizStart'; clipSlug: string | null }    // quizOffer set; screen unchanged
  | { type: 'toggleWord'; id: string }                // open = open === id ? null : id
  | { type: 'go'; screen: Screen }                    // 'live' with tv null → 'join'; 'quiz' → deckClip = quizOffer?.clipSlug ?? null, quizOffer null
  | { type: 'hint'; hint: Hint | null }
  | { type: 'forgetTv' }                              // tv null, pending null, link none, saved [], open null, quizOffer null, screen join
export const initialApp: AppState
export function appReducer(s: AppState, e: AppEvent): AppState
```

Side effects live in `App.tsx` only: `joined` → `store.setTv(code)`; `refused` and an `ApiError` with code `UNKNOWN_CODE` from any call → `store.forgetTv()` + dispatch `refused`; `forgetTv` → `link.leave()`.

## Screens (G3)

All screens render inside `SafeAreaView` (react-native-safe-area-context) on `color.ground`, padding `space.l`. Hints render as `Text` with `accessibilityRole="alert"`, `accessibilityLiveRegion="polite"`, colour `color.text` (never marker).

- **JoinScreen** `{ hint: Hint | null; joining: boolean; apiUrl: string; onCode(code: string): void; onScanned(data: string): void; onReview(): void; onApiUrl(u: string): void; onHint(h: Hint | null): void }`. Title `strings.join.title`. `CodeBoxes` (six boxes, each `aria-label` `strings.join.box(i)`, `autoCapitalize="characters"`, `autoCorrect={false}`, `maxLength` 6 on every box so a paste arrives whole; `onChangeText` → `typeInto`, focus moves via refs; `onKeyPress` Backspace → `backspace`; `complete` → `onCode`; `rejected` → `onHint('invalidChar')`). Buttons: Join (primary; disabled until six filled), Scan the TV's code, Review words. Scanning mode = today's `CameraView` flow (permission request, `scanned` ref, "Type it instead"). While `joining`: an `ActivityIndicator` (colour interactive) + text `strings.join.joining`. Footer: `strings.join.server(apiUrl)` + Change button → an inline `TextInput` (`aria-label` `strings.join.serverLabel`) + Save; invalid → stays open with `strings.join.serverInvalid`.
- **LiveScreen** `{ link: LinkState; saved: WordSavedPayload[]; open: string | null; learning: Lang; quizOffer: boolean; onToggle(id: string): void; onQuiz(): void; onForget(): void }`. Line 1 (label, textSecondary): `strings.live.status[link]`. Title: latest `saved.at(-1)?.clipTitle ?? strings.live.noClip`. Chips in arrival order (`WordChip`: marker fill, ground text; `aria-label` `strings.live.chipLabel(word)`); pressing a chip toggles open **and** speaks the word when it opens; open chip shows gloss (body) and example (body italic) and a "Hear it" button (`aria-label` `strings.live.hearLabel(word)`). Empty: `strings.live.empty`. "Quiz me now" (primary) is rendered only when `quizOffer`; on appearance call `AccessibilityInfo.announceForAccessibility(strings.live.quizReady)`. Footer secondary button "Use another TV" → `onForget`.
- **QuizScreen** `{ api: PhoneApi; firstClip: string | null; learning: Lang; onResult(correct: number, total: number): boolean; onProgress(): void }`. On mount `api.dueWords()` → `buildDeck` → `deckReducer`. Loading: `ActivityIndicator`. Load error: `strings.quiz.loadError` + Try again. Header: `strings.quiz.counts(due, fresh)` from `deckCounts` of the loaded list (fixed for the session) + `strings.quiz.position(i, n)`. Card (surface1, radius card, flex 1, `aria-label` front `strings.quiz.frontLabel(word)` / back `strings.quiz.backLabel(word, gloss)`): front = word (`type.card`) + `strings.quiz.reveal`; tap → `flip`. Back = word, gloss (title), the cue line with the word marked (marker background, ground text — match by the same strip rule as shared-ui `stripToken`; if no token matches, show the cue unmarked), native line (`color.nativeCue`, body) when `cueNative`, and a speak button. Grade row (only when flipped): four `Button`s, equal `flex: 1`, same secondary style for all four (no colour hints a "right" grade), order Again · Hard · Good · Easy, `aria-label` `strings.quiz.gradeLabel(grade, word)`, all disabled while `posting`. Grade: `gradeStart`; if `needsPost(card)` → `api.review(...)` → `gradeOk` / `gradeFail` (shows `strings.quiz.retry`); else `gradeOk` directly. Done: title `strings.quiz.doneTitle`, body `strings.quiz.doneBody(firstPass.graded)`; once, on entering done with `firstPass.graded > 0`, call `onResult(correct, graded)` and, when it returns true, show `strings.quiz.sentToTv`; button See progress. Empty list: `strings.quiz.emptyTitle` + `strings.quiz.emptyBody`. No score, percentage, or right/wrong language anywhere on the phone.
- **ProgressScreen** `{ api: PhoneApi; onReview(): void }`. On mount `api.stats()`. Top: `streakView` — `day` → `strings.progress.day(n)` in `type.display`; `welcome` → `strings.progress.welcomeBack` in `type.title`; `first` → `strings.progress.first`. Section title `strings.progress.bandsTitle` (says "approximate"). Four `BandBar`s (level label · bar track surface2, fill interactive, height 12, radius 6, width = fraction · 100 % · value text `known of saved`; `aria-label` row label from `bandRows`; the number is always printed, so the bar is never the only carrier). `strings.progress.clips(n)`. `nextReview` text; `canReview` → primary "Review now" → `onReview`. No icons, no fire, no confetti.
- **TabBar** `{ screen: Screen; hasTv: boolean; onGo(s: Screen): void }`, shown on every screen except Join: three equal tabs Live · Review · Progress, each ≥ 56 high, `accessibilityRole="tab"`, `aria-selected` on the current one; selected = interactive text + a 3 dp interactive top border **and** semibold weight (not colour alone).
- **App.tsx**: `useFonts({ NotoSans_400Regular, NotoSans_600SemiBold, Manrope_800ExtraBold })` (render a ground-coloured `View` until loaded); `SafeAreaProvider`; `StatusBar style="light"`; store from AsyncStorage + `Crypto.randomUUID`; `apiUrl = stored ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'`; boot → `store.tv()` → `boot` → when tv, `link.join(tv, Device.deviceName)`; `api.me()` once per tv change for `learning` (default 'de' until loaded); deep links via `Linking.useURL()` exactly as today (`extractSessionCode`, de-duplicated by last URL); `onCode` → `submit` + `link.join`; Review from Join → `go('quiz')` (device identity, works without TV); `onResult` → `link.sendQuizResult`.

## Strings (`apps/phone/src/strings.ts`, all phone copy)

```ts
export const strings = {
  join: { title: 'Enter the code on your TV', box: (i: number) => `Code character ${i + 1} of 6`, join: 'Join', scan: "Scan the TV's code",
    scanTitle: 'Point at the code on the TV', scanLabel: "Camera, looking for the TV's QR code", typeInstead: 'Type it instead', review: 'Review words',
    joining: 'Joining your TV…', server: (u: string) => `Lingo server: ${u}`, serverChange: 'Change', serverLabel: 'Lingo server address', serverSave: 'Save',
    serverInvalid: 'That address does not look right. Example: 192.168.1.20:4000' },
  hint: { badCode: 'Check the six characters on the TV.', unknownCode: 'No TV with that code. Check the code on the TV.',
    unreachable: "Can't reach Lingo. Check that the phone is on the same Wi-Fi.", cameraOff: 'Camera is off. Type the code instead.',
    invalidChar: 'Codes use letters and the digits 2–9, never 0, O, 1 or I.' },
  live: { status: { none: 'Not connected', joining: 'Connecting to your TV…', joined: 'Connected to your TV', reconnecting: 'Reconnecting…' },
    noClip: 'Watching on your TV', empty: 'Words you save on the TV appear here.', chipLabel: (w: string) => `${w}. Show the meaning and hear it`,
    hear: 'Hear it', hearLabel: (w: string) => `Hear ${w}`, quizNow: 'Quiz me now', quizReady: 'The clip is over. Quiz me now is ready.', forget: 'Use another TV' },
  quiz: { counts: (due: number, fresh: number) => `${due} due · ${fresh} new`, position: (i: number, n: number) => `${i} of ${n}`,
    reveal: 'Tap to see the meaning', frontLabel: (w: string) => `${w}. Tap to see the meaning`, backLabel: (w: string, g: string) => `${w}: ${g}`,
    grades: { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' },
    gradeLabel: (g: 'again' | 'hard' | 'good' | 'easy', w: string) => `${strings.quiz.grades[g]}: schedule ${w}`,
    retry: "That didn't reach Lingo. Try again.", loadError: "Can't load your words right now.", tryAgain: 'Try again',
    doneTitle: 'Done for today', doneBody: (n: number) => (n === 1 ? '1 word reviewed. See you tomorrow.' : `${n} words reviewed. See you tomorrow.`),
    sentToTv: 'Sent to your TV', seeProgress: 'See progress', emptyTitle: 'Nothing to review right now.', emptyBody: 'Words you save on the TV land here.' },
  progress: { day: (n: number) => `Day ${n}`, welcomeBack: 'Welcome back', first: 'Your first review starts day 1.',
    bandsTitle: 'Words known by level (approximate)', bandValue: (k: number, s: number) => `${k} of ${s}`,
    bandLabel: (l: string, k: number, s: number) => `Level ${l}, approximate: ${k} of ${s} saved words known`,
    clips: (n: number) => (n === 1 ? '1 clip watched' : `${n} clips watched`),
    dueNow: (n: number) => (n === 1 ? '1 word to review now' : `${n} words to review now`),
    dueTomorrow: (n: number) => (n === 1 ? '1 word to review tomorrow' : `${n} words to review tomorrow`),
    nothingDue: 'Nothing to review yet.', reviewNow: 'Review now', loadError: "Can't load your progress right now." },
  tabs: { live: 'Live', review: 'Review', progress: 'Progress' },
} as const
```

## Phone package (`apps/phone/package.json`)

- dependencies (Expo SDK 54 versions from `expo/bundledNativeModules.json` 54.0.37): add `"@react-native-async-storage/async-storage": "2.2.0"`, `"expo-speech": "~14.0.8"`, `"expo-font": "~14.0.12"`, `"expo-crypto": "~15.0.9"`, `"expo-build-properties": "~1.0.10"`, `"react-native-safe-area-context": "~5.6.0"`, `"@expo-google-fonts/noto-sans": "^0.4.2"`, `"@expo-google-fonts/manrope": "^0.4.2"`; bump `"react-native": "0.81.5"` (SDK 54's pin; `expo-camera` → `~17.0.10`, `expo-notifications` → `~0.32.17`, `expo-status-bar` → `~3.0.9` to match). Leave `expo-notifications` in place (unused here). Run `pnpm --filter @lingo/phone exec expo install --check` afterwards; it must report nothing to fix.
- devDependencies: `"vitest": "^2.1.0"`, `"react-test-renderer": "19.1.0"`, `"@types/react-test-renderer": "^19.1.0"`, `"@expo/eas-json": "24.8.0"`.
- scripts: **remove `"build"`** (turbo's `build` task would start a cloud EAS build from `pnpm build`); add `"test": "vitest run"`, `"build:android": "npx eas-cli@latest build -p android --profile preview"`, `"build:ios": "npx eas-cli@latest build -p ios --profile preview"`, `"build:ios-sim": "npx eas-cli@latest build -p ios --profile preview-simulator"`, `"eas-build-pre-install": "bash scripts/eas-pre-install.sh"`.

## App config (`apps/phone/app.json`)

```json
{ "expo": {
  "name": "Lingo Phone", "slug": "lingo-phone", "version": "0.1.0", "userInterfaceStyle": "dark", "scheme": "lingo",
  "backgroundColor": "#0F151B",
  "ios": { "bundleIdentifier": "dev.moizp.lingo.phone", "buildNumber": "1",
    "infoPlist": { "NSLocalNetworkUsageDescription": "Lingo talks to your TV session on this Wi-Fi.",
                   "NSAppTransportSecurity": { "NSAllowsArbitraryLoads": true, "NSAllowsLocalNetworking": true } } },
  "android": { "package": "dev.moizp.lingo.phone", "versionCode": 1 },
  "plugins": [
    ["expo-camera", { "cameraPermission": "Lingo uses the camera to scan the code on your TV.", "recordAudioAndroid": false }],
    ["expo-build-properties", { "android": { "usesCleartextTraffic": true } }],
    "expo-font"
  ]
} }
```

`backgroundColor` is the one hex in config; it must equal `tokens.color.ground` (a config test asserts it). Cleartext/ATS is for the laptop API on the LAN during internal testing; remove when the API has HTTPS (see Risks). `eas init` will add `extra.eas.projectId` and `owner` — commit that change (manual step M3).

## EAS (`apps/phone/eas.json`, `scripts/eas-pre-install.sh`)

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "local" },
  "build": {
    "preview": {
      "distribution": "internal",
      "node": "22.14.0",
      "pnpm": "9.15.9",
      "env": { "EXPO_PUBLIC_API_URL": "http://192.168.1.20:4000" },
      "android": { "buildType": "apk" },
      "ios": { "simulator": false }
    },
    "preview-simulator": { "extends": "preview", "ios": { "simulator": true } }
  }
}
```

Field set checked against the joi schema in `@expo/eas-json` 24.8.0 (`build/build/schema.js`: `distribution` store|internal, `android.buildType` apk|app-bundle, `ios.simulator`, `extends`, `env`, `node`/`pnpm` semver). The server address in `env` is a placeholder; the in-app "Lingo server" field overrides it without a rebuild.

`scripts/eas-pre-install.sh` — the root `package.json` overrides `@moizp/vega-media-kit` to `link:../vega-media-kit`, a sibling checkout that does not exist on an EAS builder; the phone never imports the kit, so give the link a stub target before `pnpm install`:

```bash
#!/usr/bin/env bash
# EAS npm hook (runs before install): https://docs.expo.dev/build-reference/npm-hooks/
set -euo pipefail
[ "${EAS_BUILD:-}" = "true" ] || exit 0
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
KIT="$ROOT/../vega-media-kit"
if [ ! -f "$KIT/package.json" ]; then
  mkdir -p "$KIT"
  printf '{"name":"@moizp/vega-media-kit","version":"0.1.0-alpha.0","main":"index.js"}\n' > "$KIT/package.json"
  printf 'module.exports = {}\n' > "$KIT/index.js"
  echo "eas-pre-install: stubbed $KIT (phone does not use the kit)"
fi
```

## Fake TV (`apps/api/scripts/fake-tv.ts`, manual testing aid)

`tsx scripts/fake-tv.ts [--api http://localhost:4000] [--device fake-tv-1]`: POST /sessions with `x-device-id`, print the code and `lingo://join/<code>`; join the room as `tv`; print `phone:connected` / `phone:disconnected` / `quiz:result` as they arrive; read stdin commands: `s` = POST /me/words with the next highlight (first 10 highlights from `db.highlight.findMany({ take: 10, orderBy: { id: 'asc' } })`; if none, create a clip `fake-tv-demo` with one cue and three highlights first) and `sessionCode`; `q` = emit `quiz:start { code, clipSlug }` of the last saved word; `x` = exit. Under 80 lines, no tests.

## Acceptance tests

API — unit (`apps/api/test/*.test.ts`, no DB)

`day.test.ts`
- it('utcDay is the ISO date of the instant in UTC')
- it('startOfNextUtcDay at 23:59:59.999Z is one millisecond later and at 00:00Z is a full day later')
- it('addUtcDays crosses month and year boundaries')

`streak.test.ts`
- it('the first study day starts the streak at 1')
- it('a second activity on the same UTC day leaves the streak unchanged')
- it('activity on the next UTC day adds one')
- it('after a missed day the streak restarts at 1')
- it('23:59Z and 00:01Z the next day count as consecutive days')
- it('display shows the streak when the last study day is today or yesterday')
- it('display shows day 0 with welcomeBack when the last study day is two or more days ago')
- it('display shows day 0 without welcomeBack for a learner who never studied')

`words.test.ts`
- it('nativeLine picks the learner native language, then en, then null')
- it('nativeLine returns null for non-object or non-string JSON values')
- it('toDueWord maps the highlight, cue and clip fields and formats due as ISO')

`stats.test.ts`
- it('returns four bands in A1, A2, B1, B2 order even when some are empty')
- it('counts a word as known from an interval of 6 days, not 1')
- it('splits words due before the next UTC midnight into dueNow and newNow by reps and lapses')
- it('counts dueTomorrow only within the next UTC day')
- it('a relearned word (reps 0, lapses 1) is due, not new')
- it('passes the streak through displayStreak')
- it('output parses with ProgressStats')

API — integration (`me-review.test.ts`, real DB; fixtures under deviceId prefix `test-l6-`, a clip with one cue and four highlights; afterAll deletes learners first, then the clip)
- it('x-session-code resolves the TV learner: the phone sees the words the TV saved')
- it('x-session-code wins over x-device-id')
- it('without x-session-code the device id resolves its own learner as before')
- it('a malformed x-session-code is 400 VALIDATION and creates no learner')
- it('a well-formed unknown x-session-code is 404 UNKNOWN_CODE')
- it('lower-case x-session-code is accepted')
- it('due=today returns words due before the next UTC midnight, earliest first')
- it('due=today leaves out words due on a later UTC day')
- it('without due returns every saved word')
- it('each word carries lemma, level, clip slug and title, cue index and text, and the native line for the learner')
- it('good on a new word schedules it 1 day out with reps 1 and records one Review row')
- it('a second good schedules it 6 days out')
- it('again resets reps to 0, lowers ease by 0.2 and adds a lapse')
- it('the response parses with ReviewResult')
- it('a review through the phone is visible to the TV device on its next GET /me/words')
- it("a savedWordId of another learner is 404 and changes neither the word nor the Review table")
- it('an unknown grade is 400 VALIDATION')
- it('a review on the day after lastStudyDay adds one to the streak')
- it('a review two days after lastStudyDay restarts the streak at 1')
- it('saving a word also counts as a study day')
- it('GET /me/stats parses with ProgressStats and counts saved and known words per band')
- it('GET /me/stats counts completed Progress rows only as clips watched')
- it('GET /me/stats with x-session-code reports the TV learner')

API — sockets (`quiz-events.test.ts`, harness copied from `realtime.test.ts`: `createServer`, listen on port 0, `once()` helper)
- it('quiz:start from the TV reaches the phone with the clip slug')
- it('quiz:start is not echoed to the TV that sent it')
- it('quiz:result from the phone reaches the TV')
- it('quiz:result is not echoed to the phone that sent it')
- it('quiz:start for a room the socket has not joined gets session:error VALIDATION and reaches nobody')
- it('quiz:result with correct greater than total gets session:error VALIDATION')

Contracts (`packages/contracts/test/review.test.ts`)
- it('DueWord accepts the extended shape and rejects a missing cueText')
- it('ProgressStats requires exactly four bands')
- it('Grade matches ReviewPost.grade')

Phone — logic (`apps/phone/test/*.test.ts`)

`codeInput.test.ts`
- it('typing one valid character fills the box and moves focus to the next')
- it('lower case is upper-cased')
- it('0, O, 1 and I are rejected and leave the boxes unchanged')
- it('pasting a full code into any box fills all six and completes')
- it('pasting a joinUrl fills all six and completes with its code')
- it('several characters typed into a middle box spill into the following boxes and drop the overflow')
- it('the sixth character completes the code; five do not')
- it('backspace on a filled box clears it; on an empty box clears and focuses the previous one')

`deck.test.ts`
- it('deckCounts separates new words from due words')
- it('buildDeck puts reviewed words before new words, keeping due order')
- it('buildDeck puts words from the quiz clip first within each group')
- it('flip shows the back; gradeStart is ignored before flip')
- it('gradeStart is ignored while a grade is posting')
- it('good and easy count as correct on the first pass; again and hard do not')
- it('again and hard put the card back at the end as a repeat')
- it('a repeat is not posted and does not change the first-pass tally')
- it('a repeat graded hard comes back again; graded good it leaves')
- it('gradeFail keeps the card and the flip and sets error')
- it('the deck is done when the queue empties; an empty deck starts done')

`progress.test.ts`
- it('streakView shows Day n for an active streak')
- it('streakView shows Welcome back after a missed day, never a zero streak')
- it('streakView shows the first-day line for a new learner')
- it('bandRows computes known over saved and 0 for an empty band')
- it('bandRows labels say approximate')
- it('nextReview counts new and due words together and offers review')
- it('nextReview falls back to tomorrow, then to nothing due')

`api.test.ts` (fake `fetch`)
- it('sends x-device-id on every call and x-session-code only when a TV is remembered')
- it('dueWords calls /me/words?due=today and parses DueWord[]')
- it('review posts savedWordId and grade as JSON and parses ReviewResult')
- it('an error envelope becomes ApiError with status and code')
- it('a 404 UNKNOWN_CODE surfaces as ApiError code UNKNOWN_CODE')
- it('a network failure becomes ApiError NETWORK')
- it('a response that fails the schema throws')

`storage.test.ts`
- it('deviceId is created once and then stable')
- it('setTv then tv returns the code; forgetTv clears it')
- it('a stored value that is not a session code reads as no TV')
- it('normaliseApiUrl adds http, drops the trailing slash, and rejects junk')

`link.test.ts` (fake socket: an EventEmitter with `emit` spy, `connected`, `disconnect`)
- it('emits join with code, role phone and the device name on connect and again on every reconnect')
- it('a second join closes the first socket')
- it('phone:connected for our code calls onJoined')
- it('session:error closes the socket and calls onRefused')
- it('connect_error before the first connect calls onUnreachable once')
- it('word:saved and quiz:start reach their handlers')
- it('sendQuizResult emits quiz:result only when connected and joined')

`app.test.ts`
- it('boot with a remembered TV opens Live and starts joining')
- it('boot without a TV opens Join')
- it('submit then joined remembers the pending code and opens Live')
- it('refused clears the TV and shows the unknown-code hint on Join')
- it('a dropped transport while joined shows reconnecting; coming back rejoins')
- it('wordSaved appends in order and ignores duplicates')
- it('quizStart offers the quiz without leaving the current screen')
- it('go quiz takes the offered clip for the deck and clears the offer')
- it('go live without a TV lands on Join')
- it('forgetTv clears the TV, the saved words and the offer')

`strings.test.ts`
- it('no phone string says wrong, failed or streak broken') — walk `strings` recursively, call functions with sample args (`1`, `'A2'`, `'Wort'`, `'good'`), lowercase-match `/\b(wrong|failed|streak broken)\b/`
- it('no string contains a fire emoji or any emoji')
- it('every grade has a label and Welcome back is spelled exactly')

Phone — components (`apps/phone/test/screens.test.tsx`, react-test-renderer, helpers as in `packages/shared-ui/test/render.test.tsx`)
- it('Join renders six code boxes labelled by position')
- it('Join moves focus to the next box after a character and submits on the sixth')
- it('Join shows the hint as a polite alert in text colour, not marker')
- it('every Join control has an aria-label and is at least 56 high')
- it('Live shows the latest clip title and one marker chip per saved word in arrival order')
- it('tapping a chip shows gloss and example and speaks the word in the learning language')
- it('Quiz me now is absent until a quiz is offered')
- it('Live shows the empty line when nothing is saved')
- it('Quiz shows "12 due · 3 new" for twelve reviewed and three new words')
- it('Quiz front shows only the word; tapping shows gloss, the cue with the word marked and the native line')
- it('the four grade buttons appear only after reveal, in order Again Hard Good Easy, with equal flex and identical colours')
- it('grading posts once, advances, and disables the buttons while posting')
- it('a failed post keeps the card and shows the retry line')
- it('again brings the word back at the end and the repeat does not post')
- it('finishing calls onResult with first-pass correct and total and shows Sent to your TV when it returns true')
- it('finishing without a TV shows Done for today and no TV line')
- it('an empty deck shows the empty copy')
- it('Progress shows Day 6 in the display font and no fire')
- it('Progress shows Welcome back after a missed day')
- it('Progress renders four band bars with interactive fill on surface2 and the value as text')
- it('Progress Review now calls onReview only when words are due')
- it('TabBar marks the current tab with aria-selected and weight, not colour alone')
- it('no screen uses a colour outside tokens.color') — collect every `color`/`backgroundColor`/`borderColor` in rendered styles; each must be a value of `tokens.color`

Phone — config (`apps/phone/test/config.test.ts`)
- it('eas.json parses with @expo/eas-json: preview is an internal Android APK') — `EasJsonUtils.getBuildProfileAsync(EasJsonAccessor.fromProjectPath(dir), Platform.ANDROID, 'preview')`
- it('preview iOS is an internal device build and preview-simulator extends it with simulator true')
- it('every build profile sets EXPO_PUBLIC_API_URL')
- it('app.json has the lingo scheme, both app ids, the camera text, cleartext for the LAN and ground as background colour')
- it('package.json has no plain build script and wires eas-build-pre-install')

Checks the implementer runs (mechanical, no device): `pnpm --filter @lingo/phone exec expo export --platform android --output-dir /tmp/lingo-phone-export` and `--platform ios` both succeed (proves Metro resolves `@lingo/contracts`, the relative tokens import and every Expo module under pnpm's isolated layout); `pnpm --filter @lingo/phone exec expo-doctor` — paste the output into the report; `bash -n apps/phone/scripts/eas-pre-install.sh`.

## Manual device steps (human; Android phone + optionally iPhone; record a friction log for each rough edge, `pnpm friction "<title>"`)

Setup
- M1. Laptop: `export DATABASE_URL=…; pnpm db:deploy; pnpm api` (port 4000). Find the LAN IP (`ipconfig getifaddr en0` / `hostname -I`). Phone on the same Wi-Fi. Expected: `curl http://<IP>:4000/health` from another machine → `{"success":true,…}`.
- M2. `pnpm --filter @lingo/api exec tsx scripts/fake-tv.ts --api http://<IP>:4000` (or the real Fire TV Pair panel). Expected: prints a code and `lingo://join/<code>`.
- M3. `cd apps/phone && npx eas-cli@latest login && npx eas-cli@latest init` → `app.json` gains `extra.eas.projectId`; commit it. Set `EXPO_PUBLIC_API_URL` in `eas.json` to `http://<IP>:4000`.
- M4. Android: `pnpm --filter @lingo/phone build:android`. Expected: the build log shows `eas-pre-install: stubbed …/vega-media-kit`, `pnpm install` passes, the build finishes with an install URL/QR; install the APK (allow unknown sources). If install fails at the pnpm step, capture the log section and stop (Risk R2).
- M5. iOS (only with a paid Apple Developer account): `npx eas-cli@latest device:create`, register the iPhone via the link, then `pnpm --filter @lingo/phone build:ios`; install from the build page. Without an account: `pnpm --filter @lingo/phone build:ios-sim`, download the `.tar.gz`, drag the `.app` onto an iOS Simulator.

On the device (each line: action → expected)
- D1. First launch → Join screen, dark ground, Noto Sans; no white flash longer than the font load.
- D2. Type the code slowly → each box advances by itself; type `O` → hint about 0/O/1/I, box stays empty; Backspace on an empty box → previous box clears.
- D3. Long-press a box → Paste the code → all six fill and joining starts. Within 2 s: Live "Connected to your TV"; fake TV prints `phone:connected` with the phone's name.
- D4. Force-quit and reopen → Live directly (TV remembered), "Connected to your TV" again; fake TV prints a second `phone:connected`.
- D5. "Use another TV" → Join. Tap Scan → camera permission prompt with the Lingo text → scan the TV's QR (or a QR of `lingo://join/<code>` from any generator) → Live.
- D6. Deep link: `adb shell am start -a android.intent.action.VIEW -d lingo://join/<code>` (iOS Simulator: `xcrun simctl openurl booted lingo://join/<code>`) → the app joins that code.
- D7. Fake TV `s` three times → three marker chips appear, each within ~1 s, in order; clip title shows. Tap one → gloss + example open and the word is spoken in German (Android: needs a German TTS voice; iOS: check with the silent switch on and off and note the result).
- D8. Fake TV `q` → "Quiz me now" appears (TalkBack/VoiceOver announces it); the phone does not jump screens by itself.
- D9. Quiz me now → header "0 due · 3 new" (the just-saved words are new); front shows only the word; tap → gloss, cue with the word marked, native line. Four equal buttons at the bottom, each ≥ 56 dp.
- D10. Grade Again on the first word → it returns after the others; grade the rest Good → "Done for today", "3 words reviewed…", "Sent to your TV"; fake TV prints `quiz:result { correct: 2, total: 3 }`.
- D11. `psql $DATABASE_URL -c "select reps, \"intervalD\", due from \"SavedWord\" order by \"createdAt\" desc limit 3"` → the Good words have intervalD 1 and due ≈ now + 24 h; the Again word has lapses 1.
- D12. Stop the fake TV (Ctrl-C). Review tab still loads (nothing due now → empty copy). Progress → "Day 1", four approximate-level bars with "0 of n", "0 clips watched", "3 words to review tomorrow".
- D13. `psql … -c "update \"Learner\" set \"lastStudyDay\" = to_char(now() - interval '3 days', 'YYYY-MM-DD') where id = (select \"learnerId\" from \"Session\" where code = '<code>')"` → reopen Progress → "Welcome back", no day count, no fire.
- D14. Turn Wi-Fi off → Live shows "Reconnecting…"; Review shows the load error with Try again; back on → reconnects by itself and the fake TV (restarted with the same `--device`) sees the phone again.
- D15. Change the server address in Join's footer to a wrong one → "Can't reach Lingo…" hint; correct it → joins without a rebuild.
- D16. TalkBack (Android) / VoiceOver (iOS): swipe through every screen → every control announces its purpose (box positions, chips "… Show the meaning and hear it", grades "Good: schedule …", tabs as tabs with selection).

## Risks

- R1. **pnpm isolated `node_modules` + Metro.** The phone has no `metro.config.js`; Expo SDK 54's default config handles workspaces, but the relative tokens import and `@lingo/contracts` (TS source, `main: src/index.ts`) must resolve. Mitigation: the `expo export` checks above. If they fail, add `apps/phone/metro.config.js` with `config.watchFolders = [workspaceRoot]` and `config.resolver.nodeModulesPaths = [app/node_modules, root/node_modules]` (Expo monorepo guide) and report it; do not change the root `.npmrc`.
- R2. **EAS builder and the `link:../vega-media-kit` override.** Covered by the pre-install stub; unverified until M4. If EAS's working directory layout differs (the hook prints the path it stubbed), adjust `ROOT` and file a friction log.
- R3. **Cleartext HTTP / ATS / Local Network** for a laptop API on the LAN. `usesCleartextTraffic` and `NSAllowsArbitraryLoads` are for internal test builds only; record in the decision that they go when the API moves behind HTTPS.
- R4. **The session code is a bearer secret** for the TV learner's `/me/*` (read the deck, grade, see stats). 6 chars over a 32-letter alphabet (~1.07 × 10⁹) with no rate limit. Acceptable for the hackathon build and consistent with decision 0005 (the code is the single source of truth); note it in the decision and in `docs/feature-requests.md` later (rotate code / rate limit).
- R5. **UTC days** for "due today" and the streak: a Berlin learner's day rolls at 01:00/02:00 local. Acceptable for the demo; a per-learner time zone is a follow-up.
- R6. **Behaviour change in sockets:** `quiz:start`/`quiz:result` now go to the room except the sender and require membership. Nothing consumes them yet; LING-005 must not rely on an echo.
- R7. **Merge with LING-005** on `me.ts` (call-site signature change), `contracts/index.ts` (the `DueWord` line), `sockets.ts` (two handlers). The ownership table keeps the hunks disjoint; the signature change makes a missed merge a type error, not a silent bug.
- R8. **Free-tier day boundary** in `POST /me/words` still uses server-local midnight (`setHours(0,0,0,0)`); not changed here (LING-007 owns the limit). Flag for alignment with UTC.
- R9. **TTS voice availability** (`expo-speech`): some Android phones lack a German voice; speaking then does nothing. The chip still shows gloss/example; no error UI. Note in D7.
- R10. iOS internal builds need a paid Apple Developer account; the simulator profile is the fallback for screenshots.

## Open questions (answered here; the orchestrator may overrule and record in a decision)

1. *What does "known" mean for "Words known by band"?* Interval ≥ 6 days (`KNOWN_MIN_INTERVAL_D`): the word has survived its first 1-day review. A 21-day "mature" bar would stay empty for the whole hackathon. Bands use `Highlight.level` (approximate CEFR, labelled as such).
2. *What counts as a study day for the streak?* A graded review or a saved word (both server-side). LING-005 may also call `touchStreak` when a clip completes. Day = UTC (R5). The display never shows a 0 streak: missed day → "Welcome back"; never studied → the first-day line.
3. *Hard as well as Again repeats in the session?* Yes — literal SM-2 repeats every item graded below 4 ("good") in the same session until it reaches 4; only the first grade is sent, so the schedule is untouched by repeats.
4. *What goes in `quiz:result` from the phone?* First-pass Good/Easy count over first-pass total, sent once at deck end, only when the phone is in the room. It is a review tally; it never feeds `PUT /me/level`.
5. *Does `quiz:start` auto-open the quiz?* No (§9: the button "appears"); it is announced for screen readers.
6. *Audio for "tap for gloss + audio"?* On-device TTS via `expo-speech`; no Polly, no AWS call, no new API.
7. *Which learner does the phone use without a TV?* Its own `x-device-id` learner (empty deck unless it ever had a TV). Once a TV is remembered, every REST call carries `x-session-code`, so review works with the TV off.
8. *Daily cap on new words?* None in the deck; the free tier already caps saves at 20/day.
9. *Push reminders ("quizzes you tomorrow")?* Out of scope for LING-006; `expo-notifications` stays installed but unused. Candidate for LING-008 polish.
10. *iOS distribution?* Ad hoc internal build if a paid Apple account exists, else the simulator build. **Ask the human once:** is there an Apple Developer membership, and will the demo API run on the laptop LAN (cleartext) or behind HTTPS?

Suggested decision record for the orchestrator (`docs/decisions/0009-phone-review.md`): x-session-code resolution and its bearer nature; UTC days; known = interval ≥ 6 d; same-session repeats local-only; quiz events exclude the sender and require membership; on-device TTS; cleartext only for internal builds.

## Doc URLs (no Amazon or AWS API is touched by this ticket)

- SM-2 (same-session repeat of items below 4): https://super-memory.com/english/ol/sm2.htm · Anki defaults: https://faqs.ankiweb.net/what-spaced-repetition-algorithm
- Socket.IO emit cheatsheet (`socket.to` excludes the sender): https://socket.io/docs/v4/emit-cheatsheet/
- EAS: https://docs.expo.dev/build/eas-json/ · https://docs.expo.dev/build/internal-distribution/ · https://docs.expo.dev/build-reference/npm-hooks/ · https://docs.expo.dev/build-reference/apk/ · https://docs.expo.dev/build-reference/simulators/ (docs.expo.dev was blocked from this sandbox; the eas.json field set was checked against `@expo/eas-json` 24.8.0's schema instead — the implementer should open these once)
- Expo SDK 54 modules: https://docs.expo.dev/versions/v54.0.0/sdk/speech/ · https://docs.expo.dev/versions/v54.0.0/sdk/async-storage/ · https://docs.expo.dev/versions/v54.0.0/sdk/build-properties/ · https://docs.expo.dev/versions/v54.0.0/sdk/camera/ · https://docs.expo.dev/versions/v54.0.0/sdk/font/ · https://docs.expo.dev/versions/v54.0.0/sdk/crypto/ · monorepos: https://docs.expo.dev/guides/monorepos/
- Apple Local Network privacy (`NSLocalNetworkUsageDescription`): https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription
