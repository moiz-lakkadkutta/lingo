import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PreparedClip, type Lang, type PreparedCost, type PreparedQuizItem } from '@lingo/contracts'
import { createAi, type Ai, type AiOptions } from './ai/index'
import { AiSchemaError } from './ai/errors'
import { loadFreqList, rankFn } from './freq'
import { NEXT, pickHighlights } from './highlights'

/**
 * LING-002 §8: the 30-item quality check. Glosses each clip's highlights (then wider-band words until `perClip` rows), builds the quiz
 * from the clip highlights, and writes a rubric sheet with blank score columns for the reviewer. Works on a `--no-ai` clip.json:
 * glosses and quiz are generated here through createAi() (and its cache), never read from the file.
 */
export const DEFAULT_PER_CLIP = 15

export interface SpotCandidate { cueIndex: number; cue: string; word: string; lemma: string; rank: number; fromClip: boolean }

/**
 * Pure. Every clip highlight first (in clip order; never dropped), then, while fewer than `perClip`, words picked by pickHighlights() at the
 * clip level and the next two levels with maxShare 1 (so names, digits and number words never appear), minus lemmas already present,
 * ordered by cue index then rank.
 */
export function spotCheckCandidates(clip: PreparedClip, rank: (lemma: string) => number | undefined, perClip: number): SpotCandidate[] {
  const cueText = (i: number) => clip.cues[i]!.text
  const out: SpotCandidate[] = clip.highlights.map((h) => ({ cueIndex: h.cueIndex, cue: cueText(h.cueIndex), word: h.word, lemma: h.lemma, rank: h.rank, fromClip: true }))
  const seen = new Set(out.map((c) => c.lemma.toLowerCase()))
  if (out.length >= perClip) return out
  const cues = clip.cues.map((c) => ({ index: c.index, tokens: c.tokens }))
  const levels = [...new Set([clip.level, NEXT[clip.level], NEXT[NEXT[clip.level]]])]
  const wider = levels.flatMap((lvl) => pickHighlights(cues, rank, lvl, 1.0))
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

export interface SpotGlossRow { cueIndex: number; cue: string; word: string; lemma: string; rank: number; gloss: string; grammar: string; example: string; cached: boolean }
export interface SpotCheckResult {
  slug: string; sourceLang: Lang; native: string; level: PreparedClip['level']; perClip: number
  /** candidates found (< perClip means the clip ran out of words; the markdown says so) */
  available: number
  glosses: SpotGlossRow[]; quiz: PreparedQuizItem[]; cost: PreparedCost
  files: { json: string; markdown: string }
}
export interface SpotCheckOptions {
  clipJson: string
  perClip?: number
  /** markdown sheet; default work/spot-check.md */
  out?: string
  append?: boolean
  /** injected in tests and in --fixture mode; default createAi({ ...aiOptions, log }) = real Bedrock + cache */
  ai?: Ai
  aiOptions?: AiOptions
  /** default: data/freq-{lang}.txt */
  freqList?: string[]
  log?: (m: string) => void
}

export async function runSpotCheck(o: SpotCheckOptions): Promise<SpotCheckResult> {
  const log = o.log ?? ((m: string) => console.log(m))
  const perClip = o.perClip ?? DEFAULT_PER_CLIP
  const clip = PreparedClip.parse(JSON.parse(await readFile(o.clipJson, 'utf8')))
  const native = clip.natives[0]!
  const ai = o.ai ?? createAi({ ...o.aiOptions, log })
  const rank = rankFn(o.freqList ?? (await loadFreqList(clip.sourceLang)))
  const candidates = spotCheckCandidates(clip, rank, perClip)

  // gloss every candidate (all clip highlights are needed for the quiz even when perClip is smaller)
  const glossed: SpotGlossRow[] = []
  for (const c of candidates) {
    const before = ai.cost().cachedCalls
    let g: { gloss: string; grammar: string; example: string }
    try {
      g = await ai.gloss(c.word, c.lemma, c.cue, clip.sourceLang, native, clip.level)
    } catch (e) {
      if (!(e instanceof AiSchemaError)) throw e
      // a twice-rejected answer is a result to score (it fails), not a reason to abort the sheet
      g = { gloss: `REJECTED: ${e.issues.join('; ')}`, grammar: JSON.stringify(e.lastOutput), example: '' }
    }
    glossed.push({ cueIndex: c.cueIndex, cue: c.cue, word: c.word, lemma: c.lemma, rank: c.rank, ...g, cached: ai.cost().cachedCalls > before })
  }

  // quiz over the clip highlights only, as prepare() would build it
  const fromClip = glossed.slice(0, clip.highlights.length)
  const quiz = (await ai.quiz(clip.cues.map((cue) => ({
    index: cue.index, text: cue.text, native: cue.native[native] ?? '',
    highlights: fromClip.filter((g) => g.cueIndex === cue.index).map((g) => ({ word: g.word, gloss: g.gloss })),
  })), clip.sourceLang, native)).items

  const result: SpotCheckResult = {
    slug: clip.slug, sourceLang: clip.sourceLang, native, level: clip.level, perClip, available: candidates.length,
    glosses: glossed.slice(0, perClip), quiz, cost: ai.cost(),
    files: { json: join(dirname(o.clipJson), 'spot-check.json'), markdown: o.out ?? join('work', 'spot-check.md') },
  }
  const { slug, level, glosses, cost } = result
  await writeFile(result.files.json, JSON.stringify({ slug, sourceLang: clip.sourceLang, native, level, glosses, quiz, cost }, null, 2) + '\n')
  const md = renderSpotCheckMarkdown(result, clip)
  await mkdir(dirname(result.files.markdown), { recursive: true })
  await (o.append ? appendFile(result.files.markdown, `\n${md}`) : writeFile(result.files.markdown, md))
  log(`spot-check ${slug}: ${glosses.length} glosses, ${quiz.length} quiz items, $${cost.usd.toFixed(4)} (${cost.calls} calls, ${cost.cachedCalls} cached) → ${result.files.markdown}`)
  return result
}

const cell = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim()

/** §8.2 layout; score columns left blank for the reviewer. */
export function renderSpotCheckMarkdown(r: SpotCheckResult, clip: PreparedClip): string {
  const lines = [
    `## ${r.slug} · ${r.sourceLang} → ${r.native} · level ${r.level} · ${r.glosses.length} glosses · ${r.quiz.length} quiz items · $${r.cost.usd.toFixed(4)} (${r.cost.calls} calls, ${r.cost.cachedCalls} cached)`,
    '',
  ]
  if (r.available < r.perClip) lines.push(`Only ${r.available} candidate words in this clip (wanted ${r.perClip}).`, '')
  lines.push('| # | cue | word · lemma (rank) | gloss | grammar | example | G1 | G2 | G3 | G4 | G5 | pass |', '|---|---|---|---|---|---|---|---|---|---|---|---|')
  r.glosses.forEach((g, i) => lines.push(`| ${i + 1} | ${cell(g.cue)} | ${cell(g.word)} · ${cell(g.lemma)} (${g.rank}) | ${cell(g.gloss)} | ${cell(g.grammar)} | ${cell(g.example)} |  |  |  |  |  |  |`))
  lines.push('', '### Quiz', '', '| # | kind | prompt | options (answer marked *) | cue | Q1 | Q2 | Q3 | pass |', '|---|---|---|---|---|---|---|---|---|')
  r.quiz.forEach((q, i) => {
    const options = q.options.map((o, j) => (j === q.answer ? `*${cell(o)}` : cell(o))).join(' / ')
    const cue = q.cueIndex === null ? '' : cell(clip.cues[q.cueIndex]?.text ?? '')
    lines.push(`| ${i + 1} | ${q.kind} | ${cell(q.prompt)} | ${options} | ${cue} |  |  |  |  |`)
  })
  if (!r.quiz.length) lines.push('', 'No quiz: fewer than 4 highlights in this clip.')
  return lines.join('\n') + '\n'
}
