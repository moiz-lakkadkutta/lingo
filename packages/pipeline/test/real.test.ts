/**
 * Regression expectations on the two real Transcribe fixtures (docs/decisions/0008 decision 13, docs/plans/LING-001-quality.md §10.1).
 * Provenance and licences: test/fixtures/real/README.md.
 */
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { GLUE_GAP_S, PAUSE_S, segmentWithReport, wrap2 } from '../src/segment'
import { qualityGate } from '../src/gate'
import { wordsFromTranscribe } from '../src/steps/transcribe'
import { prepare } from '../src/prepare'
import { fixtureDeps, REAL_DURATIONS } from '../src/fixtureDeps'
import { TranscribeJson, type Lang, type Word } from '../src/types'
import { FIXTURES } from '../scripts/gen-fixtures'

export function realWords(name: string, lang: Lang): Word[] {
  return wordsFromTranscribe(TranscribeJson.parse(JSON.parse(readFileSync(resolve(FIXTURES, 'real', `transcribe-${name}-${lang}.json`), 'utf8'))))
}
export function realSegments(name: string, lang: Lang) {
  const r = segmentWithReport(realWords(name, lang))
  return { ...r, cues: r.cues.map((c) => ({ ...c, text: wrap2(c.text) })) }
}
/** prepare() on a real fixture with the recorded doubles, publish: false, ai: false, in a temp work root. `deps` may override doubles. */
export async function realClip(name: string, lang: Lang, native: string, patch: (d: ReturnType<typeof fixtureDeps>) => void = () => {}) {
  const workRoot = await mkdtemp(join(tmpdir(), `lingo-real-${name}-`))
  const deps = fixtureDeps(lang, { transcript: `real/${name}`, durationS: REAL_DURATIONS[`real/${name}`] })
  patch(deps)
  try {
    const r = await prepare({ slug: name, source: 's3://unused', lang, natives: [native], workRoot, publish: false, ai: false }, deps)
    return { clip: r.clip, deps }
  } finally { await rm(workRoot, { recursive: true, force: true }) }
}

const flat = (t: string) => t.replace(/\n/g, ' ')
const wordCount = (t: string) => flat(t).split(' ').filter(Boolean).length
/** Largest gap between consecutive words whose start lies inside the cue. */
function innerGaps(cues: Array<{ startS: number; endS: number }>, words: Word[]): number[] {
  return cues.map((c) => {
    const inside = words.filter((w) => w.start >= c.startS - 1e-3 && w.start < c.endS)
    let m = 0
    for (let k = 1; k < inside.length; k++) m = Math.max(m, inside[k]!.start - inside[k - 1]!.end)
    return m
  })
}

describe('friedlaender de — segmentation', () => {
  const words = realWords('friedlaender', 'de')
  const { cues, dropped, repairedStops } = realSegments('friedlaender', 'de')
  const texts = cues.map((c) => flat(c.text))
  it('passes the quality gate', () => { expect(qualityGate(cues)).toEqual([]) })
  it('drops nothing and repairs three hesitation stops', () => {
    expect(dropped).toEqual([])
    expect(repairedStops).toBe(3) // hat. ×2, gehen. — deutsch., Kartoffeln., Toten., erfahren., Man hat., Ich habe am., aber., Dann., als. keep theirs
  })
  it('never spans a word gap above GLUE_GAP_S and never a pause above PAUSE_S without gluing', () => {
    const gaps = innerGaps(cues, words)
    for (const g of gaps) expect(g).toBeLessThanOrEqual(GLUE_GAP_S)
    expect(gaps.filter((g) => g > PAUSE_S).length).toBeLessThanOrEqual(3)
  })
  it('leaves no one- or two-word cue except the clause "ohne rauszugehen."', () => {
    expect(cues.filter((c) => wordCount(c.text) <= 2).map((c) => flat(c.text))).toEqual(['ohne rauszugehen.'])
  })
  it('attaches the hesitation "hat" to the clause that follows', () => {
    expect(texts.some((t) => t.startsWith('hat man die Papiere angeguckt'))).toBe(true)
    expect(texts.some((t) => t.includes('hat im Ersten Weltkrieg'))).toBe(true)
    expect(texts).not.toContain('hat.')
  })
  it('keeps "Berlin." with its sentence at the 7 s limit', () => {
    expect(texts.some((t) => /kannst du auch in Berlin\.$/.test(t))).toBe(true)
    expect(texts).not.toContain('Berlin.')
  })
  it('pads no cue to exactly 1.0 s except true isolates', () => {
    expect(cues.filter((c) => Math.abs(c.endS - c.startS - 1) <= 0.001).length).toBeLessThanOrEqual(1)
  })
  it('cue count lies between 48 and 58', () => {
    expect(cues.length).toBeGreaterThanOrEqual(48); expect(cues.length).toBeLessThanOrEqual(58)
  })
})

describe('voa01 en — segmentation', () => {
  const words = realWords('voa01', 'en')
  const { cues, dropped } = realSegments('voa01', 'en')
  const texts = cues.map((c) => flat(c.text))
  it('drops the two sound-effect cues "00." as nonverbal', () => {
    const zeros = dropped.filter((d) => d.text === '00.')
    expect(zeros.length).toBe(2)
    for (const d of zeros) expect(d.reason).toBe('nonverbal')
    expect(texts.some((t) => t.includes('00.') && !/1400/.test(t))).toBe(false)
  })
  it('never bridges the lesson\'s silences', () => {
    for (const g of innerGaps(cues, words)) expect(g).toBeLessThanOrEqual(GLUE_GAP_S)
    expect(texts.some((t) => /\bHi\b/.test(t) && /\bSpeak\b/.test(t))).toBe(false)
    expect(texts.some((t) => t.includes('Speak Speak'))).toBe(false)
  })
  it('keeps "Say your name" in one cue', () => {
    expect(texts.some((t) => /Say your name/.test(t))).toBe(true)
    expect(texts).not.toContain('name')
  })
  it('keeps the spelled name in one cue', () => {
    expect(texts.filter((t) => /A N N A\./.test(t)).length).toBeGreaterThanOrEqual(2)
  })
  it('passes the quality gate', () => { expect(qualityGate(cues)).toEqual([]) })
})

describe('voa01 en — clip', () => {
  let clip: Awaited<ReturnType<typeof realClip>>['clip']
  beforeAll(async () => { ({ clip } = await realClip('voa01', 'en', 'de')) })
  const tokens = () => clip.cues.flatMap((c) => c.tokens)
  it('names-en has none of the lesson\'s UI words or contractions', () => {
    const names = new Set(tokens().filter((t) => t.name).map((t) => t.word))
    for (const w of ['Listen', 'Speak', 'Say', 'Now', 'Nice', 'Fast', 'A', 'An', 'N', "N's", "Let's", "Here's", "I'm", 'Apartment', 'Record', 'Street']) expect(names.has(w), w).toBe(false)
  })
  it('names-en has Pete, Anna, Ana, Irving', () => {
    for (const w of ['Pete', 'Anna', 'Ana', 'Irving']) {
      const occ = tokens().filter((t) => t.word === w)
      expect(occ.length, w).toBeGreaterThan(0)
      for (const t of occ) expect(t.name, `${w} sentenceInitial=${t.sentenceInitial}`).toBe(true)
    }
  })
  it('I\'m carries the rank of "i"', () => {
    const ims = tokens().filter((t) => t.word === "I'm")
    expect(ims.length).toBeGreaterThan(0)
    for (const t of ims) { expect(t.rank).not.toBeNull(); expect(t.rank!).toBeLessThan(100) }
  })
})
