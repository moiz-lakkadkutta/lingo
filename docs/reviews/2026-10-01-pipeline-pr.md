# Review — `origin/main...origin/feat/ling-001-pipeline` (LING-001 pipeline, LING-002 explanations + quiz, LING-003 player)

Reviewer: opus, cold read, 2026-10-01. Diff: 183 files, +64 433 / −240 (freq lists, name lists and fixtures were skimmed, not read in full).
Local branch `claude/confident-mendel-jzms2h` is one docs-only commit behind `origin/feat/ling-001-pipeline` (0009-gloss-quality.md and LING-002-gate-c.md), so the checks below ran on code identical to the PR head.

## 1. Check results

| Check | Result |
|---|---|
| `pnpm turbo run typecheck --continue` | **FAIL** (6/7 tasks pass). `@lingo/expo`: `RemoteBridge.tsx(2,10) TS2305 'useTVEventHandler'` and `(2,34) TS2305 'HWEvent'` not exported from "react-native". This is a real resolution bug, not env-only (H1). |
| `pnpm turbo run test --continue` (DATABASE_URL set) | PASS: contracts 25/25, shared-ui 96/96, api 25/25, pipeline 274 passed + 9 skipped (simplemma absent locally). |
| pipeline tests with simplemma | PASS, 283/283, using a scratchpad venv with `simplemma==2.0.0` and `CI=1 LINGO_PYTHON=…`. Through turbo too, so `LINGO_PYTHON` and `CI` do reach the task in strict env mode. `CI=1` without `LINGO_PYTHON` makes lemmatize/names-p4 fail loudly, as designed. |
| `pnpm lint:words` | PASS |
| `eslint src` in shared-ui (Vega-safe import rule) | PASS, but CI does not run it (L7). |
| `pnpm install --frozen-lockfile --lockfile-only` | PASS (lockfile consistent) |
| CLI smoke: `prepare --fixture {60s, overlap, real/friedlaender} --no-publish` into the scratchpad | all exit 0; 23 / 12 / 54 cues, 7 / 1 / 15 highlights |

CI (`.github/workflows/ci.yml`): the venv path, `LINGO_PYTHON`, kit sibling checkout, `link:../vega-media-kit` and migrate step are all correct. CI is still **red**, because `pnpm typecheck` fails on `@lingo/expo` (H1) and stops the job before `pnpm test`.

## 2. Findings

### High

**H1 — `apps/expo/RemoteBridge.tsx:2` / `apps/expo/tsconfig.json`: react-native-tvos TV typings are attached to the wrong `react-native`, so expo typecheck (and CI) fails.**
- Defect: `react-native-tvos/types/public/ReactNativeTVTypes.d.ts` declares `useTVEventHandler` and `HWEvent` as a module augmentation, `declare module 'react-native' { … }`. TypeScript resolves the name `react-native` *from that file's location*, under pnpm's virtual store. That folder has no `react-native` sibling, so the lookup walks up to `node_modules/.pnpm/node_modules/react-native`. pnpm's default `hoist-pattern=*` puts **plain react-native@0.81.0** there, pulled in by `apps/phone`. The augmentation therefore lands on the plain RN types, and the app's `import … from 'react-native'` (tvos `types/index.d.ts`) never sees it. Confirmed with `tsc --traceResolution`: 52 resolutions go to react-native-tvos and 10 go to react-native@0.81.0, including the one from `ReactNativeTVTypes.d.ts`.
- Failure scenario: `pnpm typecheck` fails deterministically, on any machine and in CI, because it follows from the lockfile. CI is red and `pnpm test` never runs in CI. At runtime it works: Metro bundles tvos, so this is types only.
- Fix (verified): add to `apps/expo/tsconfig.json` `compilerOptions`: `"paths": { "react-native": ["./node_modules/react-native"] }`. With this, `tsc --noEmit` exits 0, and without it the same two errors come back. I tested this with a scratchpad tsconfig that extends the app's config. Removing plain RN from the hoist does not fix it: the augmentation would then resolve to nothing.

### Medium

**M1 — `packages/shared-ui/src/index.tsx:55-58` (patchLearner) → `apps/api/src/routes/me.ts:12` / `apps/api/prisma/schema.prisma:84-98`: settings from the ▲ sheet never persist; every PUT returns 500.**
- Defect: the new `patchLearner` sends `PUT /me { nativeLine }` / `{ cueScale }`. `LearnerDto.partial()` accepts these fields, but the `Learner` model has no `nativeLine`, `autoPause` or `cueScale` columns, so `db.learner.update` throws `PrismaClientValidationError`. The client discards the error with `.catch(() => {})`.
- Reproduced with supertest against the local DB: `PUT /me {cueScale: 1.25}` → **500** `INTERNAL`.
- Failure scenario: a learner sets Subtitle size 150 % or Native line Never. It applies for the session (optimistic). On the next launch `/me` returns no such field, and `{...defaultLearner, ...l}` silently resets it to 100 % / Always. LING-005 Settings and "Auto-pause at line end" will hit the same wall.
- Fix: add a migration with `nativeLine` (enum), `autoPause Boolean @default(false)` and `cueScale Float @default(1)` on `Learner`. Bound `cueScale` in the contract (`z.number().min(1).max(1.5)`). Narrow the PUT schema to an explicit allowlist (see P1). Surface a failed PUT, at least by logging it.

**M2 — `packages/shared-ui/src/screens/player/machine.ts:118` (playing + playerState `paused` → explain) with the kit's Fire OS adapter (`vega-media-kit/src/player/adapters/fireos.tsx:145`): a seek or rebuffer on Fire OS is likely to open the Explain card.**
- Defect: the kit maps react-native-video's `onPlaybackStateChanged {isPlaying:false}` to `'paused'` and drops the `isSeeking` flag. react-native-video 6.19.2 forwards ExoPlayer's `onIsPlayingChanged` as-is (`ReactExoplayerView.java:1941-1946`). It even tracks `isSeeking`, which it sets on `DISCONTINUITY_REASON_SEEK` and clears when playback resumes (comment at :230-234). ExoPlayer's `isPlaying()` is false whenever the state is not READY, so a seek, which goes through BUFFERING, or a network rebuffer emits `isPlaying=false`. The machine reads that as an external pause (Media Controls) and moves `playing → explain`.
- Failure scenario: ► while playing → `seek` effect → ExoPlayer buffers → `'paused'` → the card opens, the stage loses focus and the video stays paused. The same happens after ◄, long ◄, Replay from the card, a seek out of holding, and any mid-play rebuffer. The S1 spike checklist does not test for this. The path is traced through source; no device was available, so confirm it in S1 with the `LINGO-SPIKE` logcat and a `console.log` in `onState`.
- Fix: in Lingo, have `Player.tsx` ignore `'paused'` reports while a seek is pending (set a flag on a `seek` effect and clear it on the next `'playing'`), and also right after a `'buffering'` report. Better, fix the kit: report `'buffering'` when `isSeeking` is true or the player is buffering, and `'paused'` only when the `paused` prop or the user paused. Then add a machine test such as "a paused report right after a seek does not open Explain" (with an explicit `seeking` flag in ctx or state).

**M3 — `machine.ts:41-42, 115, 125` + `Player.tsx:119, 147-148`: Select or Play/Pause before the first cue leaves a paused screen with nothing focusable.**
- Defect: `toExplain` sets `cueIndex = s.cueIndex ?? lastStartedCue(...)`. Before the first cue starts (intros and title cards; e.g. a clip whose first word is at 5 s), that is `null`. The phase becomes `explain` and a `pause` effect is emitted, but `explaining = phase==='explain' && !!cue` is false, so no card renders. The stage is `focusable={false}` and `pointerEvents='none'`.
- Reproduced with `reduce`: position 2 s with the first cue at 5 s → stageSelect → `explain`, `cueIndex null`, `[pause]`. A second stageSelect returns the same state with no effects.
- Failure scenario: the learner presses Select during the intro. The picture pauses with no card, no hint and no focus; Select does nothing. Only Back or Play/Pause recover, and nothing tells them so. On Vega, with Back limits noted in friction, this reads as a hang.
- Fix: when `toExplain` resolves no cue, either ignore stageSelect (stay `playing`) or pause into a state that keeps the stage focusable and shows `strings.explain.continueHint`. Add a machine test for "Select before the first cue".

**M4 — `packages/shared-ui/src/screens/player/align.ts:7, 15-23` vs `packages/pipeline/src/tokenize.ts:43-44`: the first word of each line in a two-speaker cue can never be aligned.**
- Defect: the pipeline tokenizes a dual-speaker line by removing the leading `-` (`speakerLine ? line.slice(1)`), so `-Wirklich?` yields the token and highlight `Wirklich`. The player's `stripToken` keeps hyphens (`'’-` are excluded from the strip), so the slot `-Wirklich?` strips to `-Wirklich`, which matches neither the exact nor the lowercase comparison.
- Reproduced: `alignHighlights('-Wirklich? Das glaube ich.\n-Genau.', [{word:'Wirklich'},{word:'Genau'}])` → `unmatched: [0, 1]`.
- Failure scenario: a highlighted word that opens a speaker line in a two-speaker cue (segmenter or `--cues` output) has no marker in the cue. That cue's `wordFocus` drops to `'card'`, so the "marker only for the word to learn" display and in-cue word focus fail for that line. The current fixtures happen not to hit it (0 cases in overlap/60s/friedlaender), so no test catches it.
- Fix: mirror `tokenizeCues`. In `alignHighlights`, when a line starts with `-`, compare the first slot without that hyphen (keep the displayed text). Add an align test with a dual cue.

**M5 — `packages/pipeline/src/highlights.ts:18-31` (`NUMERAL_WORDS` / `NUMERAL_DE` / `NUMERAL_EN`): many number words are not recognised, so they can be highlighted ("never numbers" is a non-negotiable).**
- Defect: English teens are absent from the set, and the `EN` regex has no `teen` suffix. `million`, `billion`, `dozen`, ordinals from `eleventh` up, German `elfte`, multi-stem German compounds (`zweihundert`, `zweitausend`, `einundzwanzig`, `fünfundzwanzig`) and `Million(en)`, `Milliarde`, `Dutzend` are all missing.
- Reproduced: `isNumeral` returns false for thirteen (rank 5986), fifteen (3206), sixteen (5837), nineteen (8563), billion (1959), dozen (1944), zweihundert (15750), Milliarde (2783), Dutzend (2306).
- Failure scenario: an A1/A2 English clip ("I'm fifteen.") highlights *fifteen* (rank 3206 ≥ floor 2000), glosses it and puts it in the quiz.
- Fix: add `(thir|four|fif|six|seven|eigh|nine)teen(th)?`, `eleventh|twelfth`, `million|billion|trillion|dozen` (+s). For German, accept a sequence of number morphemes (`^(?:ein|zwei|…|hundert|tausend|und)+(?:ste[rsn]?|mal|fach)?$`) plus `Million(en)|Milliarde(n)|Dutzend`. Add table tests.

### Low

- **L1 `packages/pipeline/src/ai/quiz.ts:445-451` (`clozePrompt`)**: only the first occurrence is blanked. A cue that repeats the word ("Stunde um Stunde") shows the answer next to the blank. Fix: blank every whole-word occurrence (a global regex), or drop the item through `onDrop` when there are two or more.
- **L2 `packages/pipeline/src/prepare.ts:45-55` / `cli.ts:50-55`**: `slug` is validated only by `PreparedClip.parse` at the end (`/^[a-z0-9-]+$/`), after Transcribe, Translate and Bedrock have been paid for, and after `work/<slug>` has been created with an unvalidated slug (`--clip ../x` writes outside `work/`). Fix: validate the slug first in `prepare()`.
- **L3 `packages/pipeline/src/prepare.ts:142-143`**: the kit's `lintCues` on the target VTT runs after the gloss/quiz calls, while `assertGate` runs earlier. If the kit's lint ever disagrees with `qualityGate`, the clip fails after Bedrock spend (cached, so re-runs are cheap). Fix: run `checkVtt(targetVtt)` right after `assertGate`.
- **L4 `packages/pipeline/src/lemmatize.ts:223-227`**: the Python bridge call has no timeout, and the reply is cast rather than validated (`as BridgeReply`). A hung interpreter blocks `prepare` forever; a malformed reply produces `undefined` lemmas. There is no injection risk: argv is an array and data goes over stdin as JSON. Fix: `execa(..., { timeout: 60_000 })` and a small Zod schema for the reply.
- **L5 `docs/content.md:20`**: commits the AWS account id (`s3://lingo-media-dev-<account-id>/...`). It is not a secret, but it is unnecessary in a public repo. Fix: use `s3://<media-bucket>/clips/...`.
- **L6 Licensing — `packages/pipeline/data/README.md` "Seed 2" / `docs/aws.md` Sources**: `names-*.txt` now contain region names from `Intl.DisplayNames` (Unicode CLDR, Unicode License v3, which asks for the notice to be kept with redistributed data). `docs/aws.md` → Sources attributes only FrequencyWords (CC BY-SA 4.0) and simplemma. Add a CLDR line. The FrequencyWords attribution, the sidecar `freq-*.meta.json` (source, sha256, licence) and the real fixtures' CC BY 4.0 / US public domain notes (`test/fixtures/real/README.md`) are in order. The frequency lists also embed simplemma's lemma mappings, whose dictionaries are ODbL/CC BY-SA per decision 0004; consider stating that in the Sources line too.
- **L7 `.github/workflows/ci.yml`**: CI never runs `pnpm lint`, so the shared-ui Vega-safe import rule (including the new `react-native` TV-API `paths` rule this diff adds) is not enforced. Fix: add `- run: pnpm lint`.
- **L8 `packages/pipeline/src/ai/cost.ts:198-203`**: Nova Lite prices are marked "NOT YET VERIFIED", so `clip.json.cost` is an estimate. Already flagged in `docs/aws.md`; check the pricing page before the cost numbers go into the submission.
- **L9 Plan status**: `TASKS.md` leaves LING-002 unchecked (Gate C recorded, not passing: `docs/spot-checks/2026-10-02-gate-c.md`). LING-003 is "code done, waiting on device spikes S1/S2", so the react-native-tvos switch has not been proven on the stick (plan §Risks says to prove it "before merge"). Merging to main is a call for the orchestrator or human, not a code defect.

### Checked and found sound

- **Segmenter rules** (`segment.ts`, `gate.ts`): MAX_LINE 42 × 2, 1–7 s, CPS 20 and `MIN_GAP_S` 0.084 (two frames at 23.976 fps) all hold. The fix loop terminates: every branch either advances `i` or shrinks `groups`, and the interjection `i--` is guarded by `i > 0`. Anything left over is caught by `assertGate`, which fails the clip with a `--cues` correction path rather than publishing bad cues. The gate checks cps (newline excluded), line count, line length, duration, gap and order.
- **Highlights**: the cap is `floor(0.4 × cues)` distinct cues, at most 2 per cue, and the lemma is used once per clip. Names are excluded via `isCountable`, and the name lists are stripped from the freq lists. The band is floor-only by decision 0008 #9, with review warnings above rank 8000. The number gap is M5.
- **Nova calls**: Converse with forced tool use and temperature 0, with a floor fallback. The answer is Zod-validated, context rules are checked, and there is exactly one feedback retry, with soft-issue acceptance for glosses. The file cache is keyed by sha256 of the identity (prompt version, model, lang, native, level, lemma, cue); writes are atomic and corrupt entries are deleted. The cost ledger counts rejected attempts and cache hits. The quiz plan is validated by `quizPlanIssues` (range, distinct options) and falls back to a deterministic builder. The SDK client is lazy, with 5 attempts in standard retry mode.
- **Secrets**: no keys or tokens in the diff. `accountId` is removed from the real Transcribe fixtures, with no pre-signed URLs. The Bedrock and Transcribe clients are lazy, so CI needs no credentials.
- **External commands**: ffmpeg, packager and aws run through `execa` with argv arrays, never a shell.
- **Remote handling**: `normalise` and `createPressTracker` handle `long<Key>` and key-up-only Android. The Back path goes through `BackHandler`. `select` key events are dropped in favour of the stage `onPress`.
- **shared-ui invariants**: no colour literal outside `tokens.ts`. Focusables have aria-labels. `Focusable` animates outline + 1.04 scale over 150 ms, and `WordChip` uses an outline only (3 px at 2 px offset). Imports are within the Vega list: react-native, react-native-svg, socket.io-client, qrcode-generator, the kit, contracts.

### Pre-existing (not introduced by this diff, but exercised by it)

- **P1 (high) `apps/api/src/routes/me.ts:12`**: `PUT /me` validates with `LearnerDto.partial()` and writes the body straight to Prisma, so any client can set `plus: true` (and `streak`, `level`, `firstRunDone`). That bypasses IAP/RVS. Reproduced: `PUT /me {plus:true}` → 200 with `plus: true`. The test learner row was deleted afterwards. Fix: a dedicated `LearnerPatch = LearnerDto.pick({ learning, native, nativeLine, autoPause, cueScale, firstRunDone }).partial()`; `plus` only through `/iap/verify`, `level` only through the placement/level route.
