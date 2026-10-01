# LING-001 — Segmenter / gate policy on real audio (M2 · M3 · M4 · M5)

Status: plan (Fable, 2026-10-01). Implementer: Opus. Reviewer: Fable. Decision record: docs/decisions/0007-segmenter-gate-policy.md.
Base: the uncommitted LING-001 tree on `feat/ling-001-pipeline`. Another implementer is making small fixes in `packages/pipeline`
concurrently — re-read every file before editing; the line numbers below are from 2026-10-01 and are orientation only.
Baseline: `pnpm --filter @lingo/pipeline test` = 13 files / 107 tests green; keep every one of them green without editing their
assertions (two tests gain *additional* assertions, listed in §7).

## 0. Decisions already made (do not re-decide)

1. The target-track gate stays hard; there is no tolerance flag. Before the gate fails, `prepare()` writes `<lang>.vtt`,
   `dropped.vtt`, `gate.json`; the error names the correction path.
2. Manual correction is a WebVTT file: `prepare --cues <file.vtt>` skips Transcribe + segmentation and runs the same gate.
3. Tokens come from the final cue text (`tokenizeCues`), never from the timed words, in both modes.
4. Speaker change flushes a group. Fallback order for a short/fast cue: same-speaker merge forward, same-speaker merge backward,
   interjection drop (+ rejoin), two-speaker cue with next, two-speaker cue with previous, tiny drop, else gate finding.
5. Two-speaker cue = Netflix form: exactly two lines, each `-` + text, one speaker per line, ≤ 42 chars per line (hyphen included).
6. Overlapping words of the next cue cut this cue at `nextStart − 0.08`; `timing()` does it, not the final trim.
7. Native track: `wrap2(text, 56)`, lint limits `{ cps: 26, lines: 2, lineLength: 56, minDuration: 1 }`, findings are warnings.
8. M5 is app-side (LING-005 follow-up); this ticket changes nothing for it except the TASKS.md line in §9.
9. Constants: `MAX_LINE = 42`, `NATIVE_LINE = 56`, `GAP = 0.08`, `EXTEND = 0.5`, `MIN_S = 1`, `MAX_S = 7`, `CPS = 20`, tiny cue = ≤ 2 words.

## 1. Files

| Action | File | What |
|---|---|---|
| modify | `packages/pipeline/src/segment.ts` | speaker-aware grouping, `timing()` tail cut, new merge pass, `segmentWithReport()`, `wrap2(t, maxLine)`, `fits2(t, maxLine)`, `isDualText()`, `NATIVE_LINE` |
| modify | `packages/pipeline/src/gate.ts` | `assertGate(segs, hint?)` message with text + time span; `gateReport()` |
| modify | `packages/pipeline/src/tokenize.ts` | add `tokenizeCues()`; keep `tokenizeWords()` |
| modify | `packages/pipeline/src/vtt.ts` | `checkVtt(vtt, trackId, limits = LINT_LIMITS)`, `NATIVE_LINT_LIMITS`, `loadCuesVtt()` |
| modify | `packages/pipeline/src/steps/translate.ts` | `alignNative` wraps at `NATIVE_LINE`, translates two-speaker cues line by line |
| modify | `packages/pipeline/src/steps/normalize.ts` | add `probeMezz()` |
| modify | `packages/pipeline/src/prepare.ts` | steps 1–3 and 5, 7 per §4; `cues` input |
| modify | `packages/pipeline/src/types.ts` | `PrepareInput.cues?: string` |
| modify | `packages/pipeline/src/cli.ts` | `--cues <file.vtt>`, `--fixture [name]` |
| modify | `packages/pipeline/src/fixtureDeps.ts` | `opts.transcript` (fixture name), merged lemma tables |
| modify | `packages/pipeline/scripts/gen-fixtures.ts` | speaker syntax, `speaker_labels`, fixture set, `fixtureVocabulary` via the prepare path |
| create | `packages/pipeline/test/fixtures/dialogue-overlap-de.txt` | §5 |
| create | `packages/pipeline/test/fixtures/transcribe-overlap-de.json` | generated: `pnpm --filter @lingo/pipeline gen:fixtures --transcribe` |
| create | `packages/pipeline/test/fixtures/lemmas-overlap-de.json` | generated: `pnpm --filter @lingo/pipeline gen:fixtures --lemmas` (`.venv-lemma` exists in the repo root with simplemma 2.0.0) |
| modify | `packages/pipeline/test/{segment,gate,tokenize,vtt,transcribe,prepare,lemmatize}.test.ts` | tests in §7 |
| create | `packages/pipeline/test/translate.test.ts` | tests in §7 |
| modify | `packages/pipeline/data/README.md` | one paragraph: the `--cues` path and `dropped.vtt` |

No change to `packages/contracts`, `gate.ts`'s `qualityGate`, `highlights.ts`, `package.ts`, `publish.ts`, or the prepare snapshot.

## 2. segment.ts — exact changes

### 2.1 Types and exports

```ts
export interface Seg { index: number; startS: number; endS: number; text: string }              // unchanged
export interface Dropped { startS: number; endS: number; text: string; speaker?: string; reason: 'interjection' | 'unplaceable' }
export interface SegmentReport { cues: Seg[]; dropped: Dropped[] }
export const MAX_LINE = 42, NATIVE_LINE = 56
export function segmentWithReport(words: Word[]): SegmentReport
export function segment(words: Word[]): Seg[]            // = segmentWithReport(words).cues — signature and old behaviour kept
export function cps(seg: Seg): number                    // unchanged
export function wrap2(t: string, maxLine = MAX_LINE): string
export function fits2(t: string, maxLine = MAX_LINE): boolean
export function isDualText(t: string): boolean           // ≥ 2 lines and every line starts with '-'
```

- `wrap2`: if `t.includes('\n')` return `t` unchanged (a forced break — from a two-speaker cue or an edited VTT). Else as today
  with `42` replaced by `maxLine`.
- `fits2`: if `t.includes('\n')`: `lines.length ≤ 2 && every line ≤ maxLine`. Else `chars(t) ≤ 2 * maxLine && wrap2(t, maxLine)` lines all ≤ maxLine.
- `chars(t) = t.replace(/\n/g, '').length` — use it everywhere a length is compared or divided (cps), including `timing()`.

### 2.2 Helpers (module-private)

```ts
const speakerOf = (g: Word[]) => g[0]?.speaker
/** Maximal runs of consecutive words with the same label; an unlabelled word joins the current run. */
function runs(g: Word[]): Word[][]
/** One line per run with the Netflix hyphen when there are ≥ 2 runs, else joinWords. */
function render(g: Word[]): string   // runs(g).length >= 2 ? runs(g).map(r => '-' + joinWords(r)).join('\n') : joinWords(g)
const lastEndOf = (g: Word[]) => Math.max(...g.map(w => w.end))
const wordCount = (g: Word[]) => g.length
const endsSentence = (g: Word[]) => /[.!?…]$/.test(g.at(-1)!.text)
```

### 2.3 Grouping (the first loop)

Add the speaker flush to the existing flush condition at line 38, before `fits2`:

```ts
const last = buf.at(-1)
const speakerChange = !!last && last.speaker !== undefined && w.speaker !== undefined && w.speaker !== last.speaker
if (buf.length && (speakerChange || !fits2(cand) || dur > MAX_S || cand.length / Math.max(dur, 0.01) > CPS * 1.5)) flush()
```

Everything else in the loop is unchanged (sentence end flush; clause flush when > 40 chars).

### 2.4 `timing(group, nextStart)` — replace the body

```ts
const s = group[0]!.start, lastEnd = lastEndOf(group)
const t = render(group), n = chars(t), need = n / CPS
const latest = nextStart !== undefined ? nextStart - GAP : Infinity
let e = lastEnd
if (e - s < need) {
  e = Math.min(s + need, lastEnd + EXTEND, latest, s + MAX_S)
  if (e === s + need && (round(e) - s) * CPS < n) e += 0.001
}
if (e - s < MIN_S) e = Math.min(s + MIN_S, latest)
e = Math.max(e, lastEnd, s + 0.04)
if (e > latest) e = Math.max(latest, s + 0.04)   // NEW: the next cue's words overlap this cue's tail — stop two frames before it
return { s: round(s), e: round(e) }
```

The final "≥ 2 frames" trim loop (lines 61–65) stays as a safety net; after this change it never fires on segmenter output.

### 2.5 Merge pass — replace lines 44–58

```ts
const n = () => groups.length
const nextStartOf = (i: number) => groups[i + 1]?.[0]?.start
const t = (i: number) => timing(groups[i]!, nextStartOf(i))
const bad = (i: number) => { const { s, e } = t(i); return e - s < MIN_S - 1e-9 || chars(render(groups[i]!)) / (e - s) > CPS }
const single = (g: Word[]) => runs(g).length === 1                       // a two-speaker cue is final
const sameSpeaker = (a: Word[], b: Word[]) => speakerOf(a) === undefined || speakerOf(b) === undefined || speakerOf(a) === speakerOf(b)
const differentSpeakers = (a: Word[], b: Word[]) => speakerOf(a) !== undefined && speakerOf(b) !== undefined && speakerOf(a) !== speakerOf(b)
const mergedTiming = (i: number) => timing([...groups[i]!, ...groups[i + 1]!], nextStartOf(i + 1))
/** same-speaker merge of i and i+1: pair fits 2×42 and ≤ 7 s (as today) */
const canMerge = (i: number) => sameSpeaker(groups[i]!, groups[i + 1]!) && single(groups[i]!) && single(groups[i + 1]!)
  && fits2(render([...groups[i]!, ...groups[i + 1]!])) && (() => { const { s, e } = mergedTiming(i); return e - s <= MAX_S })()
/** two-speaker cue of i and i+1: must be fully good, because it can never be merged again */
const canDual = (i: number) => differentSpeakers(groups[i]!, groups[i + 1]!) && single(groups[i]!) && single(groups[i + 1]!)
  && fits2(render([...groups[i]!, ...groups[i + 1]!]))
  && (() => { const { s, e } = mergedTiming(i); const m = [...groups[i]!, ...groups[i + 1]!]; return e - s <= MAX_S && e - s >= MIN_S - 1e-9 && chars(render(m)) / (e - s) <= CPS })()
const isInterjection = (i: number) => wordCount(groups[i]!) <= 2 && i > 0 && i + 1 < n()
  && speakerOf(groups[i - 1]!) !== undefined && speakerOf(groups[i - 1]!) === speakerOf(groups[i + 1]!) && differentSpeakers(groups[i - 1]!, groups[i]!)
const merge = (i: number) => groups.splice(i, 2, [...groups[i]!, ...groups[i + 1]!])
const drop = (i: number, reason: Dropped['reason']) => {
  const g = groups[i]!
  dropped.push({ startS: round(g[0]!.start), endS: round(lastEndOf(g)), text: joinWords(g), ...(speakerOf(g) ? { speaker: speakerOf(g) } : {}), reason })
  groups.splice(i, 1)
}
for (let i = 0; i < n(); ) {
  if (!bad(i)) { i++; continue }
  if (i + 1 < n() && canMerge(i)) { merge(i); continue }
  if (i > 0 && canMerge(i - 1)) { merge(i - 1); i--; continue }
  if (isInterjection(i)) {
    drop(i, 'interjection')                                  // groups[i] is now the old i+1
    if (!endsSentence(groups[i - 1]!) && canMerge(i - 1)) merge(i - 1)   // rejoin the interrupted sentence
    i--; continue                                            // re-check the previous group: its `latest` moved
  }
  if (i + 1 < n() && canDual(i)) { merge(i); i++; continue }
  if (i > 0 && canDual(i - 1)) { merge(i - 1); continue }
  if (wordCount(groups[i]!) <= 2) { drop(i, 'unplaceable'); i = Math.max(0, i - 1); continue }
  i++
}
```

Termination: every branch that does not `i++` shrinks `groups`. Output mapping (line 60) uses `render(g)` instead of `joinWords(g)`.
`dropped` is sorted by `startS` before returning (drops happen in scan order, so this is a no-op guard).

## 3. gate.ts, tokenize.ts, vtt.ts, translate.ts, normalize.ts

### 3.1 gate.ts

```ts
export interface GateReport { findings: Array<GateFinding & { startS: number; endS: number; text: string }>; dropped: Dropped[] }
export function gateReport(segs: Seg[], dropped: Dropped[]): GateReport   // qualityGate(segs) joined with the cue by index
export function assertGate(segs: Seg[], hint?: string): void
```

`assertGate` message, one finding per `; `:
`cue ${f.cueIndex} ${f.problem}=${f.value} [${startS.toFixed(3)}–${endS.toFixed(3)}] ${JSON.stringify(text)}`, prefixed by
`quality gate: N finding(s) — ` as today; when `hint` is given, append `\n${hint}`. (The existing regex
`/cue 0 cps=21.*cue 1 tooShort=0.7/` still matches.) `qualityGate` is untouched.

### 3.2 tokenize.ts

```ts
export interface RawToken { word: string; sentenceInitial: boolean; cueIndex: number }   // already declared, now used
export function tokenizeCues(cues: Array<{ index: number; text: string }>): RawToken[]
```

For each cue in order: `lines = text.split('\n')`; a line starting with `-` is a speaker line: strip that one hyphen and mark
its first token sentence-initial. Otherwise the cue's first token is sentence-initial when `cueIndex === 0`, or the previous
cue's text (last line, trailing whitespace trimmed) ends with `[.!?…]`. Within a cue, a token is sentence-initial when the
previous raw token (before stripping) ends with `[.!?…]`. Split on `/\s+/`; strip with the existing `STRIP_LEAD`/`STRIP_TRAIL`;
drop tokens without a letter or digit. `tokenizeWords` stays as is.

### 3.3 vtt.ts

```ts
export const LINT_LIMITS = { cps: 20, lines: 2, lineLength: 42, minDuration: 1 }                 // unchanged
export const NATIVE_LINT_LIMITS = { cps: 26, lines: 2, lineLength: NATIVE_LINE, minDuration: 1 }
export function checkVtt(vtt: string, trackId: string, limits = LINT_LIMITS)
/** The manual-correction input: parseVtt(minDuration 0, mergeGap 0) → Seg[] in time order, index = position, text as written (tags already stripped by the kit). Throws on zero cues. */
export async function loadCuesVtt(path: string, trackId: string): Promise<Seg[]>
```

`loadCuesVtt` rounds `start`/`end` to ms (`Math.round(x * 1000) / 1000`) and does **not** wrap; `prepare()` wraps.

### 3.4 translate.ts — `alignNative`

```ts
for each seg, each native n ≠ from:
  if (isDualText(seg.text)) out[i][n] = (await Promise.all-sequential over lines: '-' + await translate(line.slice(1), from, n)).join('\n')   // no wrap
  else out[i][n] = wrap2(await translate(seg.text.replace(/\n/g, ' '), from, n), NATIVE_LINE)
```

Sequential calls as today (TPS limits). Import `isDualText`, `NATIVE_LINE` from `../segment`.

### 3.5 normalize.ts

```ts
/** --cues re-runs: ffprobe the existing mezzanine instead of downloading and encoding again. */
export async function probeMezz(work: string, deps: Pick<PrepareDeps, 'exec'>): Promise<{ durationS: number }>
```

Same ffprobe args/parse as `normalize`, on `${work}/mezz.mp4`; factor the duration parse into a shared local helper.

## 4. prepare.ts — replace steps 1–3, 5 and 7

```ts
// 1. media: a --cues re-run reuses the mezzanine when it exists
const reuse = !!input.cues && existsSync(`${work}/mezz.mp4`)
const { durationS } = reuse ? await probeMezz(work, deps) : await normalize(work, source, deps)
// 2–3. cues: from Transcribe + segmenter, or from the corrected VTT
let transcribeJob: string | null = null
let segs: Seg[]; let dropped: Dropped[] = []
if (input.cues) {
  const tPath = `${work}/transcript.json`
  if (existsSync(tPath)) transcribeJob = (JSON.parse(await readFile(tPath, 'utf8')) as { jobName?: string }).jobName ?? null
  segs = (await loadCuesVtt(input.cues, lang)).map((s) => ({ ...s, text: wrap2(s.text) }))     // read fully before anything is written
} else {
  transcribeJob = transcribeJobName(slug, deps.now())
  const transcript = await deps.transcribe(source, lang, transcribeJob)
  await writeFile(`${work}/transcript.json`, JSON.stringify(transcript, null, 2))
  const words = wordsFromTranscribe(transcript)
  if (!words.length) throw new Error(`no speech in ${slug}`)
  await writeFile(`${work}/words.json`, JSON.stringify(words))
  const r = segmentWithReport(words)
  segs = r.cues.map((s) => ({ ...s, text: wrap2(s.text) })); dropped = r.dropped
}
for (const d of dropped) warnings.push(`dropped cue ${d.startS.toFixed(3)}–${d.endS.toFixed(3)} ${JSON.stringify(d.text)} (${d.reason})`)
// write before the gate so a human can correct what the segmenter produced
const targetVtt = cuesToVtt(segs, lang); const targetPath = `${work}/${lang}.vtt`
await writeFile(targetPath, targetVtt); vttFiles[lang] = targetPath
if (dropped.length) await writeFile(`${work}/dropped.vtt`, cuesToVtt(dropped.map((d, i) => ({ index: i, startS: d.startS, endS: d.endS, text: d.text })), lang))
await writeFile(`${work}/gate.json`, JSON.stringify(gateReport(segs, dropped), null, 2) + '\n')
assertGate(segs, `edit ${targetPath} (condense, retime, split or merge the cues; a line break in the file is kept) and re-run with --cues ${targetPath}`)
```

Step 5: delete the `raw`/`cueOf` block (lines 67–69) and use `const raw = tokenizeCues(segs)`; `tokensByCue[t.cueIndex]` replaces
`cueOf.get(i)`. Everything else in step 5 is unchanged.

Step 7: the target VTT is already on disk — keep the `checkVtt(targetVtt, lang)` hard check (it must still throw on findings);
do not write it again. Native loop: `checkVtt(vtt, n, NATIVE_LINT_LIMITS)`. `clipBase.source.transcribeJob = transcribeJob`.
`vttFiles` is declared before step 1. The final log line gains `, ${dropped.length} dropped`.

`types.ts`: `PrepareInput.cues?: string  /** path of a corrected WebVTT for the target track; skips Transcribe + segmentation (docs/decisions/0007) */`.

`cli.ts`: `.option('--cues <file.vtt>', 'skip Transcribe and segmentation; take the target cues from this WebVTT (the manual-correction path, docs/decisions/0007)')`
and `.option('--fixture [name]', 'use the committed Transcribe fixture <name> (default 60s; also overlap) and recorded doubles …')`;
pass `cues: o.cues` and `fixtureDeps(lang, { transcript: typeof o.fixture === 'string' ? o.fixture : '60s' })`. Update the header
comment and help examples with `--fixture overlap --lang de --native en` and a `--cues work/<slug>/de.vtt` example.

`fixtureDeps(lang, opts: { durationS?: number; transcript?: string })`: transcript file `transcribe-${opts.transcript ?? '60s'}-${lang}.json`;
lemma table = `lemmas-${lang}.json` merged with `lemmas-${name}-${lang}.json` when `name !== '60s'` and that file exists (`{ ...base, ...extra }`), strict.

## 5. The overlapping-speaker fixture

### 5.1 `dialogue-overlap-de.txt` (one line; markers explained below)

```
[B] Ja. [A+0.02] Wir haben das Projekt im letzten Jahr dreimal komplett neu geplant und umgebaut. Genau. [B+0.05] Aber was ist mit den Kosten? [A] Die Kosten waren nie das Problem. Ich habe gestern mit ihm gesprochen, [B+0.02] Ja. [A+0.02] und er sagte, dass er morgen kommt. Das war wirklich nicht einfach für uns alle. [B-0.12] Das glaube ich dir sofort. [A] [fast] Nein, nein, nein, warte mal kurz! [/fast] [B+0.03] Okay, okay. [A] Das Ganze hat uns am Ende fast zwei Monate gekostet, und niemand war zufrieden. [B+0.02] Mhm. [A+0.02] Deshalb haben wir diesmal von Anfang an alles anders gemacht. [B] Und hat es funktioniert? [A] Ja, zum Glück hat es funktioniert.
```

### 5.2 gen-fixtures.ts — syntax and output

- Speaker token: `/^\[([A-Z])([+-]\d+(?:\.\d+)?)?\]$/`. Letter → `spk_${letter.charCodeAt(0) - 65}` (A → `spk_0`, B → `spk_1`).
  With an offset, `cursor = lastEnd + Math.round(offset * 100)` (cs), replacing whatever pause the previous punctuation added
  (`[B+0.05]` = 50 ms after the previous word ends, `[B-0.12]` = 120 ms before it ends). Without an offset the cursor is untouched.
  `[fast]`/`[/fast]` unchanged. The timing rule for words, gaps and pauses is unchanged.
- When a speaker is active, every item (pronunciation **and** punctuation) carries `speaker_label`, `audio_segments[]` carry
  `speaker_label`, and `results.speaker_labels = { channel_label: 'ch_0', speakers: <distinct count>, segments: [...] }` where
  a segment is a maximal run of consecutive items with one label: `{ start_time, end_time, speaker_label, items: [{ start_time, end_time, speaker_label }] }`
  (pronunciation items only, as in the AWS example https://docs.aws.amazon.com/transcribe/latest/dg/diarization-output-batch.html).
  When no speaker token ever appears, the output is byte-identical to today (the 60s fixtures' regeneration test proves it).
- `transcribeFixtureFromDialogue(dialogue, lang, name = '60s')` → `jobName: fixture-${name}-${lang}`.
- `FIXTURE_SETS = [{ name: '60s', lang: 'de' }, { name: '60s', lang: 'en' }, { name: 'overlap', lang: 'de' }]`; `--transcribe`
  writes `transcribe-${name}-${lang}.json`; `--lemmas` writes `lemmas-${lang}.json` for `60s` (name unchanged) and
  `lemmas-${name}-${lang}.json` otherwise.
- `fixtureVocabulary(t, lang)` builds its `(word, sentenceInitial)` pairs the way `prepare()` now does:
  `tokenizeCues(segmentWithReport(wordsFromTranscribe(t)).cues.map(wrap))` plus `EXTRA_FORMS`. For the 60s fixtures the key set
  must come out identical to the committed `lemmas-{de,en}.json` (the existing "matches the committed lemma table" test checks it);
  if it does not, regenerate with `--lemmas` and list the differing keys in the PR.

### 5.3 Expected segmentation of the overlap fixture (acceptance values)

`segmentWithReport(wordsFromTranscribe(overlap))`:

| # | text (unwrapped, `\n` shown as ⏎) | how it got there |
|---|---|---|
| 0 | `Wir haben das Projekt im letzten Jahr dreimal komplett neu geplant und umgebaut.` | plain (80 chars) |
| 1 | `-Genau.⏎-Aber was ist mit den Kosten?` | "Genau." is 0.30 s before B starts, cannot merge backward (87 chars) → two-speaker cue with next |
| 2 | `Die Kosten waren nie das Problem.` | plain |
| 3 | `Ich habe gestern mit ihm gesprochen, und er sagte, dass er morgen kommt.` | B's "Ja." inside A's sentence dropped (interjection), clause rejoined |
| 4 | `Das war wirklich nicht einfach für uns alle.` | B's words start 0.12 s before "alle." ends → `endS === round(cue5.startS − 0.08)` |
| 5 | `Das glaube ich dir sofort.` | plain |
| 6 | `-Nein, nein, nein, warte mal kurz!⏎-Okay, okay.` | fast burst at 22 cps with B 30 ms behind it → two-speaker cue (≈ 19.3 cps) |
| 7 | `Das Ganze hat uns am Ende fast zwei Monate gekostet,` | clause flush (> 40 chars at the comma) |
| 8 | `und niemand war zufrieden.` | plain |
| 9 | `Deshalb haben wir diesmal von Anfang an alles anders gemacht.` | "Mhm." dropped (interjection at a sentence boundary → no rejoin) |
| 10 | `Und hat es funktioniert?` | plain |
| 11 | `Ja, zum Glück hat es funktioniert.` | plain |

`dropped` (in order): `Ja.` (reason `unplaceable`, speaker `spk_1`, clip start: no previous group, next is 80 chars), `Ja.`
(`interjection`), `Mhm.` (`interjection`). 12 cues, 3 drops, `qualityGate(wrapped cues) === []`, every gap ≥ 0.08, every cue
1–7 s, ≤ 20 cps, ≤ 2 lines × 42. The texts above are fixed acceptance values; if a text differs, the algorithm in §2 was not
followed — do not adjust the dialogue to fit.

## 6. CLI / human path (document in data/README.md)

```
pnpm --filter @lingo/pipeline cli prepare --clip jung-naiv-drogen --source s3://…/jung-naiv-drogen.mp4 --lang de --native en
# → quality gate: 2 finding(s) — cue 41 cps=22.4 [184.120–187.000] "…"; …
#   edit work/jung-naiv-drogen/de.vtt (…) and re-run with --cues work/jung-naiv-drogen/de.vtt
# open work/jung-naiv-drogen/de.vtt next to work/jung-naiv-drogen/mezz.mp4 in any subtitle editor; condense/retime; save
pnpm --filter @lingo/pipeline cli prepare --clip jung-naiv-drogen --source s3://…/jung-naiv-drogen.mp4 --lang de --native en --cues work/jung-naiv-drogen/de.vtt
```

`dropped.vtt` sits next to it: copy a block back into `de.vtt` to restore a dropped cue. `gate.json` lists findings and drops
for the spot check. `pnpm --filter @lingo/pipeline cli prepare --clip overlap-de --source s3://unused --lang de --native en --fixture overlap --no-publish`
lets a human eyeball the two-speaker cues in `work/overlap-de/`.

## 7. Tests (`it(...)` names; keep every existing test unchanged)

**test/segment.test.ts**
- `starts a new cue at a speaker change even mid-sentence`
- `never merges cues of different speakers onto one line`
- `builds a two-speaker cue with one hyphenated line per speaker when a short turn cannot stand alone` (inline words: 80-char A sentence, "Genau." A, B question 50 ms later)
- `drops a ≤ 2-word interjection inside the other speaker’s turn and rejoins the interrupted clause` (reports `reason: 'interjection'`)
- `drops an unplaceable ≤ 2-word cue at the start of the clip and reports it` (`reason: 'unplaceable'`)
- `ends a cue two frames before the next speaker’s overlapping words instead of trimming it under 1 s`
- `keeps a fast burst under 20 cps by pairing it with the other speaker’s reply`
- `a two-speaker cue is never merged again` (three alternating 1-word turns → one dual + one drop, never three lines)
- `overlap fixture: 12 cues, 3 dropped, the texts of §5.3, every cue within limits and ≥ 2 frames apart`
- `segment() equals segmentWithReport().cues and reports nothing dropped for the 60-second fixtures`
- `wrap2 leaves text with a forced line break untouched and honours maxLine` (`wrap2('a\nb')`, `wrap2(100 chars, 56)` → 2 lines ≤ 56)
- `fits2 accepts two hyphenated lines of ≤ 42 and rejects a third line or a 43-char line`

**test/gate.test.ts**
- `assertGate names the text and time span of every finding and appends the hint` (message matches `/cue 0 cps=21 \[0\.000–2\.000\] "a+"/` and ends with the hint)
- `returns [] for the segmented overlap fixture`
- `gateReport joins findings with their cue and carries the dropped list`

**test/tokenize.test.ts**
- `tokenizeCues strips the speaker hyphen and marks each hyphenated line’s first word sentence-initial`
- `tokenizeCues marks a cue’s first word sentence-initial only when the previous cue ends a sentence` (`['Ich warte,', 'und du?']` → `und` false; `['Ja.', 'Und du?']` → `Und` true)
- `tokenizeCues agrees with tokenizeWords on word and sentenceInitial for both 60-second fixtures`

**test/vtt.test.ts**
- `checkVtt with NATIVE_LINT_LIMITS accepts a 56-char line at 25 cps and flags 57 chars and 27 cps`
- `loadCuesVtt returns cues in time order with ms timestamps, keeps a written line break and skips NOTE blocks`

**test/translate.test.ts** (new)
- `translates a two-speaker cue line by line and keeps the hyphens` (translate spy called with `'Genau.'` then `'Aber was?'`; result `'-[Genau.]\n-[Aber was?]'`)
- `wraps a long single-line translation into two lines of ≤ 56`

**test/transcribe.test.ts**
- `regenerating dialogue-overlap-de.txt reproduces transcribe-overlap-de.json byte for byte`
- `overlap fixture: speaker_label on every item, speaker_labels with 2 speakers and one segment per run, one item starting before the previous item ends`
- `speaker offsets: [B+0.05] starts 50 ms after the previous word ends, [B-0.12] 120 ms before`
- `the 60-second fixtures carry no speaker_label and no speaker_labels section` (byte-identity already covers it; this one documents the intent)

**test/lemmatize.test.ts**
- `cover every (word, sentenceInitial) pair of the overlap fixture` (`lemmas-overlap-de.json`)
- `matches the committed lemma table for the overlap fixture` (in the `skipIf no simplemma` block)

**test/prepare.test.ts** (additions; the existing `describe.each` stays)
- `overlap fixture: clip.json passes every limit, has 12 cues, two hyphenated two-speaker cues, no token contains a leading hyphen, and exactly 3 "dropped cue" warnings`
- extend `throws (assertGate) when the segmenter output is tampered to 25 cps`: after the rejection, `${workRoot}/fast-${lang}/${lang}.vtt` and `gate.json` exist, `gate.json.findings[0].problem === 'cps'` with `text` and `startS`, and the message matches `/--cues /`
- `with cues: skips Transcribe and segmentation, re-wraps a single-line cue, keeps a written line break, and tokens follow the edited text`
  (run the fixture once; edit its `de.vtt`: join cue c1's lines into one line, add a `\n` inside a short cue, delete one word from another cue — no new words, the lemma table is strict; re-run with `cues`; `deps.transcribe` spy not called; `clip.source.transcribeJob` equals the first run's; the deleted word has no token; `cues.length` equals the file's cue count)
- `with cues: reuses mezz.mp4 when present and runs ffprobe only` (pre-create `${work}/mezz.mp4`; `deps.calls` has no `aws s3 cp` and no `ffmpeg` before `packager`)
- `native lines are wrapped at 56 and a 15-char-longer translation produces no warning` (translate double: `t.toUpperCase() + ' ab ab ab ab ab'`)
- `a native line that cannot be wrapped under 56 is a warning, not a failure` (translate double appends `' ' + 'x'.repeat(60)`; prepare resolves; a warning matches `/native .* lineLength=/`)

## 8. Done when

- `pnpm --filter @lingo/pipeline typecheck && pnpm --filter @lingo/pipeline test` green; `pnpm test` at the root green (the prepare snapshot unchanged).
- Every `it(...)` in §7 exists and passes; the 107 baseline tests pass without edits to their assertions.
- `pnpm --filter @lingo/pipeline gen:fixtures --transcribe --lemmas` is a no-op on a clean tree (fixtures committed as generated).
- `cli prepare … --fixture overlap --no-publish` writes `work/overlap-de/{clip.json,de.vtt,native-en.vtt,dropped.vtt,gate.json}` with 12 cues and 3 dropped.
- PR body cites https://docs.aws.amazon.com/transcribe/latest/dg/diarization.html and
  https://docs.aws.amazon.com/transcribe/latest/dg/diarization-output-batch.html (Transcribe speaker labels) and the Netflix dual-speaker rule,
  https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide ("Dual Speakers").

## 9. Follow-ups for the orchestrator (not this implementer)

- TASKS.md, under LING-005: `follow-up from LING-001 (docs/decisions/0007 M5): GET /clips/:slug returns only highlights with rank ≥ BANDS[NEXT[learner.level]][0] and builds wordsYoullMeet from that set; move BANDS/NEXT to @lingo/contracts; derive or drop Learner.knownRank`.
- LING-002: `glossWord` receives the two-line text of a two-speaker cue; decide whether to pass only the highlighted word's line.
- LING-008 ingest checklist (docs/content.md §8): add the `--cues` step after the first run of each real clip.
