/**
 * Frequency-aware highlights: 1–2 words per cue whose rank lies in the band just above the clip level;
 * never names or numbers; cap 40 % of cues. Ranks come from an open subtitle-frequency list (data/freq-{lang}.txt, one lemma per line, rank = line number).
 * Level ≈ band: A1 < 1000, A2 < 2000, B1 < 4000, B2 < 8000 (approximate CEFR; say so in the UI).
 */
export type Level = 'A1' | 'A2' | 'B1' | 'B2'
export const BANDS: Record<Level, [number, number]> = { A1: [0, 1000], A2: [1000, 2000], B1: [2000, 4000], B2: [4000, 8000] }
export const NEXT: Record<Level, Level> = { A1: 'A2', A2: 'B1', B1: 'B2', B2: 'B2' }
export interface Token { word: string; lemma: string }
export function pickHighlights(cues: Array<{ index: number; tokens: Token[] }>, rank: (lemma: string) => number | undefined, level: Level, maxShare = 0.4): Array<{ cueIndex: number; word: string; lemma: string; rank: number }> {
  const [lo, hi] = BANDS[NEXT[level]]
  const out: Array<{ cueIndex: number; word: string; lemma: string; rank: number }> = []
  const seen = new Set<string>()
  const budget = Math.floor(cues.length * maxShare)
  for (const c of cues) {
    if (out.filter((o) => o.cueIndex !== c.index).length >= budget && !out.some((o) => o.cueIndex === c.index)) { if (new Set(out.map((o) => o.cueIndex)).size >= budget) continue }
    const cands = c.tokens
      .filter((t) => !/^[A-ZÄÖÜ]/.test(t.word) || t.lemma === t.word.toLowerCase()) // crude proper-noun filter (German nouns are capitalised → keep if lemma matches lowercase)
      .filter((t) => !/\d/.test(t.word) && t.word.length > 2)
      .map((t) => ({ ...t, r: rank(t.lemma) })).filter((t): t is Token & { r: number } => t.r !== undefined && t.r >= lo && t.r < hi && !seen.has(t.lemma))
      .sort((a, b) => a.r - b.r).slice(0, 2)
    for (const t of cands) { seen.add(t.lemma); out.push({ cueIndex: c.index, word: t.word, lemma: t.lemma, rank: t.r }) }
  }
  return out
}
/** Coverage-based level for a clip: the smallest level whose band covers ≥ 95 % of running tokens. */
export function clipLevel(tokens: Token[], rank: (l: string) => number | undefined): Level {
  const ranks = tokens.map((t) => rank(t.lemma) ?? 99999)
  for (const lvl of ['A1', 'A2', 'B1', 'B2'] as Level[]) { const hi = BANDS[lvl][1]; if (ranks.filter((r) => r < hi).length / ranks.length >= 0.95) return lvl }
  return 'B2'
}
