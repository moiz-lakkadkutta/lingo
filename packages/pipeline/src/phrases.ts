import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DATA_DIR } from './freq'
import type { Lang } from './types'

/**
 * Fixed expressions (LING-002 Gate C round 6, docs/decisions/0009): data/phrases-<lang>.txt lists multi-word expressions (and a few
 * single words that need a sense note, e.g. old-timer). A highlighted token inside a listed expression becomes one highlight for the
 * whole expression, glossed as a unit (pos "phrase").
 */
export interface Phrase { lemma: string; forms: string[][]; note?: string }

/** One expression per line: `words [| variant words …] [:: sense note]`; `#` comments and blank lines are ignored. */
export function parsePhrases(text: string): Phrase[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const [main, note] = l.split(' :: ')
    const forms = main!.split(' | ').map((f) => f.trim().toLowerCase().split(/\s+/))
    return { lemma: forms[0]!.join(' '), forms, ...(note ? { note: note.trim() } : {}) }
  })
}

export async function loadPhrases(lang: Lang, dataDir = DATA_DIR): Promise<Phrase[]> {
  return parsePhrases(await readFile(resolve(dataDir, `phrases-${lang}.txt`), 'utf8').catch(() => ''))
}

export interface PhraseHighlight { cueIndex: number; word: string; lemma: string; rank: number; phrase?: true }

/** Where the expression occurs in the cue's tokens (each word matches a token's word or lemma), as [start, end) spans. */
function occurrences(tokens: Array<{ word: string; lemma: string }>, p: Phrase): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const form of p.forms) {
    for (let i = 0; i + form.length <= tokens.length; i++) {
      if (form.every((w, k) => tokens[i + k]!.word.toLowerCase() === w || tokens[i + k]!.lemma.toLowerCase() === w)) out.push([i, i + form.length])
    }
  }
  return out
}

/**
 * Pure. Each picked highlight whose token lies inside an occurrence of a listed expression in its cue is replaced by one highlight for
 * the expression: word = the surface span (tokens joined by a space), lemma = the expression, rank = the rarest rank among the merged
 * highlights, phrase = true. At most one highlight per occurrence; order follows the first merged highlight.
 */
export function mergeExpressions<H extends { cueIndex: number; word: string; lemma: string; rank: number }>(picked: H[], cues: Array<{ index: number; tokens: Array<{ word: string; lemma: string }> }>, phrases: Phrase[]): Array<H | PhraseHighlight> {
  const byCue = new Map(cues.map((c) => [c.index, c.tokens]))
  const out: Array<H | PhraseHighlight> = []
  const seen = new Map<string, PhraseHighlight>()
  for (const h of picked) {
    const tokens = byCue.get(h.cueIndex) ?? []
    let hit: { p: Phrase; span: [number, number] } | undefined
    for (const p of phrases) {
      for (const span of occurrences(tokens, p)) {
        if (tokens.slice(span[0], span[1]).some((t) => t.word === h.word)) { hit = { p, span }; break }
      }
      if (hit) break
    }
    if (!hit) { out.push(h); continue }
    const key = `${h.cueIndex}|${hit.span[0]}|${hit.span[1]}`
    const prev = seen.get(key)
    if (prev) { prev.rank = Math.max(prev.rank, h.rank); continue }
    const merged: PhraseHighlight = { cueIndex: h.cueIndex, word: tokens.slice(hit.span[0], hit.span[1]).map((t) => t.word).join(' '), lemma: hit.p.lemma, rank: h.rank, phrase: true }
    seen.set(key, merged)
    out.push(merged)
  }
  return out
}
