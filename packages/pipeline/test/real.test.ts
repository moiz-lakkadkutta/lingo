/**
 * Regression expectations on the two real Transcribe fixtures (docs/decisions/0008 decision 13, docs/plans/LING-001-quality.md §10.1).
 * Provenance and licences: test/fixtures/real/README.md.
 */
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { segmentWithReport, wrap2 } from '../src/segment'
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

describe('friedlaender de — segmentation', () => {
  const { cues } = realSegments('friedlaender', 'de')
  it('passes the quality gate', () => { expect(qualityGate(cues)).toEqual([]) })
})

describe('voa01 en — segmentation', () => {
  const { cues } = realSegments('voa01', 'en')
  it('passes the quality gate', () => { expect(qualityGate(cues)).toEqual([]) })
})
