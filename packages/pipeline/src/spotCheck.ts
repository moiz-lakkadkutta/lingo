import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PreparedClip, type GlossCard, type Lang, type PreparedCost, type PreparedQuizItem } from '@lingo/contracts'
import { glossClip, quizInput, type ClipGlossResult } from './ai/glossClip'
import { createAi, type Ai, type AiOptions } from './ai/index'
import { loadFreqList, rankFn } from './freq'
import { NEXT, pickHighlights } from './highlights'
import { asrSuspects, MIN_HIGHLIGHT_CONFIDENCE, tokenKey } from './asr'

/**
 * LING-002 §8 (as amended by LING-002-gate-c §7): the Gate C quality check. Glosses every clip highlight (then wider-band words while fewer
 * than `perClip` rows), builds the quiz from the status-ok clip highlights, and writes a rubric sheet with blank score columns for the reviewer. Works on a `--no-ai` clip.json:
 * glosses and quiz are generated here through createAi() (and its cache), never read from the file.
 */
/** The minimum number of rows per clip (every clip highlight is always a row). */
export const DEFAULT_PER_CLIP = 15

export interface SpotCandidate { cueIndex: number; cue: string; word: string; lemma: string; rank: number; fromClip: boolean }

/**
 * Pure. Every clip highlight first (in clip order; dropped only by the ASR filter: confidence < 0.4 or asrSuspects), then, while fewer than `perClip`, words picked by pickHighlights() at the
 * clip level and the next two levels with maxShare 1 (so names, digits and number words never appear), minus lemmas already present,
 * ordered by cue index then rank.
 */
export function spotCheckCandidates(clip: PreparedClip, rank: (lemma: string) => number | undefined, perClip: number): SpotCandidate[] {
  const cueText = (i: number) => clip.cues[i]!.text
  // the ASR filter of LING-002-gate-c §2 also applies to a clip.json prepared before it existed
  const cues = clip.cues.map((c) => ({ index: c.index, tokens: c.tokens }))
  const exclude = asrSuspects(cues, rank)
  const lowConfidence = (h: { cueIndex: number; word: string }) => clip.cues[h.cueIndex]?.tokens.some((t) => t.word === h.word && t.asr !== undefined && t.asr < MIN_HIGHLIGHT_CONFIDENCE) ?? false
  const out: SpotCandidate[] = clip.highlights.filter((h) => !exclude.has(tokenKey(h.cueIndex, h.word)) && !lowConfidence(h)).map((h) => ({ cueIndex: h.cueIndex, cue: cueText(h.cueIndex), word: h.word, lemma: h.lemma, rank: h.rank, fromClip: true }))
  const seen = new Set(out.map((c) => c.lemma.toLowerCase()))
  if (out.length >= perClip) return out
  const levels = [...new Set([clip.level, NEXT[clip.level], NEXT[NEXT[clip.level]]])]
  const wider = levels.flatMap((lvl) => pickHighlights(cues, rank, lvl, 1.0, exclude))
    .sort((a, b) => a.cueIndex - b.cueIndex || a.rank - b.rank)
  for (const w of wider) {
    if (out.length >= perClip) break
    const k = w.lemma.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ cueIndex: w.cueIndex, cue: cueText(w.cueIndex), word: w.word, lemma: w.lemma, rank: w.rank, fromClip: false })
  }
  return out
}

export interface SpotGlossRow {
  cueIndex: number; cue: string; word: string; lemma: string; rank: number
  /** ok / soft / rejected / conflict (glossClip) */
  status: ClipGlossResult['status']
  /** the model's definition, so the reviewer sees the sense it chose */
  sense: string
  gloss: string; grammar: string; example: string
  /** validator / sibling issues (soft issues on a soft row) */
  issues: string[]
  /** the raw card, when there is one */
  card?: GlossCard
  fromClip: boolean; cached: boolean
}
export interface SpotCheckResult {
  slug: string; sourceLang: Lang; native: string; level: PreparedClip['level']; perClip: number
  /** candidates found (< perClip means the clip ran out of words; the markdown says so) */
  available: number
  glosses: SpotGlossRow[]; quiz: PreparedQuizItem[]; cost: PreparedCost
  files: { json: string; markdown: string }
  /** the section just rendered (never earlier sections of an --append file) */
  markdown: string
  /** the one-line summary (also logged) */
  summary: string
}
export interface SpotCheckOptions {
  clipJson: string
  /** minimum number of rows: every clip highlight is a row, widened with other words while fewer than perClip */
  perClip?: number
  /** markdown sheet; default work/spot-check.md */
  out?: string
  append?: boolean
  /** injected in tests and in --fixture mode; default createAi({ ...aiOptions, log }) = real Bedrock + cache */
  ai?: Ai
  aiOptions?: AiOptions
  /** file written next to clip.json; default spot-check.json (--fixture uses spot-check.fixture.json so stub output never replaces a real one) */
  jsonFile?: string
  /** default: data/freq-{lang}.txt */
  freqList?: string[]
  log?: (m: string) => void
}

const toRow = (r: ClipGlossResult, fromClip: boolean): SpotGlossRow => {
  const card = r.card
  const base = { cueIndex: r.cueIndex, cue: r.cue, word: r.word, lemma: r.lemma, rank: r.rank, status: r.status, sense: card?.sense ?? '', issues: r.issues, ...(card ? { card } : {}), fromClip, cached: r.cached }
  if (r.status === 'ok' || r.status === 'soft') return { ...base, ...r.gloss }
  return { ...base, gloss: card ? card.gloss.join(', ') : '', grammar: '', example: card?.example ?? '' }
}

/**
 * LING-002-gate-c §7: rows = every clip highlight (after the ASR filter) and, while fewer than perClip, widened candidates; glossed through
 * glossClip (as prepare does); the quiz is built from the status-ok clip-highlight rows only, through the same quizInput() as prepare.
 */
export async function runSpotCheck(o: SpotCheckOptions): Promise<SpotCheckResult> {
  const log = o.log ?? ((m: string) => console.log(m))
  const perClip = o.perClip ?? DEFAULT_PER_CLIP
  const clip = PreparedClip.parse(JSON.parse(await readFile(o.clipJson, 'utf8')))
  const native = clip.natives[0]!
  const ai = o.ai ?? createAi({ ...o.aiOptions, log })
  const rank = rankFn(o.freqList ?? (await loadFreqList(clip.sourceLang)))
  const candidates = spotCheckCandidates(clip, rank, perClip)

  const results = await glossClip(ai, candidates.map((c) => ({ cueIndex: c.cueIndex, word: c.word, lemma: c.lemma, rank: c.rank, cue: c.cue, nativeCue: clip.cues[c.cueIndex]!.native[native], ...(c.cueIndex > 0 ? { prevCue: clip.cues[c.cueIndex - 1]!.text } : {}) })),
    clip.sourceLang, native, clip.level, log)
  const glosses = results.map((r, i) => toRow(r, candidates[i]!.fromClip))

  const fromClip = results.filter((_, i) => candidates[i]!.fromClip)
  const quiz = (await ai.quiz(quizInput(clip.cues.map((c) => ({ index: c.index, text: c.text, native: c.native[native] ?? '' })), fromClip), clip.sourceLang, native)).items

  const files = { json: join(dirname(o.clipJson), o.jsonFile ?? 'spot-check.json'), markdown: o.out ?? join('work', 'spot-check.md') }
  const partial = { slug: clip.slug, sourceLang: clip.sourceLang, native, level: clip.level, perClip, available: candidates.length, glosses, quiz, cost: ai.cost(), files }
  const { slug, level, cost } = partial
  await writeFile(files.json, JSON.stringify({ slug, sourceLang: clip.sourceLang, native, level, glosses, quiz, cost }, null, 2) + '\n')
  const markdown = renderSpotCheckMarkdown(partial, clip)
  await mkdir(dirname(files.markdown), { recursive: true })
  await (o.append ? appendFile(files.markdown, `\n${markdown}`) : writeFile(files.markdown, markdown))
  const counts = Object.entries(glosses.reduce<Record<string, number>>((a, g) => ({ ...a, [g.status]: (a[g.status] ?? 0) + 1 }), {})).map(([k, v]) => `${v} ${k}`).join(', ')
  const summary = `spot-check ${slug}: ${glosses.length} glosses (${counts}), ${quiz.length} quiz items, $${cost.usd.toFixed(4)} (${cost.calls} calls, ${cost.cachedCalls} cached) → ${files.markdown}`
  log(summary)
  return { ...partial, markdown, summary }
}

const cell = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim()

/** §8.2 layout as amended by LING-002-gate-c §7 (status and sense columns); score columns left blank for the reviewer. */
export function renderSpotCheckMarkdown(r: Omit<SpotCheckResult, 'markdown' | 'summary'>, clip: PreparedClip): string {
  const own = r.glosses.filter((g) => g.fromClip).length
  const lines = [
    `## ${r.slug} · ${r.sourceLang} → ${r.native} · level ${r.level} · ${r.glosses.length} glosses (${own} highlights + ${r.glosses.length - own} widened) · ${r.quiz.length} quiz items · $${r.cost.usd.toFixed(4)} (${r.cost.calls} calls, ${r.cost.cachedCalls} cached)`,
    '',
  ]
  if (r.available < r.perClip) lines.push(`Only ${r.available} candidate words in this clip (wanted ${r.perClip}).`, '')
  lines.push('| # | cue | word · lemma (rank) | status | sense | gloss | grammar | example | G1 | G2 | G3 | G4 | G5 | pass |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  r.glosses.forEach((g, i) => {
    const status = g.status === 'ok' ? 'ok' : `${g.status}: ${g.issues.join('; ')}`
    lines.push(`| ${i + 1} | ${cell(g.cue)} | ${cell(g.word)} · ${cell(g.lemma)} (${g.rank}) | ${cell(status)} | ${cell(g.sense)} | ${cell(g.gloss)} | ${cell(g.grammar)} | ${cell(g.example)} |  |  |  |  |  |  |`)
  })
  lines.push('', '### Quiz', '', '| # | kind | prompt | options (answer marked *) | cue | Q1 | Q2 | Q3 | pass |', '|---|---|---|---|---|---|---|---|---|')
  r.quiz.forEach((q, i) => {
    const options = q.options.map((o, j) => (j === q.answer ? `*${cell(o)}` : cell(o))).join(' / ')
    const cue = q.cueIndex === null ? '' : cell(clip.cues[q.cueIndex]?.text ?? '')
    lines.push(`| ${i + 1} | ${q.kind} | ${cell(q.prompt)} | ${options} | ${cue} |  |  |  |  |`)
  })
  if (!r.quiz.length) lines.push('', 'No quiz: fewer than 4 status-ok highlights in this clip.')
  return lines.join('\n') + '\n'
}

export interface SpotCheckCliOptions { clipJson: string; perClip: number; out: string; append?: boolean; echo: boolean; ai?: Ai; jsonFile?: string; freqList?: string[] }

/**
 * The `spot-check` command (cli.ts): prints only the section just written (never the whole file, F9), or with --no-echo only the summary
 * line, and then no per-word log line either (for clips whose rows must not reach a terminal log; docs/decisions/0009 decision 8).
 */
export async function spotCheckCli(o: SpotCheckCliOptions, print: (s: string) => void): Promise<SpotCheckResult> {
  const log = o.echo ? print : () => {}
  const ai = o.ai ?? createAi({ log })
  const r = await runSpotCheck({ clipJson: o.clipJson, perClip: o.perClip, out: o.out, append: o.append, ai, log, jsonFile: o.jsonFile, freqList: o.freqList })
  if (o.echo) print(`\n${r.markdown}`)
  else print(r.summary)
  return r
}
