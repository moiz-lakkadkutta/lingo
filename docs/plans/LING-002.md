# LING-002 — Explanations + quiz generation (Nova Lite, Zod-validated JSON), caching, spot check 30

Status: plan (Fable, 2026-10-01). Implementer: Opus. Reviewer: Fable.
Base: the uncommitted LING-001 tree on `feat/ling-001-pipeline` (`packages/pipeline/**`, `packages/contracts/src/{base,prepared}.ts`).

## 0. Decisions this plan makes (so the implementer does not have to)

1. **Forced tool use, not `outputConfig`.** Nova Lite's model card lists *Structured outputs* under "Not Supported", while *Client-side tool calling* is supported. The Nova user guide names tool use with `toolChoice: { tool: { name } }` as the way to force a schema. So every call sends one `toolSpec` and `toolChoice.tool`; the JSON arrives as `output.message.content[i].toolUse.input` (already an object, no `JSON.parse`). Zod validates it afterwards; the tool schema is only a nudge. Nova's `inputSchema` top level may contain only `type`, `properties`, `required` — no `additionalProperties`, `enum`, `maxLength`, `strict`.
2. **The quiz is built by code, planned by the model.** Nova only *chooses* which highlights become items and which other highlights serve as distractors (by id). Prompt text, options, the answer index and `cueIndex` are computed deterministically from the clip's own highlights. "Exactly one correct answer" therefore holds by construction and the answer index can never be off by one. Options are shuffled with a seeded PRNG so `clip.json` is reproducible.
3. **Gloss failure fails the clip; quiz failure falls back.** After the schema retry a bad gloss throws (`AiSchemaError`) — the cache makes the rerun cost only that one word. A failed quiz plan falls back to a deterministic builder (first M/C highlights, cyclic distractors) with a loud log line; a clip with < 4 distinct highlighted words gets `quiz: []` and no Bedrock call.
4. **Model id default `us.amazon.nova-lite-v1:0`** (US geo inference profile; us-east-1 is both in-region and a profile source). Overridable by `NOVA_LITE_MODEL_ID`; region by `BEDROCK_REGION` (default `us-east-1`). The IAM policy in `infra/lib/media-stack.ts` already allows `inference-profile/*`.
5. **Greedy decoding:** `inferenceConfig.temperature = 0` exactly as in the Nova tool-use doc sample. Because greedy retries of the same prompt reproduce the same failure, the schema retry *changes the prompt* (appends the validation issues and the rejected answer).
6. **Cache = files under `packages/pipeline/data/.cache/ai/`** (already gitignored via `packages/pipeline/data/.cache/`), key = sha256 of the canonical request identity (kind, prompt version, model, lang, native, level, lemma, normalised cue). Env `LINGO_AI_CACHE_DIR` overrides.
7. **Cost ledger per `prepare()` run**, attached to `clip.json.cost` (the `PreparedCost` block LING-001 reserved for this). Prices are constants in code with the doc URL and the date they were read.
8. **No feedback copy is generated.** Quiz items carry only `kind, prompt, options, answer, cueIndex`; the "shows the answer, never says wrong/failed" rule is a UI rule (LING-005/006) and this ticket produces no feedback strings. The 0002 blocklist is **not** applied to model output: "failed" can be the correct gloss of *scheitern*.
9. **Signatures of `glossWord` / `quizForClip` do not change.** `prepare.ts` is touched in exactly two places (cost); `types.ts` gains one optional member; `prepare.test.ts` gains one test. Nothing else in LING-001 moves.
10. **Spot check runs on the two fixture clips** (`demo-de`, `demo-en`) produced by `cli prepare --fixture --no-publish`, with real Nova for gloss + quiz only. To reach 15 glosses per clip the spot-check command widens the candidate band (see §8). The two real shortlist clips need Transcribe/ffmpeg and belong to LING-008.

## 1. Files

Groups marked **[independent]** can be implemented in parallel by separate implementers; groups with "after" wait for the named group.

### Group A — contracts **[independent]**
| Action | File | What |
|---|---|---|
| create | `packages/contracts/src/ai.ts` | `Gloss`, `GlossContext`, `glossIssues()`, `QuizPlan`, `QuizPlanItem`, `quizPlanIssues()`, `QuizCounts`, `quizCounts()`, limits consts, `LANGUAGE_NAMES` |
| modify | `packages/contracts/src/index.ts` | add `export * from './ai'` |
| create | `packages/contracts/test/ai.test.ts` | tests in §6 |

### Group B — pipeline AI infrastructure **[independent of A; only imports `PreparedCost` from contracts, which exists]**
| Action | File | What |
|---|---|---|
| create | `packages/pipeline/src/ai/client.ts` | `BedrockSend` type, `createBedrockSend()`, `toolUseInput()` |
| create | `packages/pipeline/src/ai/cache.ts` | `AiCache` (file cache), `cacheKey()`, `normalizeCue()` |
| create | `packages/pipeline/src/ai/cost.ts` | `NOVA_LITE_USD_PER_M`, `CostLedger` |
| create | `packages/pipeline/src/ai/seed.ts` | `fnv1a()`, `seededShuffle()` |
| create | `packages/pipeline/test/ai-cache.test.ts`, `test/ai-cost.test.ts`, `test/seed.test.ts` | tests in §6 |

### Group C — gloss + quiz + wiring (after A and B)
| Action | File | What |
|---|---|---|
| create | `packages/pipeline/src/ai/lang.ts` | `languageName()` (re-exports `LANGUAGE_NAMES`) |
| create | `packages/pipeline/src/ai/gloss.ts` | `GLOSS_PROMPT_VERSION`, `glossSystemPrompt()`, `glossToolConfig()`, `makeGloss()` |
| create | `packages/pipeline/src/ai/quiz.ts` | `QUIZ_PROMPT_VERSION`, `quizSystemPrompt()`, `quizToolConfig()`, `flattenHighlights()`, `buildQuizItems()`, `fallbackPlan()`, `makeQuiz()` |
| create | `packages/pipeline/src/ai/index.ts` | `createAi()`, `AiOptions`, `Ai`, `AiSchemaError` |
| rewrite | `packages/pipeline/src/prompts.ts` | thin module: default `Ai` instance bound to env; exports `glossWord`, `quizForClip` with the **same signatures as today**; re-exports `Gloss`, `QuizSet` for compatibility |
| modify | `packages/pipeline/src/types.ts` | `PrepareDeps` gains `cost?(): PreparedCost` |
| modify | `packages/pipeline/src/prepare.ts` | `defaultDeps()` builds one `createAi({ log })` and passes `gloss: ai.gloss, quiz: ai.quiz, cost: ai.cost`; `clipBase` gains `cost: deps.cost?.()`; the final log line appends `, cost $<usd> (<calls> calls, <cachedCalls> cached)` when `cost` is defined |
| modify | `packages/pipeline/test/prepare.test.ts` | append one `it(...)` (§6) |
| create | `packages/pipeline/test/gloss.test.ts`, `test/quiz.test.ts`, `test/ai.test.ts` | tests in §6 |
| create | `packages/pipeline/test/fixtures/nova/gloss-ok.json`, `gloss-bad-then-ok.json`, `quiz-ok.json`, `quiz-bad.json` | hand-written `ConverseCommandOutput` bodies (shape in §7) |
| modify | `.env.example` | `NOVA_LITE_MODEL_ID=us.amazon.nova-lite-v1:0`, add `LINGO_AI_CACHE_DIR=` (blank = default) |
| modify | `turbo.json` | add `LINGO_AI_CACHE_DIR` to `globalEnv` |

### Group D — spot check (after C)
| Action | File | What |
|---|---|---|
| create | `packages/pipeline/src/spotCheck.ts` | `spotCheckCandidates()`, `runSpotCheck()`, `renderSpotCheckMarkdown()` |
| modify | `packages/pipeline/src/cli.ts` | add `spot-check` command (§8) |
| create | `packages/pipeline/test/spotCheck.test.ts` | tests in §6 |
| create | `docs/spot-checks/README.md` | one paragraph: how to run, where results go (the reviewer commits `docs/spot-checks/LING-002-<date>.md`) |

### Docs (Scribe or implementer, after D)
| modify | `docs/aws.md` | Nova Lite row: "Converse + forced tool use, `us.amazon.nova-lite-v1:0`, ~$0.01 per 6-min clip (≈40 glosses + 1 quiz plan); file cache keyed by (lemma, cue)"; add the doc URLs from §10 under Sources |
| modify | `packages/pipeline/data/README.md` | add `.cache/ai/` line: "Nova Lite responses keyed by request identity; delete to re-ask; gitignored" |

## 2. Interfaces

### 2.1 `packages/contracts/src/ai.ts`

```ts
import { z } from 'zod'
import { PreparedQuizItem } from './prepared'

export const GLOSS_MAX_WORDS = 6, GLOSS_MAX_CHARS = 60
export const GRAMMAR_MAX_WORDS = 14, GRAMMAR_MAX_CHARS = 90
export const EXAMPLE_MAX_WORDS = 12, EXAMPLE_MAX_CHARS = 120
export const QUIZ_MEANING_ITEMS = 6, QUIZ_CLOZE_ITEMS = 4, QUIZ_MIN_HIGHLIGHTS = 4

/** Names used in prompts; unknown codes fall back to the upper-cased code. */
export const LANGUAGE_NAMES: Record<string, string> = { de: 'German', en: 'English', tr: 'Turkish', ar: 'Arabic', uk: 'Ukrainian', fr: 'French', es: 'Spanish', it: 'Italian', pl: 'Polish', ru: 'Russian' }

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
const line = (max: number, maxWords: number) => z.string().trim().min(1).max(max).refine((s) => !/[\r\n]/.test(s), 'single line').refine((s) => words(s) <= maxWords, `≤ ${maxWords} words`)

/** Shape of one explanation (what Nova returns and what PreparedHighlight carries). Context checks live in glossIssues(). */
export const Gloss = z.object({ gloss: line(GLOSS_MAX_CHARS, GLOSS_MAX_WORDS), grammar: line(GRAMMAR_MAX_CHARS, GRAMMAR_MAX_WORDS), example: line(EXAMPLE_MAX_CHARS, EXAMPLE_MAX_WORDS) }).strict()
export type Gloss = z.infer<typeof Gloss>
export interface GlossContext { word: string; lemma: string; cue: string }

/** Context rules a schema cannot express. Returns [] when acceptable. Each string is fed back to the model on retry. */
export function glossIssues(g: Gloss, ctx: GlossContext): string[]
//  - gloss (trimmed, trailing '.' removed, lower-cased) equals word or lemma lower-cased → 'gloss must be a translation, not a copy of the word; if the word is the same in both languages add a clarifier in parentheses'
//  - example (lower-cased) contains neither word nor lemma (lower-cased, substring) → 'example must use the word "<word>" or its base form "<lemma>"'
//  - normalise(example) === normalise(cue) (whitespace collapsed, lower-cased, trailing punctuation dropped) → 'example must be a new sentence, not the subtitle line'

/** What Nova returns for a quiz: a plan over highlight ids; the pipeline builds the items. */
export const QuizPlanItem = z.object({ kind: z.enum(['meaning', 'cloze']), highlightId: z.number().int().nonnegative(), distractorIds: z.array(z.number().int().nonnegative()).length(3) }).strict()
export const QuizPlan = z.object({ items: z.array(QuizPlanItem).min(1).max(QUIZ_MEANING_ITEMS + QUIZ_CLOZE_ITEMS) }).strict()
export type QuizPlan = z.infer<typeof QuizPlan>; export type QuizPlanItem = z.infer<typeof QuizPlanItem>
export interface QuizHighlight { id: number; cueIndex: number; word: string; gloss: string; cue: string }
export interface QuizCounts { meaning: number; cloze: number }
/** H < QUIZ_MIN_HIGHLIGHTS → { meaning: 0, cloze: 0 }; else { meaning: min(6, H), cloze: min(4, H) }. */
export function quizCounts(highlightCount: number): QuizCounts
/** [] when acceptable. Checks: every id < H.length; distractorIds distinct and ≠ highlightId; exactly counts.meaning 'meaning' and counts.cloze 'cloze' items; no highlightId repeated within a kind; meaning: the 3 distractor glosses and the correct gloss are pairwise distinct (case-insensitive, trimmed); cloze: the 3 distractor words and the correct word are pairwise distinct (case-insensitive). */
export function quizPlanIssues(plan: QuizPlan, H: QuizHighlight[], counts: QuizCounts): string[]
export const QuizSet = z.object({ items: z.array(PreparedQuizItem) })
export type QuizSet = z.infer<typeof QuizSet>
```

### 2.2 `packages/pipeline/src/ai/client.ts`

```ts
import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandInput, type ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime'
export type BedrockSend = (input: ConverseCommandInput) => Promise<ConverseCommandOutput>
/** Lazy: the client is constructed on the first call, never at import time (CI has no credentials). maxAttempts 5 / retryMode 'standard' = SDK handles ThrottlingException (429), ModelNotReady, 5xx with exponential backoff + jitter. */
export function createBedrockSend(opts: { region: string }): BedrockSend
/** First content block with toolUse whose name matches; returns its input, or null if absent (also null when stopReason === 'max_tokens'). */
export function toolUseInput(out: ConverseCommandOutput, toolName: string): unknown | null
```

### 2.3 `packages/pipeline/src/ai/cache.ts`

```ts
export interface CacheEntry<T> { v: 1; kind: 'gloss' | 'quiz'; identity: Record<string, unknown>; model: string; output: T; usage: { inputTokens: number; outputTokens: number }; at: string }
export function normalizeCue(cue: string): string               // '\n' → ' ', collapse whitespace, trim (case preserved)
export function cacheKey(identity: Record<string, unknown>): string // sha256 of JSON.stringify(identity with keys sorted recursively), first 32 hex chars
export class AiCache {
  constructor(dir: string)                                       // default: resolve(DATA_DIR, '.cache', 'ai')
  async get<T>(kind: 'gloss' | 'quiz', key: string, schema: z.ZodType<T>): Promise<CacheEntry<T> | null> // missing/unparsable/schema-failing → null (and the bad file is deleted)
  async set<T>(kind: 'gloss' | 'quiz', key: string, entry: CacheEntry<T>): Promise<void>                 // mkdir -p; write `${key}.json.tmp` then rename
  path(kind: 'gloss' | 'quiz', key: string): string             // `${dir}/${kind}/${key}.json`
}
```
Identity objects (all strings unless noted):
- gloss: `{ kind: 'gloss', v: GLOSS_PROMPT_VERSION (number), model, lang, native, level, lemma, cue: normalizeCue(cue) }` — `word` is deliberately **not** part of the key (ticket: keyed by (lemma, cue)); `level` is included because the example sentence depends on it.
- quiz: `{ kind: 'quiz', v: QUIZ_PROMPT_VERSION, model, lang, native, level?: undefined, highlights: H.map(h => [h.cueIndex, h.word, h.gloss, normalizeCue(h.cue)]) }`.

### 2.4 `packages/pipeline/src/ai/cost.ts`

```ts
/** On-demand, US East (N. Virginia), read 2026-10-01 from https://aws.amazon.com/bedrock/pricing/ (Amazon Nova tab): $0.00006 / 1K input, $0.00024 / 1K output. */
export const NOVA_LITE_USD_PER_M = { input: 0.06, output: 0.24 } as const
export interface Prices { input: number; output: number }   // USD per million tokens
export class CostLedger {
  constructor(prices: Prices = NOVA_LITE_USD_PER_M)
  record(usage: { inputTokens?: number; outputTokens?: number } | undefined): number // adds one call; returns the USD of this call
  hit(): void                                                                        // cachedCalls++
  snapshot(): PreparedCost                                                           // { calls, cachedCalls, inputTokens, outputTokens, usd } with usd rounded to 6 dp
}
```

### 2.5 `packages/pipeline/src/ai/seed.ts`

```ts
export function fnv1a(s: string): number                        // 32-bit FNV-1a
export function seededShuffle<T>(arr: readonly T[], seed: number): T[] // mulberry32 + Fisher–Yates; pure
```

### 2.6 `packages/pipeline/src/ai/gloss.ts`

```ts
export const GLOSS_PROMPT_VERSION = 1
export const GLOSS_TOOL = 'explain_word'
export function glossSystemPrompt(lang: Lang, native: string, level: Level, word: string, lemma: string): string   // §3.1 verbatim
export function glossToolConfig(): ToolConfiguration                                                                // §3.1
export interface GlossDeps { send: BedrockSend; cache: AiCache; ledger: CostLedger; model: string; log: (m: string) => void; now: () => Date }
/** Cache → call → Gloss.safeParse + glossIssues → on issues retry ONCE with feedback → on second failure throw AiSchemaError. */
export function makeGloss(d: GlossDeps): (word: string, lemma: string, cue: string, lang: Lang, native: string, level: Level) => Promise<Gloss>
```

### 2.7 `packages/pipeline/src/ai/quiz.ts`

```ts
export const QUIZ_PROMPT_VERSION = 1
export const QUIZ_TOOL = 'plan_quiz'
export type QuizCueInput = { index: number; text: string; native: string; highlights: Array<{ word: string; gloss: string }> } // = prepare.ts's call shape today
/** Flatten in cue order, dedupe by word.toLowerCase() keeping the first; id = position. */
export function flattenHighlights(cues: QuizCueInput[]): QuizHighlight[]
export function quizSystemPrompt(lang: Lang, native: string, counts: QuizCounts): string   // §3.2 verbatim
export function quizToolConfig(): ToolConfiguration
/** Pure. meaning: prompt = h.word, options = seededShuffle([h.gloss, ...distractor glosses], fnv1a(`${lang}|${native}|meaning|${h.cueIndex}|${h.word}`)); cloze: prompt = clozePrompt(h.cue, h.word), options = seededShuffle([h.word, ...distractor words], fnv1a(`…|cloze|…`)); answer = options.indexOf(correct); cueIndex = h.cueIndex. Order: all meaning items in plan order, then all cloze items. */
export function buildQuizItems(plan: QuizPlan, H: QuizHighlight[], lang: Lang, native: string): PreparedQuizItem[]
/** cue with '\n' → ' ', first match of /(^|[^\p{L}])WORD(?=[^\p{L}]|$)/u (WORD regex-escaped, case-sensitive) replaced by '$1____'. Throws if the word is not found (cannot happen for a real highlight; guards fixtures). */
export function clozePrompt(cue: string, word: string): string
/** Deterministic plan: meaning = H[0..counts.meaning), cloze = H[0..counts.cloze); distractors for H[i] = the next ids cyclically (i+1, i+2, …) skipping any whose gloss (meaning) / word (cloze) duplicates one already chosen or the correct one; an item that cannot reach 3 distractors is dropped. */
export function fallbackPlan(H: QuizHighlight[], counts: QuizCounts): QuizPlan
export interface QuizDeps extends GlossDeps {}
/** H = flattenHighlights(cues); counts = quizCounts(H.length); counts.meaning === 0 → { items: [] } (log 'quiz: skipped, <n> highlights < 4', no call, no cost). Else cache → call → QuizPlan.safeParse + quizPlanIssues → retry ONCE with feedback → on second failure or on a thrown transport error use fallbackPlan (log 'quiz: fallback builder used: <reason>'). Returns { items: buildQuizItems(plan, H, lang, native) }. Cache stores the *plan*, not the items. */
export function makeQuiz(d: QuizDeps): (cues: QuizCueInput[], lang: Lang, native: string) => Promise<QuizSet>
```
Level for the quiz prompt: `quizForClip` has no `level` parameter and the signature is frozen; the quiz prompt therefore omits the level (it affects only the choice of distractors, which are all in-band already).

### 2.8 `packages/pipeline/src/ai/index.ts`

```ts
export class AiSchemaError extends Error { constructor(public readonly kind: 'gloss' | 'quiz', public readonly issues: string[], public readonly lastOutput: unknown) }
export interface AiOptions { send?: BedrockSend; model?: string; region?: string; cacheDir?: string; prices?: Prices; log?: (m: string) => void; now?: () => Date }
export interface Ai { gloss: typeof glossWord; quiz: typeof quizForClip; cost: () => PreparedCost }
/** Defaults: send = createBedrockSend({ region: opts.region ?? process.env.BEDROCK_REGION ?? 'us-east-1' }) (lazy); model = opts.model ?? process.env.NOVA_LITE_MODEL_ID ?? 'us.amazon.nova-lite-v1:0'; cacheDir = opts.cacheDir ?? process.env.LINGO_AI_CACHE_DIR ?? resolve(DATA_DIR, '.cache', 'ai'); log = console.log; now = () => new Date(). One CostLedger per createAi(). */
export function createAi(opts?: AiOptions): Ai
```

### 2.9 `packages/pipeline/src/prompts.ts` (rewritten, same public names)

```ts
export { Gloss, QuizSet } from '@lingo/contracts'
export { createAi, AiSchemaError, type Ai, type AiOptions } from './ai/index'
let defaultAi: Ai | undefined
const ai = () => (defaultAi ??= createAi())
export async function glossWord(word: string, lemma: string, cue: string, lang: Lang, native: string, level: Level): Promise<Gloss> { return ai().gloss(word, lemma, cue, lang, native, level) }
export async function quizForClip(cues: QuizCueInput[], lang: Lang, native: string): Promise<QuizSet> { return ai().quiz(cues, lang, native) }
```
`types.ts` keeps `gloss: typeof glossWord; quiz: typeof quizForClip` and adds `cost?(): PreparedCost`.

### 2.10 Call shape sent to Bedrock (both kinds)

```ts
{
  modelId: model,
  system: [{ text: systemPrompt }],
  messages: [{ role: 'user', content: [{ text: JSON.stringify(payload) }, ...(attempt === 2 ? [{ text: feedback }] : [])] }],
  toolConfig: { tools: [{ toolSpec: { name, description, inputSchema: { json: schema } } }], toolChoice: { tool: { name } } },
  inferenceConfig: { maxTokens: kind === 'gloss' ? 300 : 1500, temperature: 0 },
}
```
`feedback` on attempt 2: `Your previous tool call was rejected: <issues joined by '; '>. Previous answer: <JSON.stringify(lastOutput)>. Call <name> again with a corrected answer.`
Zod `safeParse` issues are rendered as `<path.join('.')}: <message>`; `glossIssues`/`quizPlanIssues` strings are used verbatim. A missing `toolUse` block counts as the issue `no tool call in the response (stopReason=<stopReason>)`.

Log line per Bedrock call (through `log`): `ai <kind> <lemma|clip> attempt=<1|2> in=<inputTokens> out=<outputTokens> ms=<metrics.latencyMs> usd=<6dp> stop=<stopReason>`; per cache hit: `ai <kind> <lemma|clip> cached`.

## 3. Prompt design

Language names come from `LANGUAGE_NAMES` (fallback: code upper-cased). `{T}` = target language name, `{N}` = native language name.

### 3.1 Gloss — system prompt (verbatim; `{…}` substituted)

```
You are a {T} teacher writing a tiny dictionary card for one word in a subtitle line.
The learner's level is about {level} (CEFR, approximate — estimated from word frequency). The learner speaks {N}.
You receive JSON: {"word": the word as it appears, "lemma": its dictionary form, "cue": the subtitle line it appears in}.
Call the tool explain_word exactly once with:
- gloss: the meaning of the word AS USED IN THIS LINE, written in {N}. At most 6 words. Not a sentence: no period, no quotes, no {T} words. If the word is spelled the same in {N}, add a short clarifier in parentheses.
- grammar: one grammar note in {N}, at most 14 words, naming the part of speech and the one fact a learner needs next. {CONVENTIONS}
- example: one new sentence in {T} at level {level} that uses "{word}" or another form of "{lemma}". Not the given line. Everyday situation, no names of people, at most 12 words.
Be precise and short. Output only the tool call.
```
`{CONVENTIONS}`:
- `lang === 'de'`: `Conventions: nouns → "noun, die Stunde, pl. Stunden" (article and plural); verbs → "verb, warten, wartete, hat gewartet", separable verbs → "separable verb: an|rufen"; adjectives → "adjective, comparative schneller"; other words → part of speech plus one note.`
- `lang === 'en'`: `Conventions: nouns → "noun, pl. hours" (mention irregular plurals); verbs → "verb, wait, waited, waited", phrasal verbs → "phrasal verb: give up", irregular verbs → "irregular verb: go, went, gone"; adjectives → "adjective, comparative faster"; other words → part of speech plus one note.`

User message: `{"word":"warte","lemma":"warten","cue":"Ich warte seit zwei Stunden auf dich."}` (cue passed through `normalizeCue`).

Tool spec:
```json
{ "toolSpec": { "name": "explain_word", "description": "Record the dictionary card for the word: gloss, grammar note and example sentence.",
  "inputSchema": { "json": { "type": "object",
    "properties": {
      "gloss":   { "type": "string", "description": "Meaning in the learner's language, at most 6 words, no sentence" },
      "grammar": { "type": "string", "description": "Grammar note in the learner's language, at most 14 words" },
      "example": { "type": "string", "description": "One new sentence in the target language using the word, at most 12 words" } },
    "required": ["gloss", "grammar", "example"] } } } }
```
Expected tool input: `{"gloss":"wait","grammar":"verb, warten, wartete, hat gewartet; takes auf + accusative","example":"Wir warten auf den Bus."}`.

### 3.2 Quiz — system prompt (verbatim)

```
You are a {T} teacher choosing vocabulary quiz items from one video clip's subtitles for a learner who speaks {N}.
You receive JSON {"highlights":[{"id","word","gloss","cue"}]}: the words the learner saw highlighted, each with its {N} gloss and the subtitle line it appeared in.
Call the tool plan_quiz exactly once with "items":
- exactly {M} items with "kind":"meaning": the learner sees the word and picks its gloss among 4. "distractorIds" = 3 OTHER highlight ids whose glosses are plausible but clearly different in meaning (prefer the same part of speech; never a synonym of the correct gloss).
- exactly {C} items with "kind":"cloze": the learner sees the line with the word blanked and picks the word among 4. "distractorIds" = 3 OTHER highlight ids whose words would fit the line grammatically but not in meaning (prefer the same part of speech; never a word that also makes the line true).
Rules: never repeat a highlightId within one kind; a highlight may appear once as "meaning" and once as "cloze"; prefer lines where the blank cannot be guessed without knowing the word. Output only the tool call.
```
User message: `{"highlights":[{"id":0,"word":"warte","gloss":"wait","cue":"Ich warte seit zwei Stunden auf dich."}, …]}`.

Tool spec:
```json
{ "toolSpec": { "name": "plan_quiz", "description": "Record which highlights become quiz items and which other highlights serve as their distractors.",
  "inputSchema": { "json": { "type": "object",
    "properties": { "items": { "type": "array", "items": { "type": "object",
      "properties": {
        "kind":          { "type": "string",  "description": "\"meaning\" or \"cloze\"" },
        "highlightId":   { "type": "integer", "description": "id of the highlight being tested" },
        "distractorIds": { "type": "array", "items": { "type": "integer" }, "description": "exactly 3 other highlight ids" } },
      "required": ["kind", "highlightId", "distractorIds"] } } },
    "required": ["items"] } } } }
```
Resulting `PreparedQuizItem`s (built by code):
- meaning: `{ kind: 'meaning', prompt: 'warte', options: ['to look for', 'wait', 'to call', 'to forget'], answer: 1, cueIndex: 0 }`
- cloze: `{ kind: 'cloze', prompt: 'Ich ____ seit zwei Stunden auf dich.', options: ['suche', 'warte', 'rufe', 'vergesse'], answer: 1, cueIndex: 0 }`

## 4. Caching

- Location: `packages/pipeline/data/.cache/ai/<kind>/<key>.json` (gitignored). Override: `LINGO_AI_CACHE_DIR`, or `createAi({ cacheDir })` (tests use a `mkdtemp` dir).
- Key: §2.3. Changing a prompt text requires bumping `GLOSS_PROMPT_VERSION` / `QUIZ_PROMPT_VERSION`; a snapshot test of the system-prompt sha256 enforces that (§6).
- Hit semantics: the stored `output` is re-validated (`Gloss` + `glossIssues`, `QuizPlan` + `quizPlanIssues`) before use; a stale/invalid file is deleted and treated as a miss. A hit calls `ledger.hit()` and makes no Bedrock call.
- Stored on every *successful* attempt only (never a rejected answer).
- `prepare --fixture` keeps using `fixtureDeps()` doubles (no cache, no Bedrock).

## 5. Retry + cost logging

| Failure | Who retries | Policy |
|---|---|---|
| `ThrottlingException` 429, `ModelNotReadyException`, `ServiceUnavailableException` 503, `InternalServerException` 500, `ModelTimeoutException` 408, socket errors | AWS SDK | `maxAttempts: 5`, `retryMode: 'standard'` (exponential backoff, full jitter, 1 s base for throttling) |
| `ValidationException` 400, `AccessDeniedException` 403, `ResourceNotFoundException` 404 | nobody | thrown as-is (gloss → prepare fails; quiz → fallback builder + log) |
| No `toolUse` block, `stopReason === 'max_tokens'`, Zod failure, `glossIssues` / `quizPlanIssues` non-empty | our layer | exactly one more call with the feedback block (§2.10); then `AiSchemaError` (gloss) / `fallbackPlan` (quiz) |

Cost: every Bedrock response's `usage.inputTokens` / `usage.outputTokens` is recorded (`ledger.record`), including rejected attempts; `usd = in × 0.06/1e6 + out × 0.24/1e6`. `prepare()` writes `ledger.snapshot()` to `clip.json.cost` and logs the totals. Budget sanity for a 6-min clip: ≈ 40 glosses × (≈ 350 in + 60 out) + 1 quiz plan (≈ 2 500 in + 300 out) ≈ 17 k in / 2.7 k out ≈ **$0.002**. The spot check (30 glosses + 2 plans) is < $0.01; the $10 escalation line in `docs/ORCHESTRATOR.md` §6 is not approached.

## 6. Acceptance tests (vitest globals; file → `it(...)` names)

`packages/contracts/test/ai.test.ts`
- `it('Gloss accepts a 3-field card and rejects extra keys, empty strings, newlines, > 6 gloss words, > 14 grammar words, > 12 example words, > 60/90/120 chars')`
- `it('glossIssues flags a gloss equal to the word or lemma (case-insensitive, trailing period ignored) and passes "hotel (building)"')`
- `it('glossIssues flags an example that contains neither word nor lemma, and one that equals the cue after whitespace/case/punctuation normalisation')`
- `it('quizCounts returns 0/0 below 4 highlights, 4/4 at 4, 6/4 at 10 and above')`
- `it('QuizPlan rejects kinds other than meaning|cloze, non-integer ids and distractor arrays not of length 3')`
- `it('quizPlanIssues flags out-of-range ids, self-distractors, duplicate distractors, wrong per-kind counts, a highlightId repeated within a kind, and duplicate glosses/words among options')`
- `it('LANGUAGE_NAMES covers de, en, tr, ar, uk')`

`packages/pipeline/test/ai-cache.test.ts`
- `it('cacheKey is stable across key order and whitespace in the cue (normalizeCue) and changes with lemma, level, native, model and prompt version')`
- `it('get returns null for a missing key, deletes and returns null for an unparsable or schema-failing file, and returns the entry after set')`
- `it('set writes atomically (no .tmp left behind) and creates the kind directory')`

`packages/pipeline/test/ai-cost.test.ts`
- `it('record sums tokens and prices them at $0.06 / $0.24 per million; snapshot rounds usd to 6 dp')`
- `it('hit increments cachedCalls without touching tokens or usd')`
- `it('record tolerates a response without usage (counts the call, adds 0 tokens)')`

`packages/pipeline/test/seed.test.ts`
- `it('seededShuffle is a permutation, deterministic for a seed, and differs between seeds; fnv1a matches known vectors ("" → 0x811c9dc5, "a" → 0xe40c292c)')`

`packages/pipeline/test/gloss.test.ts` (fake `send`, tmp cache)
- `it('sends system prompt, user JSON {word, lemma, cue}, toolChoice explain_word and temperature 0 to the configured model')`
- `it('returns the toolUse input as a Gloss and records usage in the ledger')`
- `it('serves the second identical request from the cache: one send call, cachedCalls 1')`
- `it('a different cue for the same lemma is a cache miss')`
- `it('retries once with the validation issues and the rejected answer in the user message, then succeeds (fixture gloss-bad-then-ok)')`
- `it('throws AiSchemaError with the issues after two rejected answers and caches nothing')`
- `it('treats a response without a toolUse block (stopReason max_tokens) as a rejected answer')`
- `it('GLOSS_PROMPT_VERSION must be bumped when the system prompt changes (sha256 snapshot of glossSystemPrompt("de","en","A2","warte","warten"))')`
- `it('never constructs a BedrockRuntimeClient when send is injected')` (spy on the module; or assert `createBedrockSend` is lazy by calling it without credentials and checking no network until invoked)

`packages/pipeline/test/quiz.test.ts`
- `it('flattenHighlights keeps cue order, assigns ids from 0 and dedupes words case-insensitively')`
- `it('returns { items: [] } and makes no call when fewer than 4 highlights')`
- `it('builds 6 meaning + 4 cloze items from a valid plan: prompts, 4 distinct options, answer index points at the correct gloss/word, cueIndex = the highlight cue')`
- `it('clozePrompt blanks only the first whole-word occurrence, keeps punctuation and joins lines with a space')`
- `it('option order is deterministic for the same input and differs between items')`
- `it('builds items with exactly the PreparedQuizItem keys and no feedback text')`
- `it('retries once with issues when the plan has the wrong counts (fixture quiz-bad), then falls back to fallbackPlan and logs it')`
- `it('fallbackPlan uses the first M/C highlights with cyclic distinct distractors and drops an item that cannot reach 3')`
- `it('falls back (not throws) when send rejects with a ValidationException')`
- `it('caches the plan, not the items; a cached plan rebuilds identical items')`
- `it('QUIZ_PROMPT_VERSION must be bumped when the system prompt changes (sha256 snapshot)')`

`packages/pipeline/test/ai.test.ts`
- `it('createAi reads NOVA_LITE_MODEL_ID / BEDROCK_REGION / LINGO_AI_CACHE_DIR and defaults to us.amazon.nova-lite-v1:0, us-east-1, data/.cache/ai')`
- `it('cost() reflects gloss and quiz calls of one instance and is independent between instances')`

`packages/pipeline/test/prepare.test.ts` (append)
- `it('attaches deps.cost() as clip.cost when the deps provide it, and omits cost otherwise')`

`packages/pipeline/test/spotCheck.test.ts` (fake `send`; input = `clip.json` produced in-test by `prepare()` with `fixtureDeps`)
- `it('glosses the clip highlights first, then widens the band until 15 candidates per clip, deduped by lemma and never names or numerals')`
- `it('writes spot-check.json and markdown with 15 gloss rows, blank score columns, a quiz section and the cost line')`
- `it('--per-clip 3 limits the rows and the quiz still uses every clip highlight')`

Done when `pnpm typecheck && pnpm test` pass with **no AWS credentials in the environment** (`AWS_ACCESS_KEY_ID` unset) and `pnpm lint:words` passes.

## 7. Fixtures (`packages/pipeline/test/fixtures/nova/*.json`)

Minimal `ConverseCommandOutput` bodies, hand-written in the documented shape:
```json
{ "output": { "message": { "role": "assistant", "content": [ { "toolUse": { "toolUseId": "t1", "name": "explain_word", "input": { "gloss": "wait", "grammar": "verb, warten, wartete, hat gewartet; takes auf + accusative", "example": "Wir warten auf den Bus." } } } ] } },
  "stopReason": "tool_use", "usage": { "inputTokens": 287, "outputTokens": 61, "totalTokens": 348 }, "metrics": { "latencyMs": 812 } }
```
`gloss-bad-then-ok.json` is an array of two outputs (first: `gloss: "warten"` → copy of the lemma); `quiz-bad.json` has 5 meaning items; `quiz-ok.json` a valid 6+4 plan over 10 ids. The fake `send` in tests is `vi.fn()` returning these in order and recording inputs.

## 8. Spot-check rubric (30 items) and command

### 8.1 Command
```
pnpm --filter @lingo/pipeline cli prepare --clip demo-de --source s3://unused --lang de --native en --fixture --no-publish
pnpm --filter @lingo/pipeline cli prepare --clip demo-en --source s3://unused --lang en --native de --fixture --no-publish
AWS_PROFILE=… pnpm --filter @lingo/pipeline cli spot-check --clip-json work/demo-de/clip.json --out work/spot-check.md
AWS_PROFILE=… pnpm --filter @lingo/pipeline cli spot-check --clip-json work/demo-en/clip.json --out work/spot-check.md --append
```
Options: `--clip-json <path>` (required), `--per-clip <n>` (default 15), `--out <md>` (default `work/spot-check.md`), `--append`. Behaviour (`runSpotCheck`):
1. Parse `PreparedClip`. `ai = createAi({ log })` (real Bedrock).
2. Gloss every entry of `clip.highlights` with `ai.gloss(word, lemma, cueText, sourceLang, natives[0], level)` — real glosses replace the fixture ones in memory.
3. If fewer than `perClip` glosses: candidates = union over `[level, NEXT[level], NEXT[NEXT[level]]]` of `pickHighlights(cuesWithTokens, rank, lvl, 1.0)` (rank from `loadFreqList(sourceLang)`), minus lemmas already glossed, ordered by cue index then rank; gloss them at the **clip's** level until `perClip` is reached (or candidates run out — then the markdown says so).
4. `ai.quiz(cues with the real glosses, sourceLang, natives[0])`.
5. Write `work/<slug>/spot-check.json` (`{ slug, level, glosses: [{ cueIndex, cue, word, lemma, rank, gloss, grammar, example, cached }], quiz: PreparedQuizItem[], cost }`) and append to `--out` the markdown of §8.2.
`spotCheckCandidates(clip, rank, perClip)` is pure and unit-tested; `runSpotCheck` is tested with an injected `send`.

### 8.2 Markdown layout
```
## demo-de · de → en · level A2 · 15 glosses · 10 quiz items · $0.0031 (17 calls, 0 cached)
| # | cue | word · lemma (rank) | gloss | grammar | example | G1 | G2 | G3 | G4 | G5 | pass |
| 1 | Ich warte seit zwei Stunden auf dich. | warte · warten (1500) | wait | verb, … | Wir warten auf den Bus. |  |  |  |  |  |  |
…
### Quiz
| # | kind | prompt | options (answer marked *) | cue | Q1 | Q2 | Q3 | pass |
```
Score columns are left blank for the reviewer.

### 8.3 Gloss criteria (each 1/0; one row = one of the 30 items: 15 per clip)
- **G1 Meaning** — the gloss is the correct meaning of the word *in this cue* (sense in context), in the learner's language.
- **G2 Form** — gloss ≤ 6 words, no sentence, no target-language word unless it is a clarified cognate; not a copy of the word.
- **G3 Grammar note** — every statement in the note is true for this word (part of speech, article/plural, principal parts, separability); ≤ 14 words; in the learner's language.
- **G4 Example** — a natural, grammatical sentence in the target language, using the word or a form of the lemma, not the cue, roughly at the clip's level, no person names.
- **G5 Clean** — nothing off-task: no language leakage (e.g. Turkish gloss asked, English given), no hallucinated second meaning, no instructions/preamble, no offensive content.
- **Item pass** = G1 ∧ G2 ∧ G3 ∧ G4 ∧ G5.

### 8.4 Quiz criteria (per item; scored in addition to the 30)
- **Q1 Single truth** — exactly one option is correct for the prompt (meaning: only one gloss fits the word; cloze: only one word fits the line in meaning).
- **Q2 Plausible** — all three distractors are the same kind of word (POS) and would tempt a learner; none is a near-synonym of the answer.
- **Q3 Readable** — the prompt reads cleanly (cloze blank in the right place, no stray newline/punctuation), and `cueIndex` is the cue containing the word.
- **Item pass** = Q1 ∧ Q2 ∧ Q3.

### 8.5 Scoring and verdict
- Every row of both sheets (all clip highlights, at least 15 per clip); **accept at ≥ 90 % of rows, rounded up (PLAN §12; amended by LING-002-gate-c §7 / H2, 2026-10-03; was 30 items, ≥ 27)**. Quiz: accept at ≥ 90 % of items.
- Hard stop: ≥ 2 items failing G5 → the ticket does not pass review regardless of totals.
- Two-person rule (PLAN §5): the reviewer scores all rows; the human spot-confirms every row the reviewer marked 0 plus 5 random passes. Disagreements count as fails.
- Below threshold → one prompt revision (bump the prompt version, re-run; the cache guarantees only changed prompts re-ask) → re-score. At most two loops (`docs/ORCHESTRATOR.md` §3.4), then escalate.
- The scored markdown is committed as `docs/spot-checks/LING-002-<yyyy-mm-dd>.md`, and the result (pass/fail, counts, prompt version) is written into `docs/decisions/0001-week0-gates.md` under Gate C and into `docs/aws.md`.
- Every name or numeral that slipped into a gloss row is added to `data/names-{lang}.txt` / `NUMERAL_WORDS` as a LING-001 follow-up (0004 says the spot check grows those lists).

## 9. Risks

| Risk | Mitigation in this plan |
|---|---|
| Nova Lite v1 model card: "EOL no sooner than Dec 05, 2025", lifecycle still *Active* on 2026-10-01 | model id is env-driven; `NOVA_LITE_USD_PER_M` is the only constant to change if we move to Nova 2 Lite (open question 1) |
| Nova may not honour nested `array` of `object` in the tool schema | plan is validated by Zod + `quizPlanIssues`; one feedback retry; deterministic fallback so the clip always has a quiz |
| `temperature: 0` rejected with `ValidationException` (Nova's request-schema page says valid range starts at 0.00001; the tool-use page's sample uses 0) | if the spot check reports it, set `temperature: 0.00001` — one constant in `client.ts`; tests do not depend on the value |
| Greedy retry reproduces the same bad output | retry prompt includes the issues and the rejected answer; second failure is terminal |
| Cognates (`Hotel` → `hotel`) rejected as "copy of the word" | prompt asks for a clarifier in parentheses; the issue text repeats that on retry |
| Fixture clips are 60 s and in-band candidates are few | spot check widens the band across three levels with `maxShare = 1`; the markdown states if < 15 were available |
| Cache returns stale output after a prompt edit | prompt version in the key + sha256 snapshot tests force a bump |
| CI accidentally hits Bedrock | client is lazy, tests inject `send`; `pnpm test` is run once with AWS variables unset in the implementer's check |
| Subtitle text of CC-licensed clips leaves the EU (us-east-1) | acceptable for public CC content; `BEDROCK_REGION=eu-central-1` + `NOVA_LITE_MODEL_ID=eu.amazon.nova-lite-v1:0` is a two-variable switch (eu-central-1 is geo-profile only) |
| Quiz distractors limited to other highlights makes cloze easy when all highlights are nouns | accepted for this ticket; Q2 in the rubric measures it; widening the pool to clip tokens is a follow-up |
| Free tier (20 saves/day) and Lingo Plus gating | untouched by this ticket (`apps/api/src/routes/me.ts` already enforces the limit); no change |

## 10. Open questions (not answered by docs/PLAN.md)

1. **Nova Lite v1 or Nova 2 Lite?** The v1 card's EOL floor (Dec 2025) has passed although the model is still Active; `docs/aws.md` and the ticket say "Nova Lite". The plan defaults to `us.amazon.nova-lite-v1:0`; switching is one env var plus the price constant. Decide before LING-008 ingests the twelve clips so the cache is not thrown away.
2. **Glosses for natives beyond `natives[0]`.** `prepare.ts` requests one gloss language per clip and `Highlight.gloss` is a single string, yet learners' native languages include tr/ar/uk (PLAN §1, §7.2). Per-native glosses would multiply calls by |natives| and need a schema change (`gloss: Record<lang,string>`). Plan assumes one native per clip (as LING-001 does).
3. **Spot-check material.** The plan uses the two fixture clips (real Nova, fake everything else). If the orchestrator wants the check on two real shortlist clips (`jung-naiv-drogen`, `voa-lets-learn-english-01`), LING-001's real run (Transcribe + ffmpeg + packager) must happen first; the command works unchanged on any `clip.json`.

## 11. Doc URLs (cite in the PR)

- Converse API reference (request/response fields, `toolConfig`, `outputConfig`, `usage`, `metrics.latencyMs`, `stopReason` values, error codes incl. `ThrottlingException` 429, `ModelErrorException` 424, `ValidationException` 400): https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html
- Nova Lite model card (model id `amazon.nova-lite-v1:0`; geo profiles `us.amazon.nova-lite-v1:0` / `eu.amazon.nova-lite-v1:0`; us-east-1 in-region + geo, eu-central-1 geo only; context 300K, max output 5K; *Structured outputs: Not Supported*; *Client-side tool calling: Supported*; lifecycle dates): https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-lite.html
- Nova tool definition (toolChoice `auto|any|tool`; `inputSchema` top level limited to `type`, `properties`, `required`; "we recommend setting the temperature to 0"; Converse sample with `us.amazon.nova-lite-v1:0`): https://docs.aws.amazon.com/nova/latest/userguide/tool-use-definition.html
- Nova structured output guidance (tool use with tool choice to force a schema; greedy decoding): https://docs.aws.amazon.com/nova/latest/userguide/prompting-structured-output.html
- Nova complete request schema (`maxTokens` ≤ 5K, temperature/topP/topK ranges and defaults, `topK` via `additionalModelRequestFields`): https://docs.aws.amazon.com/nova/latest/userguide/complete-request-schema.html
- Nova with the Converse API (model ids, `additionalModelRequestFields.inferenceConfig.topK` example): https://docs.aws.amazon.com/nova/latest/userguide/using-converse-api.html
- Bedrock structured outputs (`outputConfig.textFormat`, `strict` tool use) — read to confirm Nova Lite is excluded by its model card: https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html
- Inference profiles and Regions: https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
- Bedrock pricing (Amazon Nova Lite on-demand $0.00006 / 1K input, $0.00024 / 1K output, read 2026-10-01): https://aws.amazon.com/bedrock/pricing/
- AWS SDK retry behaviour (`standard` mode, `maxAttempts`, backoff + jitter, throttling classification): https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html
- Bedrock IAM for inference profiles (already in `infra/lib/media-stack.ts`): https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html

## 12. Revisions after review (2026-10-01)

- **M1 temperature.** `TEMPERATURE = 0` stays, as the Nova tool-use page recommends. The request-schema page gives a minimum of 0.00001, so if Converse returns a `ValidationException` whose message mentions temperature, that call is repeated once at `TEMPERATURE_FLOOR = 0.00001`. The floor is then kept for the rest of the process (`src/ai/call.ts`).
- **M2 grammar labels, GLOSS_PROMPT_VERSION 1 → 2.** The v1 `{CONVENTIONS}` gave English part-of-speech labels to every learner, which contradicts "grammar note in {N}". v2 writes the labels in the learner's language and keeps the word forms in the target language.
  - en and de natives have their own label tables.
  - Other natives get the English examples plus "Write the part-of-speech labels in {N}; keep the word forms in {T}."
  - The version bump deliberately invalidates the v1 cache entries.
- **M3** REJECTED spot-check rows are left out of the quiz input.
- **M4** "example must use the word" (`glossIssues` in contracts) is now a soft issue (`isSoftGlossIssue`). It still triggers the one retry. If a retry answer's only remaining issues are soft, the answer is accepted and a WARNING line is logged; a cache hit is not discarded for a soft issue either. This covers irregular forms such as gibt/geben → "Er gab …".
- **L2** When `buildQuizItems`/`clozePrompt` cannot build an item, `makeQuiz` drops that item and logs `quiz: dropped <kind> item "<word>": <reason>` instead of failing the clip.
- **L4** `spot-check --fixture` writes `spot-check.fixture.json` (and defaults `--out` to `work/spot-check.fixture.md`). It never writes `spot-check.json`.
- **L5** Gate C runs on the two real clips: `terra-x-friedlaender` and an English clip. This supersedes the fixture clips named in §0.10 and §8.1.
- **L1** The Nova Lite prices in `cost.ts` and docs/aws.md come from search summaries. They stay marked unverified until checked against the pricing page.
