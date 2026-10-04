# LING-002 Gate C: getting the gloss and quiz spot check to pass

Planner: opus (standing in for fable), 2026-10-02. Branch `feat/ling-001-pipeline` at 108c22e. Builds on docs/plans/LING-002.md
(§3 prompts, §8 rubric, §12 revisions). Decisions: docs/decisions/0009-gloss-quality.md.

Content rule for whoever carries this out: the German Gate C clip (`terra-x-friedlaender`) is a Holocaust-survivor interview. Do not print
its rows into a log, a test or a chat. Everything in this plan is derived from the English clip `what-to-do-on-a-date-1950` (en → de, A2,
122 cues, 20 highlights). The German gold set (§8.6) is left to the human.

## 0. What failed and why (English rows only)

The first real Nova Lite v1 run scored about 6/15 glosses and 7/10 quiz items. Each failure is matched to its cause and its fix:

| # | Failure seen | Root cause | Fix (section) |
|---|---|---|---|
| F1 | `sal` (ASR error for "sale") highlighted, glossed "der Sal", a cloze item built on it with the real "sale" as a distractor | Transcribe confidence 0.158 is thrown away. simplemma *knows* `sal` (`is_known('sal','en') = true`, a real word: the sal tree), and the freq list ranks it 4 972 (from the name "Sal"). Neither the `known` flag nor the freq list can catch it. | §1 ASR filter |
| F2 | Glosses copy neighbouring words: "mehr Heftklammern" (tacks), "kommende Aktivitäten" (activities), "Kosten, nicht viel" (expense), "eine tolle Frau" (swell) | The prompt gets `{word, lemma, cue}` but the occurrence is not marked, and "meaning AS USED IN THIS LINE" invites translating the phrase. Free-form gloss up to 6 words. | §2 prompt v3 (marked target, `sense` first, headword glosses), §3 validators G-LEN and G-NEIGHBOUR |
| F3 | tennis → "Tennisschläger" (the gloss of the next word, racket) | Same as F2; both highlights in one cue got the same gloss and nothing compares them | §4 clip-level sibling check |
| F4 | Wrong sense: old-timer → "ein erfahrener Mensch" (the line is about an old *thing*: "No amount of stuff could make this thing look any older. Boy, that is an old-timer.") | Model sense selection; no field forces the model to state a sense before translating | §2 `sense` field first; §6 model choice |
| F5 | False grammar: swell "Komparativ besser"; refreshments "Pl. refreshment"; roast "Pl. weenie roasts"; tennis "Pl. tennisschläger" | Grammar is free text, so code cannot check it | §2 structured grammar fields, §3 form validators, §2.4 code renders the note |
| F6 | tennis example in German ("Ich spiele Tennis mit meinem Freund.") | No language check on the example | §3 validator X-LANG |
| F7 | A meaning item's answer key was a neighbour's (wrong) gloss | F3 propagated into the quiz | §4 (conflict → excluded), §5 quiz eligibility |
| F8 | The sheet shows 15 rows; the quiz uses glosses not on it ("Baseball-Spiel", "Faulenzerin") | `perClip` truncates the sheet, the quiz uses all 20 highlights | §7 sheet = every gloss the quiz uses |
| F9 | The CLI echoes the whole sheet, earlier sections included | `cli.ts:76` prints the file, not the new section | §7 |

The Translate native line of the cue is available at gloss time (`clip.cues[i].native[native]`, `native[s.index]` in prepare) and shows
the leak directly: "Hast du **mehr** Tipps?", "Liste **kommender** Aktivitäten.", "**Nicht viel** Arrangement, nicht viel Geld". §3 uses it
only to *validate*; it is not sent to the model (0009 decision 4).

## 1. Priority order (each step is a separate, reviewable commit)

| P | Change | Files | Why first |
|---|---|---|---|
| P1 | ASR filter on highlight candidates | contracts `prepared.ts`, pipeline `highlights.ts`, `asr.ts` (new), `prepare.ts`, `spotCheck.ts` | Removes F1 and a broken cloze item; small, pure, offline-testable |
| P2 | Gloss card v3: prompt, tool schema, structured grammar, renderer | contracts `ai.ts` (+ `glossCard.ts`, `lexicon.ts` new), pipeline `ai/gloss.ts`, `ai/grammar.ts` (new) | F2, F4, F5, F6 |
| P3 | Validators v3 (per card) | contracts `glossCard.ts` | Retry feedback that names the exact problem |
| P4 | Clip-level glossing: sibling conflicts, statuses, drop instead of throw | contracts `glossCard.ts`, pipeline `ai/glossClip.ts` (new), `prepare.ts` | F3, F7; one code path for prepare and spot check |
| P5 | Quiz: eligibility, lemma/POS in the plan input, new plan checks | contracts `ai.ts`, pipeline `ai/quiz.ts` | F7, cloze near-spellings |
| P6 | Spot-check sheet and CLI | pipeline `spotCheck.ts`, `cli.ts` | F8, F9 |
| P7 | Model table, prices, optional reasoning | pipeline `ai/cost.ts`, `ai/call.ts`, `ai/index.ts`, `infra/lib/media-stack.ts` | Lets the eval compare models (§6) |
| P8 | Gold set, scorer, eval command | pipeline `eval/gold/*.json`, `src/eval/score.ts`, `scripts/eval-gloss.ts` | Prompt iterations without a human (§8) |

P7 and P8 can be built in parallel with P2–P6 (they touch other files); the eval *runs* need P2–P5. Then §9 (run order).

## 2. P1: ASR filter on highlight candidates

### 2.1 Facts (English clip transcript, measured)

- `sal` confidence 0.158; the three real `sale` tokens 0.98–0.994.
- All tokens below 0.6 in this clip: Sit 0.123, sal 0.158, who's 0.236, you'd 0.268, there 0.327, Pretty 0.353, Can 0.484, say 0.501,
  old-timer 0.519, Kay 0.532, Kate 0.536, Kay 0.544, Boy 0.552, maybe 0.564, could 0.599. The only highlightable word below 0.4 is `sal`;
  `old-timer` (0.519, a correct word) must survive, so the floor is **0.4**.
- VOA fixture (`test/fixtures/real/transcribe-voa01-en.json`): below 0.6 are piqued 0.075, `00` ×2, Anna ×3.
- 0008 recorded German hesitation words at 0.86–0.99, far above the floor.

### 2.2 Two rules (both pure)

1. **Confidence floor.** A token with ASR confidence `< MIN_HIGHLIGHT_CONFIDENCE = 0.4` is never a highlight candidate. It still counts for
   level and coverage (it is probably a real word that was misheard, and decision 10 of 0008 already ignores unranked ones).
2. **Near-spelling twin (works without confidence, so also on a `--cues` clip and on an existing clip.json).** A candidate token is an ASR
   suspect when its lemma L occurs once in the clip and another lemma M of the clip: occurs at least twice, `|M| ≥ 3`, Levenshtein(L, M) = 1,
   rank(M) < rank(L) (M is the more frequent word), and one occurrence of M has the same preceding token (case-insensitive) as L's
   occurrence. `sal` vs `sale`: once vs three times, distance 1, ranks 4 972 vs 2 121, both after "scavenger" → suspect.

### 2.3 Plumbing

- `packages/contracts/src/prepared.ts`: `PreparedToken` gains `asr: z.number().min(0).max(1).optional()` (Transcribe confidence; absent when
  unknown). Additive, so existing clip.json files and fixtures still parse.
- `packages/pipeline/src/asr.ts` (new):
  ```ts
  export const MIN_HIGHLIGHT_CONFIDENCE = 0.4
  /** Transcribe pronunciation items → { text (stripped, lowercase), start, end, confidence }. */
  export function confidenceItems(t: TranscribeJson): Array<{ text: string; start: number; end: number; conf: number }>
  /** For each RawToken (cue order), the confidence of the Transcribe item with the same stripped lowercase text whose midpoint lies in
   *  [cue.startS − 0.25, cue.endS + 0.25], matched left to right with one forward pointer per cue; undefined when there is no match. */
  export function alignConfidence(raw: RawToken[], cues: Array<{ index: number; startS: number; endS: number }>, items: ReturnType<typeof confidenceItems>): Array<number | undefined>
  /** Rule 2 of LING-002-gate-c §2.2. Returns keys `${cueIndex}|${word.toLowerCase()}`. */
  export function asrSuspects(cues: Array<{ index: number; tokens: Array<{ word: string; lemma: string }> }>, rank: (lemma: string) => number | undefined): Set<string>
  ```
- `prepare.ts`: after step 5, read the transcript (in memory, or `work/<slug>/transcript.json` when `--cues`/`--reuse` and the file exists)
  and set `asr` on each token via `alignConfidence`. Without a transcript (pure `--cues` with no work dir) no token has `asr`.
- `highlights.ts`: `Token` gains `asr?: number`. `pickHighlights(cues, rank, level, maxShare = 0.4, exclude?: Set<string>)`: drop a
  candidate when `t.asr !== undefined && t.asr < MIN_HIGHLIGHT_CONFIDENCE`, or when `exclude` has `${cueIndex}|${word.toLowerCase()}`.
  `prepare.ts` passes `asrSuspects(...)`. Every drop is a warning: `asr: skipped highlight "sal" (cue 42): confidence 0.16` /
  `asr: skipped highlight "sal" (cue 42): one-off near-spelling of "sale" after "scavenger"`.
- `spotCheck.ts`: `spotCheckCandidates` applies both rules to `clip.highlights` too (so a clip.json prepared before this change is
  filtered), and passes `exclude` to its widening `pickHighlights` calls.
- Why not simplemma's `known` or a dictionary list: `sal` is known, ranked and in dictionaries (0009 decision 1).

### 2.4 Tests (`test/asr.test.ts`, `test/highlights.test.ts`, `test/spotCheck.test.ts`)

- `it('alignConfidence gives each cue token the confidence of the Transcribe word with the same text inside the cue time span')`
- `it('alignConfidence leaves a token undefined when no Transcribe word matches (corrected VTT text)')`
- `it('pickHighlights never picks a token whose ASR confidence is below 0.4, but the token still counts for the clip level')`
- `it('pickHighlights keeps a correct word at confidence 0.519 (old-timer)')`
- `it('asrSuspects flags a one-off lemma at edit distance 1 from a more frequent clip lemma after the same word (scavenger sal / scavenger sale)')`
- `it('asrSuspects does not flag a real one-off word without a near-spelled twin, nor a twin after a different word')`
- `it('prepare writes an asr warning for every skipped highlight and asr confidences into clip.json tokens')`
- `it('spotCheckCandidates drops an ASR-suspect clip highlight from an older clip.json')`
- Regression on the real English fixture: `it('voa01: piqued (0.075) is never a highlight')`.

## 3. P2: gloss card v3 (prompt, tool, structured grammar)

### 3.1 Input payload

```json
{ "line": "Just a minute, Jeff. I'll get my tennis [[racket]].", "word": "racket", "lemma": "racket" }
```
`markTarget(cue, word)` (pipeline `ai/gloss.ts`): line breaks → space, then the first whole-word occurrence (same regex as `clozePrompt`)
is wrapped in `[[…]]`; throws if not found (the highlight is then `rejected`, never sent unmarked). There is no POS tagger in the
pipeline (simplemma has none), so code does not send a POS; the model returns one and the validators check the forms against it.

### 3.2 Tool schema (`explain_word`, flat, ≤ 2 levels, enums where possible)

Property order is the generation order; `sense` comes first so the model commits to a sense before translating, `example` (long string)
comes last (Nova tool-use best practice: "Place long string arguments last", "Constrain inputs using schema types (e.g., enum …)").

```ts
properties: {
  sense:      { type: 'string', description: 'Dictionary sense of the marked word in this line, a short definition in {T}, at most 12 words' },
  pos:        { type: 'string', enum: ['noun', 'verb', 'adjective', 'adverb', 'other'] },
  gloss:      { type: 'array', items: { type: 'string' }, description: '1 or 2 {N} headword translations of the marked word only' },
  register:   { type: 'string', enum: ['neutral', 'informal', 'formal', 'dated', 'slang'] },
  article:    { type: 'string', enum: ['der', 'die', 'das'], description: 'German nouns only' },
  plural:     { type: 'string', description: 'nouns: the plural form in {T}; "none" if it has no plural' },
  past:       { type: 'string', description: 'verbs: past tense in {T}' },
  participle: { type: 'string', description: 'verbs: past participle in {T}' },
  separable:  { type: 'string', description: 'German separable verbs: the prefix, e.g. "an"' },
  comparative:{ type: 'string', description: 'adjectives: the comparative in {T}; "none" if it has none' },
  example:    { type: 'string', description: 'One new {T} sentence using the marked word in this sense, at most 12 words' },
},
required: ['sense', 'pos', 'gloss', 'register', 'example'],
```
The `{T}`/`{N}` descriptions are filled per call (the tool config becomes a function of lang/native; it is part of the prompt hash).
If Nova v1 rejects `enum` in the input schema (ValidationException at the first eval run), drop the enums from the schema and keep them
in Zod; record it in 0009.

### 3.3 Zod card (`packages/contracts/src/glossCard.ts`)

```ts
export const POS = z.enum(['noun', 'verb', 'adjective', 'adverb', 'other'])
export const REGISTER = z.enum(['neutral', 'informal', 'formal', 'dated', 'slang'])
const form = z.string().trim().min(1).max(40)
export const GlossCard = z.object({
  sense: line(100, 12), pos: POS, gloss: z.array(line(40, 4)).min(1).max(2), register: REGISTER,
  article: z.enum(['der', 'die', 'das']).optional(), plural: form.optional(), past: form.optional(), participle: form.optional(),
  separable: z.string().trim().max(10).optional(), comparative: form.optional(),
  example: line(EXAMPLE_MAX_CHARS, EXAMPLE_MAX_WORDS),
}).strict()
export type GlossCard = z.infer<typeof GlossCard>
/** Fields that do not belong to card.pos are removed (never rendered, never an issue): a "comparative" on a noun cannot reach the note. */
export function pruneCard(c: GlossCard): GlossCard
```
Nova sometimes returns `""` for an unused optional field: a `z.preprocess` on the object drops `""` values before parsing.

### 3.4 Rendering (`packages/pipeline/src/ai/grammar.ts`): the app contract does not change

`Gloss` (`{ gloss, grammar, example }`) and `PreparedHighlight` stay as they are. Code builds them from the card:

```ts
export function cardToGloss(c: GlossCard, lang: Lang, native: string): Gloss
// gloss   = c.gloss.join(', ')                                  (validator G-LEN keeps it ≤ 6 words / 60 chars)
// grammar = renderGrammar(c, lang, native)                      (≤ 14 words / 90 chars by construction; tested)
// example = c.example
export function renderGrammar(c: GlossCard, lang: Lang, native: string): string
```
Templates (labels from the existing `LABELS` table, extended with `none`, `register`; other natives fall back to English labels, as v2):

| target | pos | de native (en target) | en native (de target) |
|---|---|---|---|
| en | noun | `Nomen, Pl. rackets` / `Nomen, ohne Plural` | – |
| en | verb | `Verb: supervise, supervised, supervised` | – |
| en | adjective | `Adjektiv, Komparativ sweller` / `Adjektiv, ohne Komparativ` | – |
| de | noun | – | `noun, der Regenschirm, pl. Regenschirme` |
| de | verb | – | `verb: warten, wartete, hat gewartet` / `separable verb: an\|rufen, rief an, hat angerufen` |
| de | adjective | – | `adjective, comparative spannender` |
| any | adverb / other | `Adverb` / `Wort` | `adverb` / `word` |

A non-neutral register appends `, umgangssprachlich` / `veraltet` / `gehoben` / `Slang` (de) or `, informal` / `dated` / `formal` / `slang` (en).

### 3.5 System prompt v3 (verbatim; `{T}` target language name, `{N}` learner's language name, `{LEVEL}`, `{TOOL}` = `explain_word`; the
`{FORMS}` and `{EXAMPLES}` blocks are chosen by target language)

```
You write one entry of a learner's dictionary for ONE word of a {T} subtitle line. The learner speaks {N}; their level is about {LEVEL} (CEFR, approximate).

Input JSON: {"line": the subtitle line with the target word marked like [[this]], "word": the marked word exactly as it appears, "lemma": its dictionary form}.

Work on the marked word only. The other words of the line are context: use them to decide which sense the marked word has here, but never translate them into the gloss. When the marked word is part of a compound or fixed phrase ("tennis racket", "weenie roast", "get acquainted"), gloss only the marked part, in the sense it has inside that phrase.

Call {TOOL} exactly once. Fill the fields in this order:
- sense: the dictionary sense of the marked word in this line, as a short {T} definition (at most 12 words). Pick the sense this line needs, including old-fashioned, informal or slang senses. Describe the word, not the line.
- pos: the part of speech of the marked word in this line.
- gloss: 1 or 2 {N} translations of the marked word in that sense, most common first. Each is a dictionary headword: one word, or two only when {N} has no single word for it. No articles, no sentences, no explanations, no words that translate other words of the line. If the translation is spelled like the {T} word, add a 1–3-word {N} clarifier in parentheses, e.g. "Tennis (Sport)".
- register: neutral, informal, formal, dated or slang, for the marked word in this sense.
- grammar fields, only those for its pos, with word forms in {T}: {FORMS}
- example: one new {T} sentence at level {LEVEL} that uses the marked word (or another form of "{lemma}") in the same sense. Not the given line, no names of people, at most 12 words. The sentence must be in {T}, never in {N}.

{EXAMPLES}

Output only the tool call.
```

`{FORMS}` for English targets:
```
nouns → plural (e.g. "rackets"; "none" for a word with no plural); verbs → past and participle ("go" → "went", "gone"); adjectives → comparative ("nifty" → "niftier", "useful" → "more useful", "good" → "better"). Do not use {N} words in these fields.
```
`{FORMS}` for German targets:
```
nouns → article (der, die or das) and plural ("Stunden"; "none" if it has none); verbs → past = 3rd person singular Präteritum ("wartete"), participle with its auxiliary ("hat gewartet", "ist gegangen"), separable = the prefix of a separable verb ("an" for anrufen); adjectives → comparative ("schneller", "besser"; "none" if it has none). Do not use {N} words in these fields.
```
`{EXAMPLES}` for en → any (the glosses below are German; for another native the block is introduced by "The glosses below are German;
yours must be in {N}." — only de and en natives exist today):
```
Examples (input → tool call):
{"line":"Grab your winter [[coat]], it's cold outside.","word":"coat","lemma":"coat"}
→ {"sense":"a warm piece of clothing worn over other clothes","pos":"noun","gloss":["Mantel"],"register":"neutral","plural":"coats","example":"My coat is too warm for spring."}
(Not "Wintermantel": "winter" is another word of the line.)
{"line":"That's a [[nifty]] little gadget.","word":"nifty","lemma":"nifty"}
→ {"sense":"clever and useful","pos":"adjective","gloss":["praktisch","raffiniert"],"register":"informal","comparative":"niftier","example":"This is a nifty way to save time."}
{"line":"We [[tidied]] up before the guests came.","word":"tidied","lemma":"tidy"}
→ {"sense":"to make a place neat (with \"up\")","pos":"verb","gloss":["aufräumen"],"register":"neutral","past":"tidied","participle":"tidied","example":"Please tidy your room before dinner."}
```
`{EXAMPLES}` for de → any (glosses English):
```
Examples (input → tool call):
{"line":"Ich hole schnell meinen [[Regenschirm]] aus dem Auto.","word":"Regenschirm","lemma":"Regenschirm"}
→ {"sense":"ein Schirm, der vor Regen schützt","pos":"noun","gloss":["umbrella"],"register":"neutral","article":"der","plural":"Regenschirme","example":"Hast du einen Regenschirm dabei?"}
{"line":"Der Film war echt [[spannend]].","word":"spannend","lemma":"spannend"}
→ {"sense":"so interessant, dass man mitfiebert","pos":"adjective","gloss":["exciting","thrilling"],"register":"neutral","comparative":"spannender","example":"Das Buch ist spannender als der Film."}
{"line":"Ich [[rufe]] dich morgen an.","word":"rufe","lemma":"rufen"}
→ {"sense":"mit jemandem telefonieren (anrufen)","pos":"verb","gloss":["to call","to phone"],"register":"neutral","past":"rief an","participle":"hat angerufen","separable":"an","example":"Kannst du mich heute Abend anrufen?"}
```
None of the few-shot words is in the English gold set (§8), so the eval is not contaminated.

### 3.6 Code changes in `ai/gloss.ts`

- `GLOSS_PROMPT_VERSION = 3`. The sha256 snapshot test now hashes `glossSystemPrompt(...)` **and** `JSON.stringify(glossToolConfig('de','en'))`.
- `glossSystemPrompt(lang, native, level, lemma)` (word no longer needed in the prompt text), `glossToolConfig(lang, native)`.
- `maxTokens` 300 → 500 (sense + forms; 2 000 when reasoning is on, §6).
- `GlossFn` signature:
  ```ts
  export interface GlossRequest { word: string; lemma: string; cue: string; nativeCue?: string; lang: Lang; native: string; level: Level; hint?: string }
  export type GlossOutcome =
    | { status: 'ok' | 'soft'; card: GlossCard; gloss: Gloss; issues: string[] }   // soft = accepted on retry with only soft issues
    | { status: 'rejected'; issues: string[]; lastOutput: unknown }
  export type GlossFn = (r: GlossRequest) => Promise<GlossOutcome>
  ```
  `makeGloss` no longer throws `AiSchemaError` for a rejected card (transport errors still throw). `hint` (§4) is appended to the user
  message as a second text block and is part of the cache key. The cache stores the **card** (`GlossCard`), so a renderer change does not
  re-ask Bedrock. Cache identity adds `nativeCue` only through `hint`/validation, not the key (the validators re-run on every hit).
- `prompts.ts` `glossWord` keeps its old positional signature as a thin wrapper returning `Gloss` (throws on `rejected`), so nothing
  outside the pipeline changes.

### 3.7 Tests (`test/gloss.test.ts`; fixtures `test/fixtures/nova/gloss-v3-*.json`)

- `it('marks the first whole-word occurrence of the target in the line with [[…]] and joins line breaks')`
- `it('sends {line, word, lemma} with the marked line, toolChoice explain_word and the v3 tool schema (sense first, example last)')`
- `it('GLOSS_PROMPT_VERSION must be bumped when the system prompt or the tool schema changes (sha256 snapshot of both)')`
- `it('the en and de prompts carry their own FORMS and EXAMPLES blocks and no few-shot word from the English gold set')`
- `it('caches the card, not the rendered gloss: a renderer change re-renders a cached card without a Bedrock call')`
- `it('returns status rejected (not a throw) after two rejected answers, with the issues and the last output')`
- `it('returns status soft when the retry answer has only soft issues, and logs a WARNING')`
- `it('a hint changes the cache key and is sent as a second user text block')`
- `it('drops empty-string optional fields before parsing (Nova returns "" for unused fields)')`
- `test/grammar.test.ts`: `it('renders each pos template for en→de and de→en exactly as the table in LING-002-gate-c §3.4')`,
  `it('never renders a comparative for a noun: pruneCard removes fields that do not belong to the pos')`,
  `it('every rendered note passes the Gloss schema (≤ 14 words, ≤ 90 chars) for the longest forms in the fixtures')`,
  `it('cardToGloss joins two glosses with ", " and the result passes the Gloss schema')`.

## 4. P3: card validators (`packages/contracts/src/glossCard.ts`)

```ts
export interface CardContext { word: string; lemma: string; cue: string; nativeCue?: string; lang: Lang; native: string }
/** [] = acceptable. Each string names the rule id first ("G-LEN: …") and is fed back to the model on the retry. */
export function glossCardIssues(c: GlossCard, ctx: CardContext): string[]
export function isSoftCardIssue(issue: string): boolean   // X-USES and every F-*-de rule
```
Helpers (pure, exported for tests): `contentWords(s, native)` (lowercase words after removing a parenthesised clarifier, and the
`FUNCTION_WORDS[native]` list: articles, `sich`, `zu`, `to`, `be`, `und`, `and`, `oder`, `or`, `etwas`, `something`, `someone`, `jemand`),
`sameStem(a, b)` (lowercase; both ≥ 4 letters; one is a prefix of the other, or their common prefix is ≥ 4 letters and ≥ the shorter
length − 1: `kommende`/`kommender`, `toll`/`tolle`, `mehr`/`mehr`), `stopwordScore(s, lang)` (number of words of `s` in `STOPWORDS[lang]`).

| id | hard/soft | rule | catches |
|---|---|---|---|
| G-COPY | hard | a gloss equals the word or lemma (case-insensitive) without a parenthesised clarifier | (v2 rule, kept) |
| G-LEN | hard | single-token target (no space; hyphen allowed): each gloss has ≤ 2 content words; all glosses together ≤ 6 words and ≤ 60 chars | "jemand der Müll sammelt", "Kosten, nicht viel" (2nd gloss 2 content words → see G-NEIGHBOUR), long phrases |
| G-SOURCE | hard | a gloss contains, as a whole word outside the parentheses, a word of the cue (≥ 3 letters) other than the word/lemma | target-language words copied from the line |
| G-NEIGHBOUR | hard (only when `nativeCue` is given) | a gloss with ≥ 2 content words has a content word that is `sameStem` with a word of the native line, and the whole gloss is not a contiguous part of the native line | "mehr Heftklammern" (native "Hast du mehr Tipps?"), "kommende Aktivitäten" ("Liste kommender Aktivitäten."), "nicht viel" ("Nicht viel Arrangement"), "tolle Frau" ("Nun, Kay ist toll.") |
| X-LANG | hard (en/de only) | `stopwordScore(example, native) > stopwordScore(example, lang)`, or the example has ≥ 3 words and no target stopword | "Ich spiele Tennis mit meinem Freund." (de: ich, mit, meinem; en: 0) |
| X-CUE | hard | the example equals the cue (v2 rule, kept) | |
| X-USES | soft | the example contains neither the word nor the lemma (v2 rule, kept) | |
| F-PLURAL-en | hard | noun, `plural ≠ "none"`: one token of letters/hyphen/apostrophe and in `englishPlurals(lemma)` = {lemma+s, +es, y→ies, f/fe→ves, irregular table, lemma itself for invariant nouns}; and when `word ≠ lemma` (the line has the plural), `plural = word` | "refreshment", "weenie roasts", "tennisschläger" |
| F-COMP-en | hard | adjective, `comparative ≠ "none"`: in `englishComparatives(lemma)` = {lemma+er, +r, y→ier, doubled consonant+er, "more "+lemma, irregular table good/well→better, bad/ill→worse, far→farther/further, little→less, many/much→more} | "besser" for swell |
| F-VERB-en | hard | verb: `past` and `participle` each in `englishVerbForms(lemma)` = regular (+ed, +d, y→ied, doubled consonant+ed) ∪ the irregular table | invented or German forms |
| F-ART-de | soft | German noun without `article` | |
| F-PLURAL-de | soft | German noun plural (≠ "none") is one token starting with the lemma's first 3 letters (ä/ö/ü ≡ a/o/u) | |
| F-COMP-de | soft | German adjective comparative ends in `er` and starts with the lemma stem (umlaut-tolerant), or gut→besser, viel→mehr, gern→lieber, hoch→höher, nah→näher | |
| F-VERB-de | soft | participle starts with `hat ` or `ist `, and its last token contains `ge`, ends in `iert`, or starts with be/emp/ent/er/miss/ver/zer | |

German form rules are soft because German morphology has too many exceptions for a short rule; they still trigger the one retry.
`packages/contracts/src/lexicon.ts` (new) holds the English irregular verbs (about 180 base/past/participle triples, typed as a `const`;
source: any public-domain list, e.g. Wiktionary's *Appendix:English irregular verbs*, CC BY-SA → write the triples by hand, no copy), the
irregular plurals (child, man, woman, person, foot, tooth, goose, mouse, ox, life, knife, wife, leaf, half, wolf, shelf, thief, calf),
invariant nouns (sheep, deer, fish, series, species, aircraft, means), the irregular comparatives above, and `STOPWORDS.en` / `STOPWORDS.de`
(40 each, with the words shared by both languages removed: in, an, so, was, die, war, man, will, also, hat, bad, fast, rest, gift).

Tests (`packages/contracts/test/glossCard.test.ts`), one `it` per row plus the passing case:
- `it('G-LEN rejects "jemand der Müll sammelt" for a single-word target and accepts "Altwarensammler" and "sich kennenlernen"')`
- `it('G-NEIGHBOUR rejects "mehr Heftklammern" when the native line is "Hast du mehr Tipps?" and accepts "Reißzwecken"')`
- `it('G-NEIGHBOUR rejects "kommende Aktivitäten" against "Liste kommender Aktivitäten." and accepts "Aktivitäten"')`
- `it('G-NEIGHBOUR is skipped when no native line is given')`
- `it('G-SOURCE rejects a gloss that repeats another word of the cue')`
- `it('X-LANG rejects a German example for an English target and accepts "I need my racket for tennis."')`
- `it('F-PLURAL-en rejects "refreshment" for refreshments, "weenie roasts" for roast, and accepts "tacks", "activities", "old-timers", "none" for tennis')`
- `it('F-COMP-en rejects "besser" for swell and accepts "sweller", "more swell", "better" for good')`
- `it('F-VERB-en accepts supervised/supervised and went/gone and rejects "superviste"')`
- `it('German form rules are soft issues')`
- `it('pruneCard removes a comparative from a noun card before validation')`

## 5. P4: clip-level glossing (`packages/pipeline/src/ai/glossClip.ts`)

```ts
export interface ClipGlossItem { cueIndex: number; word: string; lemma: string; rank: number; cue: string; nativeCue?: string }
export type ClipGlossResult = ClipGlossItem & ({ status: 'ok' | 'soft'; card: GlossCard; gloss: Gloss } | { status: 'rejected' | 'conflict'; issues: string[]; card?: GlossCard })
export async function glossClip(ai: Pick<Ai, 'gloss'>, items: ClipGlossItem[], lang: Lang, native: string, level: Level, log: (m: string) => void): Promise<ClipGlossResult[]>
```
1. Gloss every item (sequential, as today).
2. `siblingConflicts(results)` (contracts, pure): two accepted items **in the same cue** with different lemmas conflict when a gloss of one
   equals a gloss of the other after `normGloss` (lowercase, parentheses removed, articles removed), or one is a compound that contains the
   other's whole content word (`tennisschläger` ⊃ `schläger`) — the second form only when the contained word has ≥ 5 letters.
3. Each conflicting item is asked once more with `hint`: `Another word of this line, "racket", was glossed "Tennisschläger". Gloss only
   [[tennis]]; if "Tennisschläger" translates "racket", do not use it.` (one extra call per item; cached by hint).
4. Re-run `siblingConflicts`; an item still in conflict gets `status: 'conflict'`.
5. Log one line per non-ok item: `gloss: <status> "<word>" (cue <i>): <issues>`.

Callers:
- `prepare.ts` uses `glossClip` instead of its loop. Only `ok` and `soft` items become `clip.highlights` (with `gloss/grammar/example`);
  `rejected` and `conflict` items are left out with a warning `gloss: dropped highlight "<word>" (cue <i>): <status> <issues>`. A wrong
  explanation on screen is worse than one highlight fewer (0009 decision 6). prepare no longer fails on `AiSchemaError`.
- `spotCheck.ts` uses `glossClip` (§7).

Tests (`test/glossClip.test.ts`, injected fake `gloss`):
- `it('re-asks both words of one cue that got the same gloss (tennis/racket → Tennisschläger) once, with a hint naming the other word')`
- `it('marks an item conflict when the re-ask still overlaps, and does not re-ask a third time')`
- `it('does not treat the same gloss in two different cues as a conflict')`
- `it('prepare leaves rejected and conflict items out of clip.highlights and writes one warning each')`
- `it('prepare no longer throws when one gloss is rejected twice')`

## 6. P5: quiz

Changes (`packages/contracts/src/ai.ts`, `packages/pipeline/src/ai/quiz.ts`):
- **Eligibility.** `QuizCueInput.highlights` gets `{ word, lemma, pos, gloss }` where `gloss = card.gloss[0]` (the first headword: shorter,
  cleaner options). Only `status: 'ok'` items enter the quiz: `soft`, `rejected` and `conflict` never do (in prepare and in the spot check).
- `QuizHighlight` gains `lemma` and `pos`; `flattenHighlights` dedupes by **lemma** (not word) so two forms of one lemma never meet.
- `QUIZ_PROMPT_VERSION = 2`: the payload adds `pos` per highlight; the prompt's "prefer the same part of speech" can now use it. No other
  prompt change.
- `quizPlanIssues` new rules (also honoured by `fallbackPlan`):
  - meaning: no distractor gloss is `sameStem` with, contains, or is contained in the answer gloss (`Schläger` vs `Tennisschläger`);
  - cloze: no distractor word has the same lemma as the answer or Levenshtein ≤ 1 to it (`sale` vs `sal`, `racket` vs `rackets`);
  - cloze: no distractor word occurs elsewhere in the same cue (`Or a ____ roast.` must not offer `roast`).
- `buildQuizItems` asserts `options[answer] === H[highlightId][field]` (an internal invariant; a violation throws, caught by `onDrop`).

Tests (`test/quiz.test.ts`):
- `it('the answer of every meaning item is the gloss of its own highlight (invariant), never a sibling gloss')`
- `it('only status ok highlights reach the quiz: soft, rejected and conflict items are left out')`
- `it('uses the first gloss headword as the option text')`
- `it('flattenHighlights dedupes by lemma')`
- `it('quizPlanIssues rejects a cloze distractor at edit distance 1 or with the same lemma as the answer (sal/sale)')`
- `it('quizPlanIssues rejects a cloze distractor that already appears in the cue (Or a ____ roast. / roast)')`
- `it('quizPlanIssues rejects a meaning distractor whose gloss contains the answer gloss (Schläger / Tennisschläger)')`
- `it('fallbackPlan honours the new distractor rules')`
- `it('QUIZ_PROMPT_VERSION must be bumped when the system prompt changes (sha256 snapshot)')` (updated snapshot)

## 7. P6: spot-check sheet and CLI

- `runSpotCheck` calls `glossClip` for the candidates. **Rows = every clip highlight (after §2) and, while fewer than `perClip`, the
  widened candidates.** `perClip` becomes a minimum, not a cut: every gloss the quiz uses is on the sheet (F8). The header says
  `19 glosses (19 highlights + 0 widened)`.
- New columns: `status` (ok / soft / rejected / conflict) and `sense` (the model's definition, so the reviewer sees the sense it chose).
  The `grammar` column shows the rendered note; spot-check.json also stores the raw card.
- The quiz is built from the `ok` clip-highlight rows only, exactly as prepare does (one helper `quizInput(cues, results, native)` shared
  by both).
- `SpotCheckResult` gains `markdown: string` (the section just rendered). `cli.ts` prints `r.markdown`, never the file (F9). New flag
  `--no-echo` prints only the summary line (for the German clip, so no row reaches a terminal log; 0009 decision 8).
- §8.5 of LING-002 changes: the 30-item count becomes "every row of both sheets"; accept at ≥ 90 % of rows (rounded up). For the current
  clips that is about 19 en + 15–20 de rows. Human decision H2 (§12).

Tests (`test/spotCheck.test.ts`):
- `it('the sheet has a row for every clip highlight even when --per-clip is smaller, and every quiz gloss appears on the sheet')`
  (replaces `'--per-clip 3 limits the rows and the quiz still uses every clip highlight'`)
- `it('widens to --per-clip rows when the clip has fewer highlights')` (existing behaviour, renamed)
- `it('writes status and sense columns and the raw card into spot-check.json')`
- `it('leaves soft, rejected and conflict rows out of the quiz input')` (replaces the REJECTED-only test)
- `it('returns only the new section in result.markdown; with --append the earlier sections stay in the file but are not returned')`
- `test/cli.test.ts` (or the existing CLI test): `it('spot-check prints only the new section, and only the summary line with --no-echo')`

## 8. P7: models, prices, reasoning

### 8.1 Availability (checked 2026-10-02, `aws bedrock list-foundation-models --region us-east-1 --by-provider amazon`, read only)

| model | id to call | us-east-1 | on-demand access |
|---|---|---|---|
| Nova Micro | `us.amazon.nova-micro-v1:0` | ACTIVE | ON_DEMAND + us. profile |
| Nova Lite v1 (today) | `us.amazon.nova-lite-v1:0` | ACTIVE | ON_DEMAND + us. profile |
| Nova Pro v1 | `us.amazon.nova-pro-v1:0` | ACTIVE | ON_DEMAND + us. profile |
| Nova 2 Lite | `us.amazon.nova-2-lite-v1:0` (or `global.`) | ACTIVE | **INFERENCE_PROFILE only** |
| Nova Premier | `us.amazon.nova-premier-v1:0` | profile listed | us. profile |

Nova 2 Pro is not listed in us-east-1 (third-party price pages mention a preview); not considered.

### 8.2 Prices (USD per 1M tokens, on demand, US East)

| model | input | output | source |
|---|---|---|---|
| Nova Lite v1 | 0.06 | 0.24 | already in `cost.ts` (unverified, LING-002 §12 L1) |
| Nova Pro v1 | 0.80 | 3.20 | third-party summary (cloudroutehq, reviewed 2026-05-30) |
| Nova Premier | 2.50 | 12.50 | same |
| Nova 2 Lite | 0.30 | 2.50 | third-party summaries (futureagi, pricepertoken) |

The official page (https://aws.amazon.com/bedrock/pricing/) renders its Nova table with JavaScript and could not be read by the fetch
tool. **All four figures stay marked "unverified" until a human reads that page** (H4). Extended-thinking tokens are billed as output
tokens (https://docs.aws.amazon.com/nova/latest/nova2-userguide/extended-thinking.html).

### 8.3 Cost estimate per clip (v3 prompt)

Assumptions: system prompt with few-shot ≈ 900 tokens + payload 60 = 960 input per gloss call, 130 output; 20 highlights × 1.2 calls
(retries + sibling re-asks) = 24 gloss calls; one quiz call 1 500 in / 400 out.

| model | per clip | 12-clip catalogue (LING-008) | vs today |
|---|---|---|---|
| Nova Lite v1 | ≈ $0.0023 | ≈ $0.03 | 1× |
| Nova 2 Lite, reasoning off | ≈ $0.016 | ≈ $0.19 | ≈ 7× |
| Nova 2 Lite, reasoning low (+≈ 300 output tokens per call) | ≈ $0.034 | ≈ $0.41 | ≈ 15× |
| Nova Pro v1 | ≈ $0.031 | ≈ $0.37 | ≈ 13× |
| Nova Premier | ≈ $0.11 | ≈ $1.27 | ≈ 46× |

Every option is cents per clip. The eval matrix (§9, 4 configurations × 20 gold items + quiz) costs about $0.15 in total.

### 8.4 Recommendation (0009 decision 2)

Default to **Nova 2 Lite with reasoning off** (`us.amazon.nova-2-lite-v1:0`), *provided the eval (§9) confirms it*: it is the current
generation (Lite v1 is past the "EOL no sooner than Dec 05, 2025" floor of its model card, so it can be retired with notice), and its cost
is still ≈ $0.02 per clip. Order of fallbacks if it misses the eval bar: Nova 2 Lite reasoning low → Nova Pro v1 → Nova Premier.
The model is not what fixes F1, F2, F3, F5, F6, F8, F9 (code and prompt do); it mainly matters for F4 (sense) and for how often the
validators have to retry. A stronger model is not a substitute for the validators.

### 8.5 Code

- `ai/cost.ts`: `MODEL_PRICES: Record<string, Prices & { verified: boolean }>` keyed by the id without its geo prefix (`amazon.nova-lite-v1:0`,
  `amazon.nova-2-lite-v1:0`, `amazon.nova-pro-v1:0`, `amazon.nova-premier-v1:0`). `pricesFor(modelId)` strips `us.|eu.|global.|apac.`;
  unknown id → `createAi` throws unless `opts.prices` is given. `AI_MODEL_ID_DEFAULT = 'us.amazon.nova-2-lite-v1:0'` *only after* the eval
  confirms it; until then keep Lite v1 as default. Env: `LINGO_AI_MODEL` (new), `NOVA_LITE_MODEL_ID` still read as a fallback.
- `AiOptions.reasoning?: 'off' | 'low' | 'medium'` (env `LINGO_AI_REASONING`, default off). When not off, `askWithRetry` sends
  `additionalModelRequestFields: { reasoningConfig: { type: 'enabled', maxReasoningEffort } }`, gloss `maxTokens` 2 000, and the
  reasoning level joins both cache identities. `high` is not offered (it forbids temperature and maxTokens). Only Nova 2 Lite supports it;
  `createAi` throws for another model with reasoning on.
- `toolUseInput` must skip `reasoningContent` blocks (it looks for the `toolUse` block already; add a test).
- If Converse rejects a forced `toolChoice: { tool }` together with reasoning (not stated either way in the Nova 2 docs), use
  `toolChoice: { any: {} }` (one tool, so equivalent) when reasoning is on.
- `infra/lib/media-stack.ts`: a `us.` cross-Region profile routes to us-east-1, us-east-2 and us-west-2, and the IAM policy must allow the
  foundation model in every destination Region (https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html).
  Change the foundation-model resource to `arn:aws:bedrock:*::foundation-model/amazon.nova-*`. This already applies to today's
  `us.amazon.nova-lite-v1:0`; local runs use the developer's credentials, so it only bites the deployed role.
- Docs: `docs/aws.md` model and price lines.

Tests (`test/ai-cost.test.ts`, `test/ai-client.test.ts`, `test/gloss.test.ts`):
- `it('pricesFor strips the geo prefix and knows Lite v1, 2 Lite, Pro and Premier')`
- `it('createAi throws for a model without a price unless prices are passed')`
- `it('reasoning low sends reasoningConfig in additionalModelRequestFields and raises gloss maxTokens to 2000')`
- `it('reasoning is part of the cache key')`
- `it('createAi throws when reasoning is on for a model other than Nova 2 Lite')`
- `it('toolUseInput ignores reasoningContent blocks before the toolUse block')`

## 9. P8: evaluation loop (no human in the loop until the final gate)

### 9.1 Location and format

- Gold sets: `packages/pipeline/eval/gold/<src>-<native>.<slug>.json`, committed. First file:
  `eval/gold/en-de.what-to-do-on-a-date-1950.json`. The clip is a 1950 educational film (content register lists it as public domain;
  the implementer confirms against docs/content.md before committing cue text).
- Output: `packages/pipeline/work/eval/<goldname>.<model>.<config>.json` (gitignored `work/`).

```ts
// packages/pipeline/src/eval/gold.ts
export const GoldItem = z.object({
  id: z.string(),                  // "c9-racket"
  cueIndex: z.number().int(), cue: z.string(), nativeCue: z.string().optional(),
  word: z.string(), lemma: z.string(),
  expect: z.union([
    z.object({ excluded: z.literal(true), why: z.string() }),           // must not be a highlight at all
    z.object({
      sense: z.string(),                                                 // for the human reading the report
      pos: z.array(POS).min(1),                                          // any of these
      accept: z.array(z.string()).min(1),                                // gloss headwords, normalised (lowercase, no article, no parentheses)
      reject: z.array(z.string()).default([]),                           // known wrong senses / neighbour copies
      plural: z.array(z.string()).optional(), comparative: z.array(z.string()).optional(),
      past: z.array(z.string()).optional(), participle: z.array(z.string()).optional(),
      ambiguous: z.boolean().default(false),                             // scored, but listed separately
    }),
  ]),
})
export const GoldSet = z.object({ slug: z.string(), lang: Lang, native: z.string(), level: Level, items: z.array(GoldItem) })
```

### 9.2 Scorer (pure, `packages/pipeline/src/eval/score.ts`)

Per non-excluded item, with `normGloss` from §5:

| id | check |
|---|---|
| S-SENSE | some gloss of the card is in `accept` and no gloss is in `reject` |
| S-POS | `card.pos ∈ expect.pos` |
| S-FORMS | each of plural/comparative/past/participle that the gold gives is matched (case-insensitive) by the card |
| S-VALID | `glossCardIssues` is empty on the final card (soft issues allowed), status `ok` |
| S-FIRST | accepted on the first attempt (from the log/ledger; reported, not part of the pass) |
| S-LANG | X-LANG passes |

Item pass = S-SENSE ∧ S-POS ∧ S-FORMS ∧ S-VALID ∧ S-LANG. Excluded items: pass when the item is not among the clip highlights after §2
(scored through `asrSuspects`/confidence on the gold cues; the gold file carries the `asr` value for `sal`: 0.158).
Quiz (when `--quiz`): build the quiz from the `ok` cards through the real `ai.quiz`, then check automatically: the answer invariant,
4 distinct options, no near-spelling/same-lemma cloze distractor, no distractor gloss containing the answer gloss, every option gloss
belongs to an S-SENSE-passing card. Q2 "plausible" stays human.

```ts
export interface ItemScore { id: string; pass: boolean; checks: Record<'S-SENSE'|'S-POS'|'S-FORMS'|'S-VALID'|'S-FIRST'|'S-LANG', boolean>; gloss: string; sense: string; note?: string }
export function scoreItem(g: GoldItem, r: ClipGlossResult | undefined): ItemScore
export function scoreSet(gold: GoldSet, results: ClipGlossResult[], quiz?: PreparedQuizItem[]): { items: ItemScore[]; passed: number; total: number; ambiguousFails: string[]; quizChecks?: Record<string, boolean>; usd: number }
```

### 9.3 Command

```
AWS_PROFILE=… pnpm --filter @lingo/pipeline eval:gloss --gold eval/gold/en-de.what-to-do-on-a-date-1950.json \
  --model us.amazon.nova-2-lite-v1:0 [--reasoning low] [--quiz] [--no-cache]
```
`package.json` script `"eval:gloss": "tsx scripts/eval-gloss.ts"`. The script builds `ClipGlossItem`s from the gold (cue, nativeCue,
word, lemma), runs `glossClip` with `createAi({ model, reasoning, cacheDir: 'data/.cache/ai-eval' })` (re-runs are free), scores, writes the
JSON report, and prints one table row per item (id, pass, failed checks, gloss) plus the summary line
`eval en-de.what-to-do-on-a-date-1950 · us.amazon.nova-2-lite-v1:0 · v3 · 18/19 · quiz 10/10 auto · $0.0170`. Exit code 0 always (it is
a measurement, not a gate). It only ever runs on gold files, never on the German clip.

### 9.4 Bar before the human gate

On the English gold set: ≥ 18 of 19 scored items pass, zero `reject` hits, `sal` excluded, every quiz auto-check true. Only then re-run
the real spot check (§10) for human scoring. The eval is a filter; the human scoring remains the gate (0009 decision 7).

### 9.5 English gold set (write this file verbatim; `nativeCue` copied from clip.json `cues[i].native.de`)

Senses were judged from the surrounding cues (cue 65: "No amount of stuff could make this thing look any older. Boy," → 66 is about an old
object; cue 110 → 111 "Hey, you loafer." is addressed to a boy).

| id | cue (index) | word / lemma | pos | sense | accept | reject | forms |
|---|---|---|---|---|---|---|---|
| c9-tennis | I'll get my tennis racket. (9) | tennis | noun | the ball game | tennis | tennisschläger, schläger | plural: none |
| c9-racket | (9) | racket | noun | bat with strings used in tennis | schläger, tennisschläger | lärm, krach, betrug, schwindel, gaunerei | plural: rackets |
| c12-sale | on Friday to fix up that scavenger sale? (12) | sale | noun | event at which collected things are sold | verkauf, basar, flohmarkt, trödelmarkt, wohltätigkeitsbasar, trödelverkauf | angebot, rabatt, schlussverkauf, ausverkauf, sonderangebot | plural: sales |
| c12-scavenger | (12) | scavenger | noun | person who collects discarded things (here attributive: a sale of collected items) — ambiguous | altwarensammler, lumpensammler, trödelsammler, sammler, schrottsammler, trödler, plünderer | aasfresser | plural: scavengers |
| c22-swell | Well, Kay's a swell girl. (22) | swell | adjective | (dated, informal) excellent, very nice | toll, prima, klasse, super, großartig, spitze, nett, famos | anschwellen, schwellen, welle, dünung, frau, eine tolle frau | comparative: sweller, more swell |
| c25-wagon | Good picture, wagon train. (25) | wagon | noun | horse-drawn vehicle (as in a western's wagon train) | wagen, planwagen, pferdewagen, fuhrwerk, treckwagen | waggon, eisenbahnwagen, güterwagen, kombi | plural: wagons |
| c42-sal | the scavenger sal. (42) | sal | – | **excluded**: ASR error for "sale" (confidence 0.158) | – | – | – |
| c66-old-timer | that is an old-timer. (66) | old-timer | noun | something very old (here an old object) — ambiguous | altes ding, uraltes ding, altes stück, uraltes stück, oldtimer, antiquität, altertümchen, alter schinken | erfahrener mensch, veteran, alter hase, alter mann | plural: old-timers |
| c78-refreshments | …helping with refreshments for the game? (78) | refreshments / refreshment | noun | light food and drinks | erfrischungen, erfrischung, snacks, imbiss, verpflegung, getränke und snacks, snacks und getränke | | plural: refreshments |
| c81-tacks | Got any more tacks? (81) | tacks / tack | noun | short pin for fixing paper to a board | reißzwecken, reißzwecke, reißnägel, reißnagel, heftzwecken, heftzwecke, pinnnadeln, pinnnadel, stifte | heftklammern, tipps, mehr heftklammern, nägel | plural: tacks |
| c87-activities | A list of coming activities. (87) | activities / activity | noun | things people do for fun | aktivitäten, aktivität, unternehmungen, veranstaltungen, freizeitaktivitäten | kommende aktivitäten | plural: activities |
| c90-acquainted | …with a group, to get acquainted. (90) | acquainted / acquaint | verb, adjective | (get acquainted) to get to know each other | kennenlernen, sich kennenlernen, bekannt, miteinander bekannt, vertraut, bekannt werden | mit etwas vertraut machen | past/participle: acquainted |
| c93-roast | Or a weenie roast. (93) | roast | noun | outdoor party where food is cooked over a fire | grillfest, grillparty, grillabend, lagerfeuer, grillen, cookout | braten, rösten, wurstbraten | plural: roasts |
| c93-weenie | (93) | weenie | noun | (informal) a hot-dog sausage | würstchen, wiener, wiener würstchen, würstel, hotdog-würstchen, bockwurst | | plural: weenies |
| c95-expense | Not much arranging needed, not much expense, (95) | expense | noun | money spent | kosten, ausgaben, aufwand, ausgabe | nicht viel | plural: expenses |
| c98-baseball | …go to a baseball game. (98) | baseball | noun | the ball game | baseball | baseballspiel, baseball-spiel | plural: none |
| c99-comfortably | …one you can carry through comfortably. (99) | comfortably | adverb | easily, without strain | bequem, gemütlich, mühelos, problemlos, entspannt, ohne mühe, gut | | – |
| c101-inexpensive | inexpensive dates, most of them. (101) | inexpensive | adjective | not costing much | preiswert, günstig, billig, preisgünstig, kostengünstig | teuer | comparative: more inexpensive |
| c111-loafer | you loafer. What are you doing (111) | loafer | noun | a lazy person (addressed to a boy) | faulenzer, faulpelz, nichtstuer, drückeberger, tagedieb, müßiggänger | halbschuh, slipper, mokassin, faulenzerin | plural: loafers |
| c115-supervise | As soon as Kay isn't around to supervise, (115) | supervise | verb | to watch over and direct | beaufsichtigen, überwachen, aufpassen, kontrollieren, aufsicht führen | | past/participle: supervised |

Notes for the gold file: `baseball`'s accept `baseball` matches only through the clarifier rule (G-COPY forces "Baseball (Sport)"; `normGloss`
strips the parentheses). `tennis` likewise. 19 scored items, 2 ambiguous (scavenger, old-timer).

### 9.6 German gold set

Not written by this planner (content rule). A human, or an agent allowed to read that clip, writes `eval/gold/de-en.terra-x-friedlaender.json`
in the same format before the final Gate C run, or Gate C relies on human scoring alone for the German rows (H5).

### 9.7 Tests (`test/eval-score.test.ts`, offline)

- `it('GoldSet parses the committed English gold file and it has 19 scored items and one excluded item')`
- `it('scoreItem passes a card whose gloss matches accept after normalisation (article and parentheses removed)')`
- `it('scoreItem fails S-SENSE when any gloss hits reject, even if another gloss is accepted ("Verkauf, Angebot")')`
- `it('scoreItem fails S-FORMS for plural "refreshment" and S-POS for a verb card on a noun item')`
- `it('an excluded item passes only when the word is not a highlight after the ASR filter')`
- `it('scoreSet replays the 2026-10-02 Nova Lite v1 outputs (fixture) and scores at most 8 of 19')` — the old run is the known-bad
  baseline; the fixture is built from `spot-check.json` of the English clip (English rows only).

## 10. Run order after the code lands

1. `pnpm -r test`, `pnpm -r typecheck` (AWS variables unset).
2. English clip re-prepare, no Transcribe: `pnpm --filter @lingo/pipeline cli prepare --clip what-to-do-on-a-date-1950 … --cues
   work/what-to-do-on-a-date-1950/en.corrected.vtt --reuse --no-ai --no-publish` → check the `asr: skipped highlight "sal"` warning.
3. Eval matrix on the English gold set (≈ $0.15): Nova Lite v1; Nova 2 Lite off; Nova 2 Lite low; Nova Pro v1. Iterate the prompt
   (bump `GLOSS_PROMPT_VERSION` each time) until one configuration meets §9.4. At most two prompt iterations per model before escalating
   (ORCHESTRATOR §3.4).
4. Set the default model and prices (§8.5), record the matrix in 0009 (results table) and docs/aws.md.
5. Real spot check on both clips with the chosen model, German clip with `--no-echo`, into `docs/spot-checks/<date>-gate-c-v3.md`.
6. Human scores per LING-002 §8.3–8.5 (as amended by §7 and H2); result into docs/decisions/0001-week0-gates.md (Gate C).

## 11. Risks

| Risk | Mitigation |
|---|---|
| Confidence floor 0.4 drops a real rare word somewhere | Every drop is a warning with the confidence; floor is one constant; 0.4 is below the lowest real word seen (0.519) |
| Near-spelling rule flags a real pair (`sail`/`sale` after the same word) | Needs the one-off to be rarer than its twin *and* share the preceding word; logged; the spot check shows it |
| G-NEIGHBOUR false positive (a good two-word gloss sharing a stem with the native line) | Only fires on ≥ 2 content words; the retry usually yields a one-word headword; a second failure drops the highlight (logged), never shows a bad gloss |
| Translate's native line is itself wrong ("Tipps" for tacks, "Oldtimer") | Used only for G-NEIGHBOUR overlap, never as a reference meaning and never sent to the model |
| Structured forms over-reject English irregulars missing from the table | Table of ≈ 180 verbs; eval S-VALID shows misses; add to `lexicon.ts` |
| Few-shot examples bias the glosses (e.g. always one word) | Examples include a two-gloss and a phrasal-verb case; eval measures |
| Nova v1 rejects `enum` in the tool schema | Fall back to plain strings + Zod enums (§3.2) |
| Forced tool choice not allowed with reasoning | `toolChoice: any` when reasoning is on (§8.5) |
| Nova 2 Lite needs IAM for three Regions | `infra` change in §8.5 |
| Prices unverified | Marked unverified in `cost.ts`, docs/aws.md; H4 |
| Gate C rule change (every row scored) looks like moving the goalposts | It is stricter (more rows, the quiz glosses included); H2 lets the human choose |
| German rows have no gold set | H5; human scoring still covers them |

## 12. For the human (cannot be decided by an agent)

- **H1 Model.** Approve Nova 2 Lite (≈ $0.02/clip) as the default if the eval confirms it, and the fallback order (2 Lite reasoning low →
  Pro v1 → Premier). All are cents per clip.
- **H2 Gate C counting.** Score every row of both sheets (all highlights, so every quiz gloss) and accept at ≥ 90 % of rows, instead of
  "15 per clip, ≥ 27/30".
- **H3 Drop policy.** A highlight whose gloss is rejected twice or stays in conflict is removed from the clip (warning), rather than shown
  with a weak explanation.
- **H4 Prices.** Read the Amazon Nova table on https://aws.amazon.com/bedrock/pricing/ and confirm or correct §8.2.
- **H5 German gold set.** Who writes `de-en.terra-x-friedlaender.json`, given the content rule, or accept human-only scoring for the de rows.
- **H6 Ambiguous senses.** Confirm the two ambiguous gold senses: `old-timer` = an old object (not a person) and `scavenger` in
  "scavenger sale" (rummage sale of collected items).

### Answers (orchestrator, 2026-10-03)

- H1: build the model table; Nova Lite v1 stays the default until the eval proves Nova 2 Lite; the fallback order is approved.
- H2: Gate C scores every sheet row and passes at ≥ 90 % (docs/decisions/0001 and LING-002 §8.5 updated).
- H3: drop unfixable highlights with a warning (implemented: rejected and conflict items are left out of clip.highlights).
- H4: prices stay marked unverified (`MODEL_PRICES` all `verified: false`).
- H5: there is no German gold set; the German rows rely on human scoring.
- H6: `old-timer` and `scavenger` (sale) are marked "needs human confirmation" in the gold set.

## 13. Doc URLs (cite in the PR)

- Nova tool use (tool choice tool/any/auto, best practices: enums, ≤ 2 nesting levels, long strings last, constrained decoding):
  https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-tools.html and https://docs.aws.amazon.com/nova/latest/userguide/tool-use-definition.html
- Nova 2 extended thinking (`reasoningConfig` in `additionalModelRequestFields`, off by default, `high` forbids temperature/topP/maxTokens,
  reasoning billed as output tokens, `reasoningContent` blocks): https://docs.aws.amazon.com/nova/latest/nova2-userguide/extended-thinking.html
- Nova 2 with Converse: https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-converse-api.html
- Nova 2 request/response schema: https://docs.aws.amazon.com/nova/latest/nova2-userguide/request-response-schema.html
- Nova Lite v1 model card (lifecycle): https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-lite.html
- Converse API reference (`additionalModelRequestFields`, `toolConfig`, `usage`): https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html
- Inference profiles: supported Regions https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html,
  IAM prerequisites https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html
- Bedrock pricing (to verify, H4): https://aws.amazon.com/bedrock/pricing/
- Amazon Transcribe output (item `confidence`): https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html#how-it-works-output
