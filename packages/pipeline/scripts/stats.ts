/**
 * Re-measure report for a prepared clip (docs/plans/LING-001-quality.md §8.4, §11; ported from the spike's stats.py).
 *   pnpm --filter @lingo/pipeline stats work/<slug>/clip.json [more clip.json …]   print the stats of each clip (words.json next to it adds inner gaps)
 *   pnpm --filter @lingo/pipeline stats                                            run both real fixtures offline (fixture doubles, no AWS) and
 *                                                                                  print before (test/fixtures/real/baseline-stats.json) vs after
 *   pnpm --filter @lingo/pipeline stats --write-baseline                           (re)write that baseline from the current pipeline
 * `statsFor` is pure so test/real.test.ts can assert on it.
 */
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PreparedClip } from '@lingo/contracts'
import { prepare } from '../src/prepare'
import { fixtureDeps } from '../src/fixtureDeps'
import type { Lang, Word } from '../src/types'

export interface Dist { min: number; median: number; p95: number; max: number }
export interface Stats {
  slug: string; lang: string; level: string; coverageRank: number; durationS: number
  cues: number; twoLineCues: number; tokens: number
  cps: Dist; lineChars: Dist; durationSec: Dist; gapSec: Dist
  over17cps: number; under1_2s: number; exactly1s: number; atLeast6s: number
  speechCoveredS: number; speechShare: number
  /** largest word gap inside one cue (needs words.json), null without words */
  maxInnerGapS: number | null
  /** cues with an inner word gap > 1.0 s (PAUSE_S), null without words */
  cuesWithInnerPause: number | null
  highlights: Array<{ word: string; lemma: string; rank: number; cueIndex: number }>
  names: string[]
  unrankedLemmas: string[]
  warnings: string[]
  nativeCpsWarnings: number
  nativeLinesOver56: number
}

const r3 = (n: number) => Math.round(n * 1000) / 1000
/** Nearest-rank percentile, as stats.py. */
function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b)
  const k = Math.max(0, Math.min(s.length - 1, Math.round(p * s.length + 0.5) - 1))
  return s[k]!
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
function dist(xs: number[]): Dist {
  if (!xs.length) return { min: 0, median: 0, p95: 0, max: 0 }
  return { min: r3(Math.min(...xs)), median: r3(median(xs)), p95: r3(pct(xs, 0.95)), max: r3(Math.max(...xs)) }
}

export function statsFor(clip: PreparedClip, words?: Word[]): Stats {
  const cues = clip.cues
  const cps: number[] = [], lineChars: number[] = [], dur: number[] = [], gaps: number[] = []
  cues.forEach((q, i) => {
    const d = (q.endMs - q.startMs) / 1000
    const lines = q.text.split('\n')
    cps.push(lines.join('').length / d); dur.push(d); lineChars.push(...lines.map((l) => l.length))
    if (i + 1 < cues.length) gaps.push((cues[i + 1]!.startMs - q.endMs) / 1000)
  })
  let maxInnerGapS: number | null = null, cuesWithInnerPause: number | null = null
  if (words) {
    maxInnerGapS = 0; cuesWithInnerPause = 0
    for (const q of cues) {
      const inside = words.filter((w) => w.start * 1000 >= q.startMs - 1 && w.start * 1000 < q.endMs)
      let m = 0
      for (let k = 1; k < inside.length; k++) m = Math.max(m, inside[k]!.start - inside[k - 1]!.end)
      maxInnerGapS = Math.max(maxInnerGapS, r3(m))
      if (m > 1.0 + 1e-9) cuesWithInnerPause++
    }
  }
  const nat = clip.natives[0]!
  const tokens = cues.flatMap((q) => q.tokens)
  const covered = dur.reduce((a, b) => a + b, 0)
  return {
    slug: clip.slug, lang: clip.sourceLang, level: clip.level, coverageRank: clip.coverageRank, durationS: r3(clip.durationS),
    cues: cues.length, twoLineCues: cues.filter((q) => q.text.includes('\n')).length, tokens: tokens.length,
    cps: dist(cps), lineChars: dist(lineChars), durationSec: dist(dur), gapSec: dist(gaps),
    over17cps: cps.filter((x) => x > 17).length, under1_2s: dur.filter((x) => x < 1.2).length,
    exactly1s: dur.filter((x) => Math.abs(x - 1) < 1e-3).length, atLeast6s: dur.filter((x) => x >= 6).length,
    speechCoveredS: r3(covered), speechShare: r3(covered / clip.durationS),
    maxInnerGapS, cuesWithInnerPause,
    highlights: clip.highlights.map((h) => ({ word: h.word, lemma: h.lemma, rank: h.rank, cueIndex: h.cueIndex })),
    names: [...new Set(tokens.filter((t) => t.name).map((t) => t.word))].sort(),
    unrankedLemmas: [...new Set(tokens.filter((t) => t.rank === null && !t.name).map((t) => t.lemma))].sort(),
    warnings: clip.warnings,
    nativeCpsWarnings: clip.warnings.filter((w) => /^native \S+ c\d+ cps=/.test(w)).length,
    nativeLinesOver56: cues.flatMap((q) => (q.native[nat] ?? '').split('\n')).filter((l) => l.length > 56).length,
  }
}

const fmtDist = (d: Dist, digits = 2) => `min ${d.min.toFixed(digits)}  median ${d.median.toFixed(digits)}  p95 ${d.p95.toFixed(digits)}  max ${d.max.toFixed(digits)}`
export function printStats(s: Stats, log: (m: string) => void = console.log): void {
  log(`slug ${s.slug}  lang ${s.lang}  durationS ${s.durationS.toFixed(1)}  level ${s.level}  coverageRank ${s.coverageRank}`)
  log(`cues ${s.cues}  (two-line cues: ${s.twoLineCues})  tokens ${s.tokens}`)
  log(`  cps          ${fmtDist(s.cps)}`)
  log(`  line chars   ${fmtDist(s.lineChars, 0)}`)
  log(`  duration s   ${fmtDist(s.durationSec)}`)
  log(`  gap s        ${fmtDist(s.gapSec, 3)}`)
  log(`  cues > 17 cps: ${s.over17cps}   cues < 1.2 s: ${s.under1_2s}   cues at exactly 1.0 s: ${s.exactly1s}   cues ≥ 6 s: ${s.atLeast6s}`)
  log(`  speech covered by cues: ${s.speechCoveredS.toFixed(1)} s of ${s.durationS.toFixed(1)} s (${Math.round(100 * s.speechShare)} %)`)
  if (s.maxInnerGapS !== null) log(`  max word gap inside a cue: ${s.maxInnerGapS.toFixed(2)} s   cues with an inner gap > 1.0 s: ${s.cuesWithInnerPause}`)
  log(`highlights ${s.highlights.length}: ${s.highlights.map((h) => `${h.word}→${h.lemma}#${h.rank}@c${h.cueIndex}`).join(', ')}`)
  log(`names (${s.names.length}): ${s.names.join(', ')}`)
  log(`unranked non-name lemmas (${s.unrankedLemmas.length}): ${s.unrankedLemmas.slice(0, 80).join(', ')}`)
  log(`warnings (${s.warnings.length}), native cps warnings ${s.nativeCpsWarnings}, native lines > 56: ${s.nativeLinesOver56}`)
  for (const w of s.warnings) log(`  ${w}`)
}

/** The before/after rows of docs/plans/LING-001-quality.md §11. */
export function compareRows(before: Stats, after: Stats): Array<[string, string, string]> {
  const row = (k: string, f: (s: Stats) => string | number | null): [string, string, string] => [k, String(f(before)), String(f(after))]
  return [
    row('cues', (s) => s.cues), row('cues at exactly 1.0 s', (s) => s.exactly1s), row('cues < 1.2 s', (s) => s.under1_2s),
    row('max inner word gap s', (s) => s.maxInnerGapS), row('cues with inner gap > 1 s', (s) => s.cuesWithInnerPause), row('p95 cue gap s', (s) => s.gapSec.p95),
    row('cps p95 / max', (s) => `${s.cps.p95} / ${s.cps.max}`), row('level', (s) => s.level), row('coverageRank', (s) => s.coverageRank),
    row('highlights', (s) => `${s.highlights.length}: ${s.highlights.map((h) => `${h.lemma}#${h.rank}`).join(' ')}`),
    row('names', (s) => `${s.names.length}: ${s.names.join(' ')}`), row('unranked lemmas', (s) => `${s.unrankedLemmas.length}: ${s.unrankedLemmas.join(' ')}`),
    row('warnings', (s) => `${s.warnings.length}: ${s.warnings.map((w) => w.slice(0, 60)).join(' | ')}`),
  ]
}

const here = dirname(fileURLToPath(import.meta.url))
export const BASELINE = resolve(here, '..', 'test', 'fixtures', 'real', 'baseline-stats.json')
export const REAL_SETS: Array<{ name: string; lang: Lang; native: string; slug: string }> = [
  { name: 'real/friedlaender', lang: 'de', native: 'en', slug: 'friedlaender' }, { name: 'real/voa01', lang: 'en', native: 'de', slug: 'voa01' },
]

/** prepare() on a real fixture with the recorded doubles (no AWS, ffmpeg, packager or Python), in a temp work root. */
export async function realStats(set: (typeof REAL_SETS)[number]): Promise<Stats> {
  const workRoot = await mkdtemp(join(tmpdir(), 'lingo-stats-'))
  try {
    const r = await prepare({ slug: set.slug, source: 's3://unused', lang: set.lang, natives: [set.native], workRoot, publish: false, ai: false }, fixtureDeps(set.lang, { transcript: set.name }))
    const words = JSON.parse(await readFile(`${r.workDir}/words.json`, 'utf8')) as Word[]
    return statsFor(r.clip, words)
  } finally { await rm(workRoot, { recursive: true, force: true }) }
}

async function main() {
  const args = process.argv.slice(2)
  const files = args.filter((a) => !a.startsWith('--'))
  if (files.length) {
    for (const f of files) {
      const clip = PreparedClip.parse(JSON.parse(await readFile(f, 'utf8')))
      const wp = resolve(dirname(f), 'words.json')
      printStats(statsFor(clip, existsSync(wp) ? (JSON.parse(await readFile(wp, 'utf8')) as Word[]) : undefined))
    }
    return
  }
  const after: Record<string, Stats> = {}
  for (const set of REAL_SETS) after[set.name] = await realStats(set)
  if (args.includes('--write-baseline')) { await writeFile(BASELINE, JSON.stringify(after, null, 2) + '\n'); console.log(`wrote ${BASELINE}`); return }
  const before = existsSync(BASELINE) ? (JSON.parse(await readFile(BASELINE, 'utf8')) as Record<string, Stats>) : {}
  for (const set of REAL_SETS) {
    console.log(`\n=== ${set.name} (${set.lang} → ${set.native}), offline, fixture doubles ===`)
    printStats(after[set.name]!)
    const b = before[set.name]
    if (!b) { console.log('(no baseline)'); continue }
    console.log(`\n| ${set.name} | before | after |\n|---|---|---|`)
    for (const [k, x, y] of compareRows(b, after[set.name]!)) console.log(`| ${k} | ${x} | ${y} |`)
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
