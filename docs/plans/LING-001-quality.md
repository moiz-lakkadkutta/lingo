# LING-001 — Quality fixes from the first real two-clip run

Status: plan (Fable, 2026-10-01). Implementer: Opus. Reviewer: Fable. Decision record: docs/decisions/0008-upstream-quality.md.
Base: **the merged `feat/ling-001-gate` branch** (docs/plans/LING-001-gate.md, decision 0007). This plan uses 0007's interfaces
as given — `segmentWithReport()`, `Dropped`, `render()`, `runs()`, `timing()` with the tail cut, `tokenizeCues()`, `loadCuesVtt()`,
`probeMezz()`, `PrepareInput.cues`, `fixtureDeps(lang, { transcript })`, `gen-fixtures` `FIXTURE_SETS` — and does not restate them.
If the gate PR is still open when you start, branch from it and rebase; do not reimplement any of its pieces.
Baseline before you start: `pnpm --filter @lingo/pipeline typecheck && pnpm --filter @lingo/pipeline test` green on the gate branch.

Freeze is Oct 15. Sections marked **must** ship in this ticket; **later** items are listed in §13 for the orchestrator.

## 0. Where this plan touches the same functions as the gate plan

| Function (gate plan §) | Gate plan does | This plan does |
|---|---|---|
| `segment.ts` grouping loop (§2.3) | adds the speaker flush to the greedy loop | **replaces the loop** by repair → utterances → glue → chunk (§3). The speaker flush survives as an utterance boundary. |
| `segment.ts` merge pass (§2.5) | fallback chain for `bad` cues | unchanged, except `canMerge`/`canDual` gain `gapBetween(i) ≤ GLUE_GAP_S` (§3.6) |
| `segment.ts` `timing()` (§2.4), `render()`, `runs()`, `Dropped`, `SegmentReport` | defines them | unchanged; `Dropped.reason` gains `'nonverbal'` |
| `tokenize.ts` `tokenizeCues()` (§3.2) | cue-text tokens, sentence-initial after `. ! ?` and hyphen lines | adds the optional `startS`/`endS` input and the pause rule (§4) |
| `prepare.ts` steps 1–3 (§4) | `--cues` branch, `probeMezz`, writes vtt/gate.json before the gate | adds the `reuse` branch beside `cues` (§8.1), warnings for drops/unranked/no highlights, per-step timings |
| `prepare.ts` step 5 | `tokenizeCues(segs)` | passes the same `segs` (they carry `startS`/`endS` already) — no change |
| `translate.ts` `alignNative` (§3.4) | wraps at 56, dual cues line by line | adds the spelled-letters bypass (§7.2); `translateWithAws` gains settings (§7.1) |
| `normalize.ts` | `probeMezz()` | ffmpeg quiet flags in `ffmpegNormalizeArgs` (§8.3) |
| `cli.ts`, `types.ts` | `--cues`, `--fixture [name]` | `--reuse`, `--formality`, `--fixture real/<name>` (§8) |
| `fixtureDeps.ts` | `opts.transcript` name → `transcribe-${name}-${lang}.json` | the name may carry a directory (`real/friedlaender`) (§9.3) |
| `gen-fixtures.ts` `FIXTURE_SETS` (§5.2) | `{ name, lang }` generated from dialogue | adds `given: true` sets whose transcript is committed, lemmas only (§9.4) |

Nothing in `gate.ts`, `vtt.ts`, `package.ts` beyond `--quiet`, `publish.ts`, or `packages/contracts` changes.

## 1. Fixes in priority order

| # | Finding | Fix | Ship |
|---|---|---|---|
| P1 | 11 — no re-run without Transcribe, log flood, no timings | `--reuse`, step timings, quiet ffmpeg/packager, real fixtures (§8, §9) | **must** (first: everything else is measured with it) |
| P2 | 1, 2, 3, 8 — pauses, hesitation stops, orphan at the 7 s limit, `00.` | segmenter restructure (§3) | **must** |
| P3 | 4, 5 — sentence-initial after pauses, contractions, en name rule | `tokenizeCues` pause rule, `isName` by rank, single letters (§4, §5.1) | **must** |
| P4 | 6 — names highlighted (Margot, Brasilien, Pete) | hand additions + `build-names.ts` seeds (§5.2) | **must** for the hand additions and the `Intl` seed; **should** for the Wikidata seed (time-box 2 h) |
| P5 | 10 — `sich` unranked, B1 rated B2 | `creditLemmas` fix + rebuild, ranked-only level, unranked warning (§6.2, §6.3) | **must** |
| P6 | 7 — 0 highlights on the A2 clip | floor-only band, zero-highlight warning (§6.1) | **must** |
| P7 | 9 — register and spelled letters in translation | `Settings` (brevity, formality), verbatim spelling cues (§7) | **must** (small) |
| L1 | 6 — de fallback flags Isolierung/Margarine/Tütchen as names | `¬known` in the de rule | later (no visible effect: unranked words are never highlighted, the app ignores `name`) |
| L2 | 9 — context for translation | sentence-level translation + split | later / never (0008 decision 11) |
| L3 | 11 — on-screen UI words transcribed | clip choice (human, §14) | — |

Suggested order: P1 → P2 → P3 → P4 → P5 → P6 → P7. Commit after each P; run the re-measure (§11) after P2, P4, P5.

## 2. Files

| Action | File | What |
|---|---|---|
| modify | `packages/pipeline/src/segment.ts` | `PAUSE_S`, `GLUE_GAP_S`, `UTTERANCE_GAP_S`, `repairWords`, `utterances`, `glueOrphans`, `chunk`, new `segmentWithReport` body, gap bound in the merge predicates |
| modify | `packages/pipeline/src/tokenize.ts` | `tokenizeCues` pause rule |
| modify | `packages/pipeline/src/names.ts` | en rule by rank, single-letter rule, `COMMON_RANK` |
| modify | `packages/pipeline/src/highlights.ts` | floor-only band, ranked-only `clipLevel`/`coverageRank`, `unrankedShare` |
| modify | `packages/pipeline/src/steps/translate.ts` | `translateSettings()`, `isSpelling()`, settings on the client call, verbatim bypass |
| modify | `packages/pipeline/src/steps/normalize.ts` | ffmpeg quiet flags |
| modify | `packages/pipeline/src/steps/package.ts` | `--quiet` |
| modify | `packages/pipeline/src/prepare.ts` | `reuse`, `formality`, step timings, three new warnings, print warnings |
| modify | `packages/pipeline/src/types.ts` | `PrepareInput.reuse`, `PrepareInput.formality` |
| modify | `packages/pipeline/src/cli.ts` | `--reuse`, `--formality <FORMAL\|INFORMAL>`, `--fixture real/<name>` examples |
| modify | `packages/pipeline/src/fixtureDeps.ts` | fixture name with directory |
| modify | `packages/pipeline/scripts/gen-fixtures.ts` | `given` sets |
| modify | `packages/pipeline/scripts/build-freq.ts` | pipe-lemma fix, `sich` in `SANITY` |
| create | `packages/pipeline/scripts/build-names.ts` | `Intl` + Wikidata seeds, merge into `data/names-{lang}.txt` |
| create | `packages/pipeline/scripts/stats.ts` | the re-measure report (§11), ported from the spike's `stats.py` |
| modify | `packages/pipeline/data/names-de.txt`, `names-en.txt` | hand additions + seeds |
| regenerate | `packages/pipeline/data/freq-de.txt`, `freq-en.txt`, `*.meta.json` | `pnpm --filter @lingo/pipeline build:freq` |
| modify | `packages/pipeline/data/README.md` | names seed rule, `--reuse`, the no-highlights verdict |
| create | `packages/pipeline/test/fixtures/real/README.md` | provenance and licences (§9.1) |
| create | `packages/pipeline/test/fixtures/real/transcribe-friedlaender-de.json`, `transcribe-voa01-en.json` | §9.2 |
| create | `packages/pipeline/test/fixtures/real/lemmas-friedlaender-de.json`, `lemmas-voa01-en.json` | generated (§9.4) |
| create | `packages/pipeline/test/real.test.ts` | the regression expectations (§10.1) |
| modify | `packages/pipeline/test/{segment,tokenize,names,highlights,translate,prepare,freq,transcribe}.test.ts` | §10.2 |
| modify | `packages/pipeline/package.json` | `"build:names": "tsx scripts/build-names.ts"`, `"stats": "tsx scripts/stats.ts"` |
| modify | `docs/content.md` §8 | one bullet: after the first run read `clip.json.warnings`; `no highlights` = reject the clip; add names to `data/names-*.txt` |

## 3. segment.ts — the new front half (P2)

### 3.1 Constants and exports

```ts
export const PAUSE_S = 1.0          // a word gap above this always ends an utterance
export const GLUE_GAP_S = 2.0       // an orphan may be glued / a group merged across a gap up to this, never more
export const UTTERANCE_GAP_S = 0.5  // = PAUSE_S − EXTEND: the cue gap below which two cues cannot have been split at a pause (tokenize.ts uses it)
export interface Dropped { startS: number; endS: number; text: string; speaker?: string; reason: 'interjection' | 'unplaceable' | 'nonverbal' }
export function segmentWithReport(words: Word[]): SegmentReport      // signature unchanged
```

Module-private helpers (next to 0007's `runs`, `render`, `lastEndOf`, `endsSentence`):

```ts
const spoken = (g: Word[]) => lastEndOf(g) - g[0]!.start
const isOrphan = (g: Word[]) => spoken(g) < MIN_S - 1e-9
const gapBetween = (a: Word[], b: Word[]) => b[0]!.start - lastEndOf(a)
const sameSpeaker = (a: Word[], b: Word[]) => speakerOf(a) === undefined || speakerOf(b) === undefined || speakerOf(a) === speakerOf(b)   // as in 0007
const hasLetter = (t: string) => /\p{L}/u.test(t)
const ok = (g: Word[]) => fits2(render(g)) && spoken(g) <= MAX_S && chars(render(g)) / Math.max(spoken(g), 0.01) <= CPS * 1.5   // today's three overflow checks
```

### 3.2 `repairWords(words): { words: Word[]; dropped: Dropped[] }` — before anything else

Pure; input words are not mutated (copy the objects you change).

1. **Non-verbal sentences.** Split `words` into sentence runs (a run ends at a word matching `/[.!?…]$/`). A run whose joined text has
   no letter (`!hasLetter(joinWords(run))`) is removed; push one `Dropped` per run: `{ startS: round(run[0].start), endS: round(lastEndOf(run)),
   text: joinWords(run), speaker?, reason: 'nonverbal' }`. Runs with a letter are kept whole (digits inside speech stay).
2. **Hesitation stops.** Let `run` be the sentence run (from step 1) that ends at word `w = words[i]`, and `n = words[i + 1]` the next word.
   Strip the trailing `.` of `w` (`w.text = w.text.slice(0, -1)`) when **all** of:
   - `w.text` ends with exactly one `.` (not `…`, not `?` or `!`);
   - `n` exists, starts with a lowercase letter (`/^\p{Ll}/u`) and does not itself end a sentence (`!/[.!?…]$/.test(n.text)`);
   - `sameSpeaker([w], [n])`;
   - `gap = n.start − w.end` satisfies `gap ≤ PAUSE_S`, **or** `isOrphan(run) && gap ≤ GLUE_GAP_S` (a fragment may reach across a longer
     pause to the clause it belongs to; a full sentence may not).

   On the de clip this repairs exactly three stops: `hat.` at 23.139 (orphan run, gap 1.50, next `im`), `hat.` at 52.319 (gap 0.69, next
   `man`), `gehen.` at 1:08.6 (gap 0.92, next `und`). It keeps `deutsch.` (next `hat.` ends a sentence), `Kartoffeln.` / `Toten.` /
   `erfahren.` (full sentences, gaps 1.07–1.24 > `PAUSE_S`), `Man hat.` (gap 2.62) and `Ich habe am.` / `aber.` / `Dann.` / `als.` (next word
   capitalised). Record the count: `SegmentReport.repairedStops: number`.

### 3.3 `utterances(words): Word[][]`

One pass; start a new utterance before word `w` when any of:
- the previous word ends a sentence (`/[.!?…]$/` after repair),
- speaker change (both labels present and different — 0007 rule),
- `w.start − prev.end > PAUSE_S`.

### 3.4 `glueOrphans(utts: Word[][]): Word[][]`

Left to right over the list, `i = 0`:
```
u = utts[i]
if (!isOrphan(u)) { i++; continue }
next = utts[i+1], prev = utts[i-1]
canNext = next && sameSpeaker(u, next) && gapBetween(u, next) ≤ GLUE_GAP_S
canPrev = prev && sameSpeaker(prev, u) && gapBetween(prev, u) ≤ GLUE_GAP_S
if (!endsSentence(u)) order = [next, prev]                                   // a fragment belongs to what follows
else order = gapBetween(prev,u) ≤ gapBetween(u,next) ? [prev, next] : [next, prev]   // smaller gap first (undefined gaps count as ∞)
pick the first of `order` that is allowed (canNext/canPrev); if none: i++ (the orphan stays)
glue: splice the two into one array in time order; do NOT advance i (the glued utterance is re-checked: it may still be an orphan, e.g. `I am` + `I'm`)
```
No limit is checked here; `chunk` enforces limits afterwards. Gluing across a sentence end is allowed (a cue may show two sentences).

### 3.5 `chunk(run: Word[]): Word[][]`

```
if (run.length <= 1) return [run]
// a) clause rule (today's behaviour, kept for 0007 §5.3 cue 7/8): first k < run.length-1 with chars(render(run[0..k])) > 40,
//    /[,;:]$/.test(run[k].text) and !isOrphan(run[k+1..])
if (k found) return [...chunk(run[0..k]), ...chunk(run[k+1..])]
if (ok(run)) return [run]
// b) balanced bisection: candidates k in [0, run.length-2]; feasible = !isOrphan(left) && !isOrphan(right); if no k is feasible, all are
//    cost(k) = |chars(render(left)) − chars(render(right))| − (/[,;:]$/.test(run[k].text) ? 15 : 0); pick min cost, ties → smaller k
return [...chunk(left), ...chunk(right)]
```
`chars` is 0007's newline-free length. The recursion terminates because every split shortens both parts. Example (de clip):
`Gesagt Was willst du mit zwei Kindern in Schai verhungern kannst du auch in Berlin.` (82 chars, 7.6 s) → no clause mark → bisect at
`in` (40 | 41 chars) → `… Kindern in` | `Schai verhungern kannst du auch in Berlin.`; `hat im Ersten Weltkrieg ein Bruder verlor für
Deutschland war selber hoch ausgezeichnet, hat das Eiserne Kreuz gehabt.` → clause split at `ausgezeichnet,` → the 87-char prefix
bisects at `verlor` | `für`.

### 3.6 `segmentWithReport` body

```
const { words: w, dropped } = repairWords(words)
let groups = glueOrphans(utterances(w)).flatMap(chunk)
… 0007 merge pass unchanged, with:
  canMerge(i) additionally requires gapBetween(groups[i], groups[i+1]) <= GLUE_GAP_S
  canDual(i)  additionally requires gapBetween(groups[i], groups[i+1]) <= GLUE_GAP_S
  drop() pushes onto the same `dropped` array
… timing, final trim, `dropped` sorted by startS — unchanged
return { cues, dropped, repairedStops }
```
`segment(words)` stays `segmentWithReport(words).cues`.

Effect on the committed fixtures (verify, do not assume): the 60 s and overlap fixtures have no word gap ≥ 1 s (gen-fixtures pauses are
0.45 s after `.`, so no utterance splits at a pause); the 60 s **en** fixture has two padded cues (`work/demo-en`: 2 cues at exactly
1.0 s) that now glue to a neighbour — its cue count drops by up to two, no test asserts the count. The 0007 §5.3 table must come out
unchanged: `Ja.` (clip start, next speaker differs → no glue → still `unplaceable`), `Genau.` (next speaker differs, previous is 80
chars → glue would be re-split by `chunk` into the same two pieces → the dual rule still fires), `Mhm.` (different speakers both sides).
If any §5.3 text changes, the implementation deviates from §3.3–3.5 — fix the code, not the table.

## 4. tokenize.ts (P3)

```ts
export function tokenizeCues(cues: Array<{ index: number; text: string; startS?: number; endS?: number }>): RawToken[]
```
0007's rules plus one: the first token of cue `c` is sentence-initial also when the previous cue `p` has `endS`, `c` has `startS`,
`c.startS − p.endS ≥ UTTERANCE_GAP_S` and `p`'s last line does not end in `, ; :`. `prepare()` already passes `segs` (with times); the
`--cues` path gets times from `loadCuesVtt`. Import `UTTERANCE_GAP_S` from `./segment`.

## 5. names.ts and the names data (P3, P4)

### 5.1 `isName` (en by rank)

```ts
export const COMMON_RANK = 1000   // = BANDS.A1[1]; a word below it can never be highlighted, so calling it vocabulary costs nothing
export function isName(t: { word: string; lemma: string; known: boolean; sentenceInitial: boolean }, ctx: NameCtx): boolean {
  const core = t.word.replace(/['’].*$/u, '')                      // I'm → I, N's → N, Let's → Let
  if (core.length < 2) return false                                 // single letters (and "I") are never names
  if (ctx.list.has(t.word)) return true
  if (ctx.lang === 'en') {
    if (!/^[A-Z]/.test(t.word)) return false
    const r = ctx.rank(t.lemma) ?? ctx.rank(core.toLowerCase())    // Let's → lemma "let"; I'm → lemma "I'm" (unranked) → "i"
    return r === undefined || (!t.sentenceInitial && r >= COMMON_RANK)
  }
  return /^[A-ZÄÖÜ]/.test(t.word) && t.lemma === t.word && ctx.rank(t.lemma.toLowerCase()) === undefined   // de unchanged
}
```
`known` stays in the input type (unused; removing it touches `prepare.ts`, which the gate PR owns — drop it in a later cleanup).
Update the doc comment: en — listed, or capitalised with no rank, or capitalised mid-sentence with rank ≥ 1 000; "I" and single letters never.

`prepare.ts` step 5: `rank: rank(lemma) ?? rank(core) ?? null` so `I'm` carries rank(`i`) in `clip.json` — factor the two-step lookup
into `export function rankOf(word: string, lemma: string, rank): number | undefined` in `names.ts` (or `freq.ts`) and use it in both places.

### 5.2 Names data

Hand additions now (`data/names-de.txt`): Margot, Friedländer, Brasilien, Shanghai, Auschwitz, Theresienstadt, Leonie, Tilo, Mathias,
Bröckers; (`data/names-en.txt`): Pete, Irving, Margot. Keep the files sorted.

`scripts/build-names.ts` (`pnpm --filter @lingo/pipeline build:names [--wikidata]`), deterministic output, idempotent:
1. `Intl` seed, no network: for every ISO 3166-1 alpha-2 code (the 249 codes; take them from
   `Intl.supportedValuesOf` is not available for regions, so embed the list as a constant, cited from
   https://www.iso.org/obp/ui/#search — or derive from `Intl.supportedValuesOf('currency')`? no: embed) and every UN M49 continent code
   (`002 Africa, 019 Americas, 142 Asia, 150 Europe, 009 Oceania, 021 Northern America, 005 South America`), take
   `new Intl.DisplayNames([lang], { type: 'region' }).of(code)`; for every language code in `Intl.supportedValuesOf('…')` — not
   available either; embed the ISO 639-1 two-letter codes (184) — take `type: 'language'`. Keep a label only when it is a single token
   `/^\p{Lu}[\p{L}'’-]*$/u` (so `Vereinigte Staaten`, `Costa Rica` are skipped). Skip a label whose lowercase form is a word simplemma
   knows in that language **and** that has rank < `COMMON_RANK` in `freq-{lang}.txt` (`Nice` is not a region label, but `Chad`, `Jordan`,
   `Georgia` in en are both names and words — keep them: the rank test protects only the top 1 000, where highlighting is impossible anyway).
2. Wikidata seed (`--wikidata`, network): SPARQL against https://query.wikidata.org/sparql, `User-Agent: lingo-pipeline (hackathon)`:
   ```sparql
   SELECT ?label WHERE { ?n wdt:P31/wdt:P279* wd:Q202444 . ?n rdfs:label ?label . FILTER(LANG(?label) = "<lang>") }
   ```
   (`Q202444` = given name; the subclass path covers male/female given names). Page with `LIMIT 50000 OFFSET …` until empty; cache the
   raw result in `data/.cache/wikidata-given-names-<lang>.json` (gitignored). Keep single-token labels only; drop a label whose
   lowercase form simplemma knows in that language (`is_known` via the bridge, batches of 5 000) — that is the rule the README already
   uses by hand (`Bill`, `Rose`, `August`, `Halle`, `Roman` stay vocabulary); drop labels already listed.
3. Merge: existing file ∪ hand additions ∪ seeds, one per line, sorted with `localeCompare(lang)`, written back. Print counts.
   Expect roughly 15–30 k lines per language after the Wikidata seed; `loadNames` into a `Set` is fine at that size.
4. After `build:names`, run `build:freq` (§6.2) so the new names are stripped from the ranks as 0004 intends; the `data` test
   `a listed name has no frequency rank after the build` keeps passing only in that order.

If the Wikidata query times out or the result exceeds 60 k per language, ship the `Intl` seed + hand additions and record the
problem in the PR (the plan still passes §10 with the hand additions).

## 6. highlights.ts, prepare warnings, freq build (P5, P6)

### 6.1 Floor-only band and the zero-highlight verdict

```ts
export function pickHighlights(cues, rank, level: Level, maxShare = 0.4)   // signature unchanged
  const lo = BANDS[NEXT[level]][0]            // no upper bound; sort ascending stays, so the band just above fills first
  … filter t.r !== undefined && t.r >= lo …
```
Doc comment: "1–2 words per cue whose rank is at or above the floor of the band above the clip level, lowest rank first; the app
filters per learner (0007 M5)". In `prepare()` after `picked`: if `picked.length === 0` push the warning
`no highlights: no countable token has rank ≥ ${lo} (band above ${level}); the clip teaches nothing above its level — swap it (docs/content.md §8)`.

### 6.2 `creditLemmas` fix and rebuild

In `scripts/build-freq.ts` `creditLemmas`: treat `r.capped` as absent when `r.capped.lemma.includes('|')` (simplemma's ambiguity
marker; `Sich → er|es|sie`). Add `'sich'` to `SANITY.de`. Export a pure `isUsableLemma(l) = !l.includes('|')`. Run
`pnpm --filter @lingo/pipeline build:freq` after `build:names` (network for nothing: both `*_50k.txt` are in `data/.cache/`). Check the diff:
`sich` appears near rank 30–50; `freq-de.meta.json`/`freq-en.meta.json` `namesStripped` grows by the new names; no other
top-100 lemma disappears (compare `head -100` before/after and list any removed lemma in the PR).

### 6.3 Ranked-only level

```ts
export function clipLevel(tokens: Token[], rank): Level        // over tokens with a rank; none ranked → 'B2'
export function coverageRank(tokens: Token[], rank): number    // over tokens with a rank; none → UNKNOWN_RANK
export function unrankedShare(tokens: Token[], rank): { share: number; lemmas: string[] }   // distinct unranked lemmas, sorted
```
Keep `UNKNOWN_RANK` exported (the contract comment on `coverageRank` says "unknown = 99999" — update that comment in
`packages/contracts/src/prepared.ts` to "over ranked tokens; 99999 when none is ranked"; a comment-only change is allowed).
`prepare()`: `const u = unrankedShare(rankable, rank); if (u.share > 0.05) warnings.push(\`unranked tokens: ${Math.round(u.share*100)} % of countable tokens have no frequency rank (${u.lemmas.slice(0,12).join(', ')}${u.lemmas.length > 12 ? ', …' : ''}) — ASR errors or rare words; the level ignores them\`)`.

### 6.4 Print warnings

At the end of `prepare()`, before the summary line: `for (const w of warnings) deps.log(\`warning: ${w}\`)`.

## 7. translate.ts (P7)

### 7.1 Settings

```ts
export type Formality = 'FORMAL' | 'INFORMAL'
/** Targets that support Settings.Formality (docs/decisions/0008); brevity is always requested — unsupported pairs ignore it. */
export const FORMALITY_TARGETS = new Set(['de', 'nl', 'fr', 'fr-CA', 'hi', 'it', 'ja', 'ko', 'pt-PT', 'es', 'es-MX'])
export function translateSettings(to: string, formality: Formality = 'INFORMAL'): { Brevity: 'ON'; Formality?: Formality }
export async function translateWithAws(text, from, to, opts: { region?: string; formality?: Formality } = {}): Promise<string>
```
`TranslateTextCommand({ Text, SourceLanguageCode, TargetLanguageCode, Settings: translateSettings(to, opts.formality) })`.
`PrepareDeps.translate` keeps `(text, from, to) => Promise<string>`; `prepare()` binds the clip's formality:
`const translate = (t, f, to) => deps.translate(t, f, to, { formality })` — extend the seam type to
`translate(text, from, to, opts?: { formality?: Formality })` (fixture double ignores it). `PrepareInput.formality?: Formality`
(default `'INFORMAL'`), CLI `--formality <FORMAL|INFORMAL>`.

### 7.2 Spelled letters

```ts
/** True when the cue is nothing but spelled letters: ≥ 2 tokens after stripping punctuation and every token is one letter (A N N A.). */
export function isSpelling(text: string): boolean
```
In `alignNative`: `if (isSpelling(seg.text)) { out[i][n] = seg.text; continue }` (no Translate call; the native line equals the target line).

## 8. Reuse, timings, quiet tools (P1)

### 8.1 `--reuse`

`types.ts`: `PrepareInput.reuse?: boolean  /** reuse work/<slug>/{mezz.mp4,transcript.json} when present: no download, ffmpeg or Transcribe (re-measure after a pipeline change) */`.
`prepare.ts`, inside 0007's step 1–3 block:
```ts
const reuseMedia = (!!input.cues || !!input.reuse) && existsSync(`${work}/mezz.mp4`)
const { durationS } = reuseMedia ? await probeMezz(work, deps) : await normalize(work, source, deps)
…
} else if (input.reuse && existsSync(tPath)) {
  const transcript = TranscribeJson.parse(JSON.parse(await readFile(tPath, 'utf8')))
  transcribeJob = transcript.jobName ?? null
  deps.log(`reusing ${tPath}`)
  const words = wordsFromTranscribe(transcript); if (!words.length) throw …; await writeFile(`${work}/words.json`, …)
  const r = segmentWithReport(words); segs = …; dropped = r.dropped
} else { … Transcribe as in 0007 … }
```
`cli.ts`: `.option('--reuse', 'reuse work/<slug>/mezz.mp4 and transcript.json when present (no download, ffmpeg or Transcribe); Translate and Bedrock still run')`.

### 8.2 Step timings

In `prepare()`: `const t0 = Date.now(); const mark = (what: string) => deps.log(\`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${what}\`)`
after: media, transcript (`transcribed` / `reused` / `cues from file`), segment (`${segs.length} cues, ${dropped.length} dropped,
${repairedStops} hesitation stops repaired`), translate, lemmatize, highlights, vtt, package, publish. Keep the final summary line.

### 8.3 Quiet tools

`ffmpegNormalizeArgs`: prepend `'-hide_banner', '-loglevel', 'error', '-nostats'` (before `-y`). `packagerArgs`: append `'--quiet'` after
`--hls_master_playlist_output`. Update the two argv snapshots (`package.test.ts.snap`, `prepare.test.ts.snap`) and the explicit argv
assertions in `normalize.test.ts`/`package.test.ts` if they list the flags.

### 8.4 `scripts/stats.ts`

Port the spike's `stats.py` (scratchpad) to TypeScript: `pnpm --filter @lingo/pipeline stats work/<slug>/clip.json` prints cue count,
cps / line-length / duration / gap distributions (min, median, p95, max), cues > 17 cps, cues < 1.2 s, cues at exactly 1.0 s, cues ≥ 6 s,
speech coverage, highlights with lemma/rank/cue, names, unranked non-name lemmas, warnings, native lines > 56. Pure function
`statsFor(clip: PreparedClip): Stats` + a printer, so `real.test.ts` can assert on `Stats`.

## 9. Fixtures

### 9.1 Provenance (`test/fixtures/real/README.md`)

- `transcribe-friedlaender-de.json` — Amazon Transcribe output (de-DE, speaker labels) for "Interview mit Holocaust-Überlebender Margot
  Friedländer" (Terra X), 0:00–3:46, source https://commons.wikimedia.org/wiki/File:Interview_mit_Holocaust-Überlebender_Margot_Friedländer.webm,
  **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0), attribution exactly as docs/content.md row 3:
  "ZDF/TerraX/Leonie Schöler/Julia Geiß/Michael Fandel/Benjamin Leng/Margot Friedländer Zeitzeugin/Maximilian Mohr — CC BY 4.0".
  The transcript is a machine transcription of the clip's speech and is shared under the same licence.
- `transcribe-voa01-en.json` — Amazon Transcribe output (en-US) for "Let's Learn English – Lesson 1: Welcome!" (VOA Learning English),
  0:00–5:00, https://learningenglish.voanews.com/a/lets-learn-english-lesson-one/3111026.html, **US public domain** (VOA-produced; terms
  https://learningenglish.voanews.com/p/6021.html), credit "Voice of America (VOA Learning English)".
- Both: `accountId` removed; `jobName`, `status`, `results` (transcripts, items, speaker_labels, audio_segments) kept verbatim. Never
  regenerated by `gen:fixtures`.

### 9.2 Copy and scrub

From the scratchpad run (`…/scratchpad/work/terra-x-friedlaender/transcript.json`, 187 KB pretty; `…/voa-lets-learn-english-01/transcript.json`,
114 KB): `JSON.stringify({ ...t, accountId: undefined })` compact + trailing newline → ≈ 110 KB and 65 KB. Verify with
`grep -c accountId` = 0 and `TranscribeJson.parse` succeeds. Expected shape: de 428 items, 2 speakers, 19 audio segments; en 244 items,
4 speakers, 43 audio segments.

### 9.3 `fixtureDeps(lang, { transcript: 'real/friedlaender' })`

The gate plan resolves `transcribe-${name}-${lang}.json` and `lemmas-${name}-${lang}.json` under `test/fixtures/`. Allow a directory
in the name: `const dir = dirname(name), base = basename(name)` → `resolve(FIXTURES, dir, \`transcribe-${base}-${lang}.json\`)` and
`resolve(FIXTURES, dir, \`lemmas-${base}-${lang}.json\`)`, merged over `lemmas-${lang}.json`, strict. `durationS` for the real sets:
pass `opts.durationS` from `real.test.ts` (226.3 and 300.4) so coverage numbers match the real run.

### 9.4 Lemma tables

`gen-fixtures.ts` `FIXTURE_SETS` gains `{ name: 'real/friedlaender', lang: 'de', given: true }, { name: 'real/voa01', lang: 'en', given: true }`;
`--transcribe` skips `given` sets, `--lemmas` reads the committed transcript and builds the vocabulary through the prepare path
(`tokenizeCues(segmentWithReport(wordsFromTranscribe(t)).cues.map(wrap))`, as the gate plan's `fixtureVocabulary`). Generate **last**,
after every segmenter/tokenizer change (keys carry the sentence-initial flag). The regeneration test (§10.2 lemmatize) catches drift.
Expected size ≈ 300 and 150 keys.

## 10. Tests

Fixture loader for the real sets (put in `test/real.test.ts`, reuse in others): `realWords('friedlaender','de')`, `realClip('friedlaender','de')`
(runs `prepare()` with `fixtureDeps(lang, { transcript: 'real/<name>', durationS })`, `publish: false`, `ai: false`, in a temp `workRoot`).
Every expectation below is derived from the run's `words.json`/`transcript.json` by the algorithm in §3–§7. If one fails: first re-check the
code against the section it cites; only when the code is right and the expectation is wrong, change the expectation and say why in the PR.

### 10.1 `test/real.test.ts`

**describe('friedlaender de — segmentation')** on `segmentWithReport(realWords)`, cues wrapped with `wrap2`:
- `passes the quality gate` — `qualityGate(cues)` equals `[]`.
- `drops nothing and repairs three hesitation stops` — `dropped` equals `[]`; `repairedStops` equals `3` (`hat.` ×2, `gehen.` — §3.2 lists
  why the other six candidates keep their stop).
- `never spans a word gap above GLUE_GAP_S and never a pause above PAUSE_S without gluing` — for every cue, consecutive words inside it
  have `gap ≤ GLUE_GAP_S`; the number of cues with an inner gap `> PAUSE_S` is `≤ 3` (today: 1 at 1.65 s inside `Man hat, weiß ich…`;
  gluing adds at most `hat` + 1.5 s and `aber.` + 1.91 s).
- `leaves no one- or two-word cue except the clause "ohne rauszugehen."` — `cues.filter(c => wordCount(c.text) <= 2).map(c => c.text)`
  equals `['ohne rauszugehen.']`.
- `attaches the hesitation "hat" to the clause that follows` — some cue text (newline → space) starts with `hat man die Papiere angeguckt`;
  some cue text contains `hat im Ersten Weltkrieg`; no cue text equals `hat.`.
- `keeps "Berlin." with its sentence at the 7 s limit` — some cue text matches `/kannst du auch in Berlin\.$/`.
- `pads no cue to exactly 1.0 s except true isolates` — cues with `endS − startS === 1.0` (±1 ms): `≤ 1`.
- `cue count lies between 48 and 58` (today 58; gluing and clause splits move it; a value outside the range means a rule misfired).

**describe('voa01 en — segmentation')**:
- `drops the two sound-effect cues "00." as nonverbal` — `dropped` has exactly two entries with `text === '00.'` and `reason === 'nonverbal'`.
- `never bridges the lesson's silences` — no cue has an inner word gap `> GLUE_GAP_S`; in particular no cue text contains both `Hi` and `Speak`,
  nor `Speak Speak`.
- `keeps "Say your name" in one cue` — some cue text matches `/Say your name/`; no cue text equals `name`.
- `keeps the spelled name in one cue` — some cue text matches `/A N N A\./` (both occurrences).
- `passes the quality gate`.

**describe('friedlaender de — clip')** on `realClip`:
- `names: Margot, Friedländer, Brasilien, Shanghai and Auschwitz are names; no name is highlighted` — every token with those words has
  `name === true`; `highlights.every(h => !['Margot','Brasilien','Schai','Shanghai'].includes(h.word))`.
- `highlights reach above 8000 once the ceiling is gone` — `highlights.some(h => h.lemma === 'Konsulat')`; all `h.rank ≥ BANDS[NEXT[level]][0]`.
- `sich is ranked` — every token with `word === 'sich'` has `rank !== null` (after the freq rebuild, §6.2).
- `level is B1 with the unranked share under 5 %` — `level === 'B1'`, `coverageRank < 4000`, no warning starts with `unranked tokens`.
  (Margin: ≈ 15 of ≈ 335 ranked countable tokens sit at rank ≥ 4 000 = 4.5 %. If the rebuilt list moves a word across 4 000 and the clip
  comes out B2, report the 95th-percentile rank in the PR and keep the assertion as `['B1','B2']` with a comment — do not tune constants.)
- `native lines align 1:1 and the translate double was not called for spelled letters` (none in this clip; assert `native` keys per cue).

**describe('voa01 en — clip')**:
- `names-en has none of the lesson's UI words or contractions` — the set of `name === true` words has none of
  `['Listen','Speak','Say','Now','Nice','Fast','A','An','N',"N's","Let's","Here's","I'm",'Apartment','Record','Street']`.
- `names-en has Pete, Anna, Ana, Irving` — each appears with `name === true` in every occurrence (Pete through the list, Irving by rank).
- `I'm carries the rank of "i"` — every token with `word === "I'm"` has `rank !== null && rank < 100`.
- `zero highlights with the verdict warning` — `highlights.length === 0`; `warnings.some(w => w.startsWith('no highlights: no countable token has rank ≥ 2000'))`;
  `level === 'A2'`; `coverageRank < 2000`.
- `the spelled cue is copied verbatim into the native track` — for the cue whose text is `A N N A.` (if it stands alone; otherwise the cue
  `No, A N N A.` is translated — then assert only that the translate double was called with it) — implement with a translate spy:
  `isSpelling('A N N A.') === true`, `isSpelling('No, A N N A.') === false`, `isSpelling('I am Pete.') === false`.

### 10.2 Unit tests (existing files; keep every existing `it` unless listed)

**segment.test.ts**
- `splits an utterance at a word gap above PAUSE_S` (`mk` words with a 1.2 s hole → two cues; 0.9 s hole → one cue).
- `glues an orphan without a sentence end to the utterance that follows, across up to GLUE_GAP_S` (`hat` + 1.5 s + sentence → one cue
  starting with `hat`; + 2.1 s → `hat` stays alone).
- `glues an orphan with a sentence end to the neighbour across the smaller gap` (`Ja.` 0.2 s after a question, 0.9 s before the next →
  joins the question).
- `never glues across a speaker change` (labels differ → orphan stays; the 0007 chain then builds a dual cue — assert two lines).
- `bisects an overflowing sentence in balance instead of leaving one word` (82-char sentence timed at 7.6 s → two cues, the second ends
  with the sentence's last word and has ≥ 3 words).
- `keeps the clause rule unless the remainder would be an orphan` (sentence with a comma at 45 chars and a 2-word 0.6 s tail → no split at
  that comma).
- `repairs a hesitation stop before a lowercase word within a pause, or across up to GLUE_GAP_S for an orphan fragment` (`hat. man` at
  0.7 s → `hat man`; lone `hat.` + 1.5 s + `im` → `hat im`; `Kartoffeln.` at the end of a 4 s sentence + 1.2 s + `verfaulte` → unchanged).
- `keeps a stop before a one-word sentence, before a capitalised word, across a speaker change, and never touches ! or ?` (`deutsch. hat.`,
  `aber. Man`, labelled A/B, `Toll! und` — all unchanged).
- `drops a sentence without letters as nonverbal and keeps digits inside speech` (`00.` dropped with reason; `bis 38 immer` kept).
- `overlap fixture: 12 cues, 3 dropped, the texts of the gate plan §5.3` — already exists in the gate plan; it must still pass unchanged.
- `60-second fixtures: no pause split, no drop; the en fixture glues its two padded cues` (assert 0 cues at exactly 1.0 s for en).

**tokenize.test.ts**
- `tokenizeCues marks a cue sentence-initial after a gap ≥ UTTERANCE_GAP_S unless the previous cue ends in a clause mark`
  (`[{text:'Listen', 0–1.0}, {text:'Nice to meet you', 1.6–3}]` → `Nice` true; `[{text:'Ich warte,', …}, {text:'und du', +0.8 s}]` → `und` false).
- `tokenizeCues without timestamps behaves as before` (the gate plan's cases unchanged).

**names.test.ts** — give the `en` context a rank fn `{ wait: 300, london: undefined, pete: 1617, listen: 186, let: 500, i: 10, xanthippe: undefined }`:
- change `en: capitalised mid-sentence word is a name` to use `London` (unranked) — passes as is.
- change `en: sentence-initial unknown capitalised word is a name` to `en: sentence-initial unranked capitalised word is a name` (Xanthippe).
- add `en: a capitalised A1 word mid-sentence is vocabulary, not a name` (`Listen` mid-sentence → false; `Pete` mid-sentence → true;
  `Pete` sentence-initial → false unless listed).
- add `en: contractions rank by their stem and are never names` (`I'm` mid-sentence false; `Let's` sentence-initial false).
- add `single letters and I are never names in either language` (`A`, `N`, `N's`, `I`).
- `data`: add `['Margot','Brasilien','Shanghai','Auschwitz']` to the de names expectations and `['Pete','Irving']` to en; add
  `de('sich')` is defined.

**highlights.test.ts**
- change `picks words in the band above the level …`: with level `A1` the floor is 1 000 and there is no ceiling, so the expected lemmas are
  `['warte', 'angerufen', 'abgenommen']` (cue 0 gives `warte`; cue 1 gives the two B1 words, ascending). Keep the A2 assertion.
- add `has no ceiling: a rank above 8000 is picked when it is the rarest candidate` and `never picks below the floor`.
- add `clipLevel and coverageRank ignore unranked tokens; unrankedShare reports them` (tokens: 19 ranked A1 + 1 unranked → `A1`,
  share 0.05, lemmas `['x']`).

**translate.test.ts** (gate plan file)
- `translateSettings requests brevity always and formality only for supported targets` (`de` → `{Brevity:'ON',Formality:'INFORMAL'}`;
  `en` → `{Brevity:'ON'}`; `('de','FORMAL')` → FORMAL).
- `alignNative copies a spelled-letters cue verbatim and never calls translate for it`.
- `isSpelling` cases (§10.1).

**prepare.test.ts**
- change `highlights cover ≤ 40 % …`: remove `expect(h.rank).toBeLessThan(hi)`; keep `≥ lo`.
- add `with reuse: takes transcript.json and mezz.mp4 from the work dir and calls neither transcribe, aws s3 cp nor ffmpeg` (run once;
  then `prepare({ …, reuse: true })` with a `transcribe` spy; `deps.calls` has only `ffprobe`, `packager`; `clip.source.transcribeJob`
  equals the first run's).
- add `logs a timing line per step` (log spy: lines matching `/^\[\d+\.\d s\] /` ≥ 6).
- add `prints every warning through deps.log` (translate double that appends 60 x's → a `warning: native …` log line).
- update the argv snapshot (quiet flags).

**normalize.test.ts / package.test.ts** — assert `-hide_banner -loglevel error -nostats` precede `-y`; `--quiet` is present.

**freq.test.ts** — `creditLemmas ignores a capitalised lookup whose lemma carries |` (`sich` row with `capped: { lemma: 'er|es|sie', known: true }`
→ credits `sich` only).

**transcribe.test.ts** — `the real fixtures parse, carry no accountId, and have 428 / 244 items`.

**lemmatize.test.ts** — `cover every (word, sentenceInitial) pair of the real fixtures` and, in the `skipIf no simplemma` block,
`matches the committed lemma table for the real fixtures`.

## 11. Re-run procedure (re-measure both clips without Transcribe)

Offline, no AWS at all — the regression numbers:
```
pnpm --filter @lingo/pipeline cli prepare --clip friedlaender --source s3://unused --lang de --native en --fixture real/friedlaender --no-publish --no-ai
pnpm --filter @lingo/pipeline cli prepare --clip voa01 --source s3://unused --lang en --native de --fixture real/voa01 --no-publish --no-ai
pnpm --filter @lingo/pipeline stats work/friedlaender/clip.json
pnpm --filter @lingo/pipeline stats work/voa01/clip.json
```
(the fixture translate double upper-cases, so native lines are not meaningful here).

With real translations (Amazon Translate only, cents; no Transcribe, no download, no ffmpeg): copy the spike's work dirs
(`…/scratchpad/work/terra-x-friedlaender`, `…/voa-lets-learn-english-01`, each with `transcript.json` and `mezz.mp4`) into
`packages/pipeline/work/`, then
```
AWS_REGION=eu-central-1 pnpm --filter @lingo/pipeline cli prepare --clip terra-x-friedlaender --source s3://unused --lang de --native en --reuse --no-publish --no-ai
AWS_REGION=eu-central-1 pnpm --filter @lingo/pipeline cli prepare --clip voa-lets-learn-english-01 --source s3://unused --lang en --native de --reuse --no-publish --no-ai
pnpm --filter @lingo/pipeline stats work/terra-x-friedlaender/clip.json   # and voa
```
Record in the PR, before/after, per clip: cues, cues at exactly 1.0 s, cues < 1.2 s, max inner gap, p95 gap, level, coverageRank,
highlights (count + list), names, unranked lemmas, warnings. Baseline (spike, 2026-10-01): de — 58 cues, 8 at 1.0 s, 9 < 1.2 s, level B2,
coverage 6574, 14 highlights incl. Margot/Brasilien, 8 names incl. Isolierung/Margarine/Tütchen, 2 native cps warnings; en — 46 cues,
12 at 1.0 s, 15 < 1.2 s, max gap bridged 5.14 s, level A2, coverage 1504, 0 highlights, 21 names incl. Listen/Speak/Say/Now/Nice/Fast/A/An/N/Let's/Here's/I'm,
8 native cps warnings. Spot-check the German `native-en.vtt` for register and the English `native-de.vtt` for `du` throughout and for
`A N N A.` surviving verbatim; count native cps warnings with brevity on.

## 12. Risks

- **Conflict with the gate PR.** Both rewrite `segment.ts`'s grouping. Mitigation: start after the gate PR merges; otherwise rebase daily
  and keep 0007's §5.3 table as the invariant.
- **Expectation drift on real fixtures.** The §10.1 values were traced by hand from `words.json`; a few may be off by one rule interaction.
  The instruction in §10 (check the code first, then the expectation, explain in the PR) is the control; do not tune `PAUSE_S`/`GLUE_GAP_S`
  to make a test pass.
- **Freq rebuild shifts ranks** (one or two places after `sich`; new names stripped). The 60 s fixtures assert properties, not ranks; the
  prepare snapshot holds argv only. `demo-de`'s six highlights may move by a rank; the spot-check table in LING-002 is regenerated anyway.
- **Wikidata seed size/latency.** Time-boxed; the `Intl` seed and hand additions are enough for this ticket's assertions.
- **Brevity changes wording**, occasionally dropping a nuance; it is what the Translate docs recommend for subtitles. Compare 10 random cues
  before/after in the PR.
- **INFORMAL default** is wrong for lectures/news addressing the viewer; `--formality FORMAL` per clip, to be noted in the content register.
- **Gluing across a sentence end** puts two short sentences in one cue (`I am Pete. Nice to meet you.`) — standard subtitling, but the Explain
  card then shows two sentences; acceptable.
- **A2 clip still has 0 highlights** by design; the human decision in §14 is required before the demo.

## 13. Later (not this ticket)

- de name fallback with `¬known` (0008 L1) once the app reads `token.name`.
- Wikidata given-name seed for `build:names` (§5.2 step 2, `--wikidata`): skipped in the P4 implementation; only the `Intl` seed and the hand additions shipped.
- Use Transcribe's `audio_segments` (already in the fixtures) as a second utterance signal; today unused.
- Automatic condensing (0007 M2.4) if ≥ 10 % of real cues need the `--cues` path.
- Remove `known` from `isName`'s input once the gate PR's `prepare.ts` is settled.
- Friction logs worth filing (`pnpm friction "<title>"`): Transcribe full stops at hesitations; TranslateText has no context/alignment
  option; Transcribe cannot be re-run from a cached transcript in the console.

## 14. Needs a human

- **Swap the English clip.** `voa-lets-learn-english-01` has no vocabulary above A2 and its UI words are transcribed as speech; 39 % of its
  5 minutes is speech. Reserve rows R8 (`what-to-do-on-a-date-1950`, A2–B1, continuous scripted speech, PD) or R13 are the nearest
  replacements; the pipeline will now say `no highlights` for any clip like VOA lesson 1.
- Confirm `INFORMAL` as the default register and mark `openhpi-*` rows `FORMAL` in docs/content.md.
- Confirm committing the two Transcribe outputs under the clips' licences (CC BY 4.0 with the attribution string; US PD) — §9.1.

## 15. Done when

- `pnpm --filter @lingo/pipeline typecheck && pnpm --filter @lingo/pipeline test` green; root `pnpm test` green; every `it` of §10 exists.
- `pnpm --filter @lingo/pipeline gen:fixtures --lemmas` and `build:names && build:freq` are no-ops on the committed tree.
- §11 before/after numbers in the PR body; the de clip reports level B1 (or the documented exception), the en clip 0 highlights with the warning.
- PR cites: Translate formality https://docs.aws.amazon.com/translate/latest/dg/customizing-translations-formality.html, brevity
  https://docs.aws.amazon.com/translate/latest/dg/customizing-translations-brevity.html, settings
  https://docs.aws.amazon.com/translate/latest/APIReference/API_TranslationSettings.html, TranslateText
  https://docs.aws.amazon.com/translate/latest/APIReference/API_TranslateText.html; Transcribe output format
  https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html#how-it-works-output; ffmpeg options https://ffmpeg.org/ffmpeg.html#Generic-options
  and https://ffmpeg.org/ffmpeg.html#Main-options; Shaka Packager https://shaka-project.github.io/shaka-packager/html/documentation.html;
  `Intl.DisplayNames` https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames; Wikidata licensing
  https://www.wikidata.org/wiki/Wikidata:Licensing and SPARQL endpoint https://query.wikidata.org/; CC BY 4.0 https://creativecommons.org/licenses/by/4.0;
  VOA terms https://learningenglish.voanews.com/p/6021.html.
