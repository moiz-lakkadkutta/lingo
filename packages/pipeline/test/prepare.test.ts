import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PreparedClip } from '@lingo/contracts'
import { prepare } from '../src/prepare'
import { fixtureDeps } from '../src/fixtureDeps'
import { BANDS, NEXT } from '../src/highlights'
import { isDualText } from '../src/segment'
import { checkVtt, cuesToVtt, LINT_LIMITS, NATIVE_LINT_LIMITS } from '../src/vtt'
import { parseVtt, lintCues } from '@moizp/vega-media-kit/core'
import { TranscribeJson, type Lang } from '../src/types'

describe.each([['de', 'en'], ['en', 'de']] as Array<[Lang, string]>)('prepare %s → %s', (lang, native) => {
  let deps: ReturnType<typeof fixtureDeps>
  let result: Awaited<ReturnType<typeof prepare>>
  let clip: PreparedClip
  let workRoot: string
  beforeAll(async () => {
    workRoot = await mkdtemp(join(tmpdir(), 'lingo-prepare-'))
    deps = fixtureDeps(lang)
    result = await prepare({ slug: `demo-${lang}`, source: `s3://lingo-media/clips/demo-${lang}.mp4`, lang, natives: [native], workRoot, bucket: 'lingo-media', cloudfrontDomain: 'd111.cloudfront.net' }, deps)
    clip = PreparedClip.parse(JSON.parse(await readFile(result.files.clipJson, 'utf8')))
  })
  afterAll(async () => { await rm(workRoot, { recursive: true, force: true }) })

  it('writes clip.json that parses as PreparedClip with version 1, sourceLang and natives', () => {
    expect(clip.version).toBe(1); expect(clip.sourceLang).toBe(lang); expect(clip.natives).toEqual([native]); expect(clip.slug).toBe(`demo-${lang}`)
    expect(clip).toEqual(result.clip)
    expect(clip.tracks).toEqual({ manifest: 'master.m3u8', vtt: { [lang]: `vtt/${lang}.vtt`, [native]: `vtt/${native}.vtt` } })
    expect(clip.source.transcribeJob).toBe(`demo-${lang}-20260915-120000`)
    expect(clip.generated).toEqual({ at: '2026-09-15T12:00:00.000Z', pipeline: 'lingo-pipeline@0.1.0', lemmatizer: 'table', ai: true })
    expect(clip.durationS).toBeGreaterThan(55)
    expect(clip.publishedBase).toBe(`https://d111.cloudfront.net/published/demo-${lang}`)
  })
  it('every cue is ≤ 84 chars, ≤ 2 lines of ≤ 42, 1–7 s, ≤ 20 cps', () => {
    for (const c of clip.cues) {
      const lines = c.text.split('\n')
      expect(c.text.replace('\n', ' ').length).toBeLessThanOrEqual(84)
      expect(lines.length).toBeLessThanOrEqual(2)
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(42)
      const dur = (c.endMs - c.startMs) / 1000
      expect(dur).toBeGreaterThanOrEqual(1); expect(dur).toBeLessThanOrEqual(7)
      expect(lines.join('').length / dur).toBeLessThanOrEqual(20)
    }
  })
  it('consecutive cues are ≥ 84 ms apart and monotonic', () => {
    for (let i = 0; i < clip.cues.length - 1; i++) {
      expect(clip.cues[i + 1]!.startMs - clip.cues[i]!.endMs).toBeGreaterThanOrEqual(84)
      expect(clip.cues[i + 1]!.startMs).toBeGreaterThan(clip.cues[i]!.startMs)
      expect(clip.cues[i]!.index).toBe(i)
    }
  })
  it('native cues align 1:1 by index with identical timestamps', async () => {
    const target = parseVtt(await readFile(result.files.vtt[lang]!, 'utf8'), { trackId: lang, minDuration: 0, mergeGap: 0 })
    const nat = parseVtt(await readFile(result.files.vtt[native]!, 'utf8'), { trackId: native, minDuration: 0, mergeGap: 0 })
    expect(nat.length).toBe(target.length); expect(target.length).toBe(clip.cues.length)
    for (let i = 0; i < target.length; i++) {
      expect(nat[i]!.id).toBe(target[i]!.id); expect(nat[i]!.start).toBe(target[i]!.start); expect(nat[i]!.end).toBe(target[i]!.end)
      expect(clip.cues[i]!.native[native]!.replace(/\n/g, ' ')).toBe(clip.cues[i]!.text.replace(/\n/g, ' ').toUpperCase())
      expect(nat[i]!.text).toBe(clip.cues[i]!.native[native])
    }
  })
  it('highlights cover ≤ 40 % of cues, ≤ 2 per cue, none are names or contain digits, all ranks are at or above the floor of the band above the clip level', () => {
    const [lo] = BANDS[NEXT[clip.level]]
    const perCue = new Map<number, number>()
    for (const h of clip.highlights) {
      perCue.set(h.cueIndex, (perCue.get(h.cueIndex) ?? 0) + 1)
      expect(h.rank).toBeGreaterThanOrEqual(lo)
      expect(h.word).not.toMatch(/\d/)
      const tok = clip.cues[h.cueIndex]!.tokens.find((t) => t.word === h.word)!
      expect(tok.name).toBe(false)
      expect(h.gloss).toBe(`gloss of ${h.lemma}`); expect(h.example).toBe(`Example with ${h.word}.`)
      expect(['Anna', 'Berlin', 'Sarah', 'London']).not.toContain(h.word)
    }
    expect(perCue.size).toBeLessThanOrEqual(Math.floor(clip.cues.length * 0.4))
    for (const n of perCue.values()) expect(n).toBeLessThanOrEqual(2)
    expect(new Set(clip.highlights.map((h) => h.lemma)).size).toBe(clip.highlights.length)
  })
  it('at least one highlight is produced', () => { expect(clip.highlights.length).toBeGreaterThanOrEqual(1) })
  it('the clip level is A1 or A2 for this dialogue', () => { expect(['A1', 'A2']).toContain(clip.level); expect(clip.coverageRank).toBeLessThan(2000) })
  it('both VTT files round-trip through parseVtt and pass lintCues with zero findings', async () => {
    for (const code of [lang, native]) {
      const vtt = await readFile(result.files.vtt[code]!, 'utf8')
      // the target track lints at 2 × 42 / 20 cps, the native track at its own budget 2 × 56 / 26 cps (docs/decisions/0007 M4)
      const limits = code === lang ? LINT_LIMITS : NATIVE_LINT_LIMITS
      const { cues, findings } = checkVtt(vtt, code, limits)
      expect(findings).toEqual([])
      expect(lintCues(cues, limits)).toEqual([])
      expect(cues.map((c) => c.id)).toEqual(clip.cues.map((c) => `c${c.index}`))
      expect(cues.map((c) => Math.round(c.start * 1000))).toEqual(clip.cues.map((c) => c.startMs))
      expect(cues.map((c) => Math.round(c.end * 1000))).toEqual(clip.cues.map((c) => c.endMs))
    }
    expect(clip.warnings.filter((w) => !w.startsWith('review: '))).toEqual([]) // review: lines are the 0008 tail guard (advisory)
  })
  it('records the normalize, packager and publish exec calls with the expected argv', () => {
    const argv = deps.calls.map((c) => [c.cmd, ...c.args].map((a) => a.split(workRoot).join('<workRoot>')))
    expect(argv).toMatchSnapshot()
    expect(deps.calls.map((c) => (c.cmd === 'aws' ? `aws ${c.args[0]} ${c.args[1]}` : c.cmd))).toEqual([
      'aws s3 cp', 'ffprobe', 'ffmpeg', 'packager', 'aws s3 sync', 'aws s3 cp', 'aws s3 cp', 'aws s3 cp', 'aws s3 cp',
    ])
  })
  it('with publish: false no aws upload calls are made and publishedBase is null', async () => {
    const d = fixtureDeps(lang)
    const r = await prepare({ slug: `local-${lang}`, source: 's3://unused', lang, natives: [native], workRoot, publish: false }, d)
    expect(r.clip.publishedBase).toBeNull()
    expect(d.calls.map((c) => c.cmd)).toEqual(['aws', 'ffprobe', 'ffmpeg', 'packager'])
    expect(d.calls[0]!.args.slice(0, 2)).toEqual(['s3', 'cp'])
    expect(JSON.parse(await readFile(r.files.clipJson, 'utf8')).publishedBase).toBeNull()
  })
  it("every cue's tokens carry lemma, rank|null, name and sentenceInitial; no token text contains whitespace", () => {
    let total = 0
    for (const c of clip.cues) {
      expect(c.tokens.length).toBeGreaterThan(0)
      expect(c.tokens[0]!.sentenceInitial).toBe(true) // every cue in these fixtures starts a sentence
      for (const t of c.tokens) {
        total++
        expect(t.word).not.toMatch(/\s/); expect(t.lemma).not.toMatch(/\s/); expect(t.lemma.length).toBeGreaterThan(0)
        expect(t.rank === null || (Number.isInteger(t.rank) && t.rank > 0)).toBe(true)
        expect(typeof t.name).toBe('boolean'); expect(typeof t.sentenceInitial).toBe('boolean')
        expect(c.text.replace(/\n/g, ' ')).toContain(t.word)
      }
    }
    expect(total).toBeGreaterThan(120)
    const names = clip.cues.flatMap((c) => c.tokens).filter((t) => t.name).map((t) => t.word)
    for (const n of lang === 'de' ? ['Anna', 'Berlin'] : ['Sarah', 'London']) expect(names).toContain(n)
    const all = clip.cues.flatMap((c) => c.tokens)
    expect(all.find((t) => t.word === (lang === 'de' ? 'Stunden' : 'hours'))!.lemma).toBe(lang === 'de' ? 'Stunde' : 'hour')
    expect(all.find((t) => t.word === (lang === 'de' ? 'Warte' : 'Wait'))!.lemma).toBe(lang === 'de' ? 'warten' : 'wait')
  })
  it('throws (assertGate) when the segmenter output is tampered to 25 cps', async () => {
    const d = fixtureDeps(lang)
    const sentence = lang === 'de' ? 'Ich habe dreimal angerufen und niemand hat abgenommen, also bin ich hierher gekommen.' : 'I called you three times and nobody answered, so in the end I just walked all the way here.'
    d.transcribe = async () => TranscribeJson.parse({ results: { transcripts: [{ transcript: sentence }], items: sentence.split(' ').map((w, i) => ({ type: 'pronunciation', start_time: (i * 0.02).toFixed(2), end_time: (i * 0.02 + 0.015).toFixed(3), alternatives: [{ content: w }] })) } })
    await expect(prepare({ slug: `fast-${lang}`, source: 's3://unused', lang, natives: [native], workRoot, publish: false }, d)).rejects.toThrow(/cps/)
    // docs/decisions/0007: the target VTT and the gate report are on disk before the gate fails, and the error names the correction path
    const work = `${workRoot}/fast-${lang}`
    expect(existsSync(`${work}/${lang}.vtt`)).toBe(true)
    const report = JSON.parse(await readFile(`${work}/gate.json`, 'utf8')) as { findings: Array<{ problem: string; text: string; startS: number }>; dropped: unknown[] }
    expect(report.findings[0]!.problem).toBe('cps')
    expect(typeof report.findings[0]!.text).toBe('string'); expect(report.findings[0]!.text.length).toBeGreaterThan(0)
    expect(typeof report.findings[0]!.startS).toBe('number')
    await expect(prepare({ slug: `fast-${lang}`, source: 's3://unused', lang, natives: [native], workRoot, publish: false }, d)).rejects.toThrow(new RegExp(`--cues ${work}/${lang}\\.vtt`))
  })
  it('with cues: skips Transcribe and segmentation, re-wraps a single-line cue, keeps a written line break, and tokens follow the edited text', async () => {
    const slug = `edit-${lang}`
    const first = await prepare({ slug, source: 's3://unused', lang, natives: [native], workRoot, publish: false }, fixtureDeps(lang))
    const path = first.files.vtt[lang]!
    const cues = parseVtt(await readFile(path, 'utf8'), { trackId: lang, minDuration: 0, mergeGap: 0 }).map((c) => ({ text: c.text, startS: c.start, endS: c.end }))
    const joined = cues.findIndex((c) => c.text.includes('\n'))
    const broken = cues.findIndex((c, i) => i !== joined && !c.text.includes('\n') && c.text.split(' ').length >= 3)
    const cut = cues.findIndex((c, i) => i !== joined && i !== broken && !c.text.includes('\n') && c.text.split(' ').length >= 5)
    expect(Math.min(joined, broken, cut)).toBeGreaterThanOrEqual(0)
    const wrappedOriginal = cues[joined]!.text
    cues[joined]!.text = wrappedOriginal.replace('\n', ' ')
    cues[broken]!.text = cues[broken]!.text.replace(' ', '\n')
    const brokenText = cues[broken]!.text
    const cutWords = cues[cut]!.text.split(' ')
    const k = cutWords.findIndex((w, i) => i > 0 && i < cutWords.length - 1 && /^[\p{L}]+$/u.test(w) && cutWords.filter((x) => x === w).length === 1)
    expect(k).toBeGreaterThan(0)
    const deleted = cutWords[k]!
    cues[cut]!.text = cutWords.filter((_, i) => i !== k).join(' ')
    await writeFile(path, cuesToVtt(cues.map((c, index) => ({ index, ...c })), lang))
    const d = fixtureDeps(lang)
    const transcribe = vi.fn(d.transcribe); d.transcribe = transcribe
    const r = await prepare({ slug, source: 's3://unused', lang, natives: [native], workRoot, publish: false, cues: path }, d)
    expect(transcribe).not.toHaveBeenCalled()
    expect(r.clip.source.transcribeJob).toBe(first.clip.source.transcribeJob)
    expect(r.clip.cues.length).toBe(cues.length)
    expect(r.clip.cues[joined]!.text).toBe(wrappedOriginal)
    expect(r.clip.cues[broken]!.text).toBe(brokenText)
    expect(r.clip.cues[cut]!.text).toBe(cues[cut]!.text)
    expect(r.clip.cues[cut]!.tokens.map((t) => t.word)).not.toContain(deleted)
    expect(first.clip.cues[cut]!.tokens.map((t) => t.word)).toContain(deleted)
    for (const c of r.clip.cues) for (const t of c.tokens) expect(c.text.replace(/\n/g, ' ')).toContain(t.word)
  })
  it('with cues: reuses mezz.mp4 when present and runs ffprobe only', async () => {
    const slug = `reuse-${lang}`
    await mkdir(`${workRoot}/${slug}`, { recursive: true })
    await writeFile(`${workRoot}/${slug}/mezz.mp4`, '')
    const d = fixtureDeps(lang)
    const r = await prepare({ slug, source: 's3://unused', lang, natives: [native], workRoot, publish: false, cues: result.files.vtt[lang]! }, d)
    expect(d.calls.map((c) => c.cmd)).toEqual(['ffprobe', 'packager'])
    expect(d.calls[0]!.args.at(-1)).toBe(`${workRoot}/${slug}/mezz.mp4`)
    expect(r.clip.source.transcribeJob).toBeNull() // no transcript.json in this work dir
    expect(r.clip.cues.map((c) => c.text)).toEqual(clip.cues.map((c) => c.text))
  })
  it('with reuse: takes transcript.json and mezz.mp4 from the work dir and calls neither transcribe, aws s3 cp nor ffmpeg', async () => {
    const slug = `rerun-${lang}`
    const first = await prepare({ slug, source: 's3://unused', lang, natives: [native], workRoot, publish: false }, fixtureDeps(lang))
    await writeFile(`${workRoot}/${slug}/mezz.mp4`, '') // the fixture exec double does not write the mezzanine
    const d = fixtureDeps(lang)
    const transcribe = vi.fn(d.transcribe); d.transcribe = transcribe
    const log = vi.fn(); d.log = log
    const r = await prepare({ slug, source: 's3://unused', lang, natives: [native], workRoot, publish: false, reuse: true }, d)
    expect(transcribe).not.toHaveBeenCalled()
    expect(d.calls.map((c) => c.cmd)).toEqual(['ffprobe', 'packager'])
    expect(r.clip.source.transcribeJob).toBe(first.clip.source.transcribeJob)
    expect(r.clip.cues).toEqual(first.clip.cues)
    expect(log.mock.calls.some(([m]) => /transcript reused/.test(m))).toBe(true)
  })
  it('logs a timing line per step', async () => {
    const d = fixtureDeps(lang)
    const log = vi.fn(); d.log = log
    await prepare({ slug: `timed-${lang}`, source: 's3://unused', lang, natives: [native], workRoot, publish: false }, d)
    const timed = log.mock.calls.map(([m]) => m as string).filter((m) => /^\[\d+\.\d s\] /.test(m))
    expect(timed.length).toBeGreaterThanOrEqual(6)
    for (const step of ['media', 'transcribed', 'segmented', 'translated', 'lemmatized', 'highlights', 'packaged']) expect(timed.some((m) => m.includes(step)), step).toBe(true)
  })
  it('prints every warning through deps.log', async () => {
    const d = fixtureDeps(lang)
    d.translate = async (t) => t.toUpperCase() + ' ' + 'x'.repeat(60)
    const log = vi.fn(); d.log = log
    const r = await prepare({ slug: `warned-${lang}`, source: 's3://unused', lang, natives: [native], workRoot, publish: false }, d)
    const lines = log.mock.calls.map(([m]) => m as string)
    expect(r.clip.warnings.length).toBeGreaterThan(0)
    for (const w of r.clip.warnings) expect(lines).toContain(`warning: ${w}`)
    expect(lines.some((m) => /^warning: native /.test(m))).toBe(true)
  })
  it('native lines are wrapped at 56 and a 15-char-longer translation produces no layout warning', async () => {
    const d = fixtureDeps(lang)
    d.translate = async (t) => t.toUpperCase() + ' ab ab ab ab ab'
    const r = await prepare({ slug: `long-${lang}`, source: 's3://unused', lang, natives: [native], workRoot, publish: false }, d)
    for (const c of r.clip.cues) {
      const lines = c.native[native]!.split('\n')
      expect(lines.length).toBeLessThanOrEqual(2)
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(56)
    }
    for (const c of r.clip.cues) expect(c.native[native]!.replace(/\n/g, ' ')).toBe(c.text.replace(/\n/g, ' ').toUpperCase() + ' ab ab ab ab ab')
    // no layout warning; short cues + 15 chars can pass 26 cps, which stays a warning by design (docs/decisions/0007 M4)
    expect(r.clip.warnings.filter((w) => !/^native \S+ c\d+ cps=/.test(w) && !w.startsWith('review: '))).toEqual([])
  })
  it('a native line that cannot be wrapped under 56 is a warning, not a failure', async () => {
    const d = fixtureDeps(lang)
    d.translate = async (t) => t.toUpperCase() + ' ' + 'x'.repeat(60)
    const r = await prepare({ slug: `toolong-${lang}`, source: 's3://unused', lang, natives: [native], workRoot, publish: false }, d)
    expect(r.clip.warnings.length).toBeGreaterThan(0)
    expect(r.clip.warnings.some((w) => /native .* lineLength=/.test(w))).toBe(true)
  })
  it('gloss and quiz doubles are called with (word, lemma, cue, lang, native, level)', async () => {
    const d = fixtureDeps(lang)
    const gloss = vi.fn(d.gloss), quiz = vi.fn(d.quiz)
    d.gloss = gloss; d.quiz = quiz
    const r = await prepare({ slug: `spy-${lang}`, source: 's3://unused', lang, natives: [native], workRoot, publish: false }, d)
    expect(gloss).toHaveBeenCalledTimes(r.clip.highlights.length)
    for (const h of r.clip.highlights) expect(gloss).toHaveBeenCalledWith(h.word, h.lemma, r.clip.cues[h.cueIndex]!.text, lang, native, r.clip.level)
    expect(quiz).toHaveBeenCalledTimes(1)
    const [cues, l, n] = quiz.mock.calls[0]!
    expect(l).toBe(lang); expect(n).toBe(native); expect(cues.length).toBe(r.clip.cues.length)
    expect(cues[0]).toEqual({ index: 0, text: r.clip.cues[0]!.text, native: r.clip.cues[0]!.native[native], highlights: r.clip.highlights.filter((h) => h.cueIndex === 0).map((h) => ({ word: h.word, gloss: h.gloss })) })
  })
  it('--no-ai never calls gloss or quiz', async () => {
    const d = fixtureDeps(lang)
    const gloss = vi.fn(d.gloss), quiz = vi.fn(d.quiz)
    d.gloss = gloss; d.quiz = quiz
    const r = await prepare({ slug: `noai-${lang}`, source: 's3://unused', lang, natives: [native], workRoot, publish: false, ai: false }, d)
    expect(gloss).not.toHaveBeenCalled(); expect(quiz).not.toHaveBeenCalled()
    expect(r.clip.highlights.length).toBeGreaterThanOrEqual(1)
    expect(r.clip.highlights.map((h) => ({ ...h }))).toEqual(clip.highlights.map(({ cueIndex, word, lemma, rank }) => ({ cueIndex, word, lemma, rank })))
  })
  it('output with no AI fields still parses as PreparedClip', async () => {
    const r = await prepare({ slug: `noai2-${lang}`, source: 's3://unused', lang, natives: [native], workRoot, publish: false, ai: false }, fixtureDeps(lang))
    const json = JSON.parse(await readFile(r.files.clipJson, 'utf8')) as Record<string, unknown> & { highlights: Array<Record<string, unknown>> }
    expect(json.quiz).toBeUndefined()
    expect(json.generated).toMatchObject({ ai: false })
    for (const h of json.highlights) { expect(h).not.toHaveProperty('gloss'); expect(h).not.toHaveProperty('grammar'); expect(h).not.toHaveProperty('example') }
    const parsed = PreparedClip.parse(json)
    expect(parsed.cues.length).toBe(clip.cues.length); expect(parsed.level).toBe(clip.level); expect(parsed.coverageRank).toBe(clip.coverageRank)
    expect(await readFile(r.files.vtt[lang]!, 'utf8')).toBe(await readFile(result.files.vtt[lang]!, 'utf8'))
  })
  it('attaches deps.cost() as clip.cost when the deps provide it, and omits cost otherwise', async () => {
    const logs: string[] = []
    const cost = { calls: 17, cachedCalls: 3, inputTokens: 17000, outputTokens: 2700, usd: 0.001668 }
    const r = await prepare({ slug: `cost-${lang}`, source: 's3://unused', lang, natives: [native], workRoot, publish: false }, { ...fixtureDeps(lang), cost: () => cost, log: (m: string) => logs.push(m) })
    expect(r.clip.cost).toEqual(cost)
    expect(JSON.parse(await readFile(r.files.clipJson, 'utf8')).cost).toEqual(cost)
    expect(logs.at(-1)).toMatch(/, cost \$0\.0017 \(17 calls, 3 cached\)$/)
    expect(clip).not.toHaveProperty('cost')
    expect(JSON.parse(await readFile(result.files.clipJson, 'utf8'))).not.toHaveProperty('cost')
    const plain: string[] = []
    await prepare({ slug: `nocost-${lang}`, source: 's3://unused', lang, natives: [native], workRoot, publish: false }, { ...fixtureDeps(lang), log: (m: string) => plain.push(m) })
    expect(plain.at(-1)).not.toContain('cost $')
  })
})

describe('prepare: overlapping speakers (docs/decisions/0007)', () => {
  let workRoot: string
  beforeAll(async () => { workRoot = await mkdtemp(join(tmpdir(), 'lingo-overlap-')) })
  afterAll(async () => { await rm(workRoot, { recursive: true, force: true }) })
  it('overlap fixture: clip.json passes every limit, has 12 cues, two hyphenated two-speaker cues, no token contains a leading hyphen, and exactly 3 "dropped cue" warnings', async () => {
    const r = await prepare({ slug: 'overlap-de', source: 's3://unused', lang: 'de', natives: ['en'], workRoot, publish: false }, fixtureDeps('de', { transcript: 'overlap' }))
    const clip = PreparedClip.parse(JSON.parse(await readFile(r.files.clipJson, 'utf8')))
    expect(clip.cues.length).toBe(12)
    for (const c of clip.cues) {
      const lines = c.text.split('\n'), dur = (c.endMs - c.startMs) / 1000
      expect(lines.length).toBeLessThanOrEqual(2); for (const l of lines) expect(l.length).toBeLessThanOrEqual(42)
      expect(dur).toBeGreaterThanOrEqual(1); expect(dur).toBeLessThanOrEqual(7); expect(lines.join('').length / dur).toBeLessThanOrEqual(20)
    }
    for (let i = 0; i < clip.cues.length - 1; i++) expect(clip.cues[i + 1]!.startMs - clip.cues[i]!.endMs).toBeGreaterThanOrEqual(84)
    const dual = clip.cues.filter((c) => isDualText(c.text))
    expect(dual.map((c) => c.text)).toEqual(['-Genau.\n-Aber was ist mit den Kosten?', '-Nein, nein, nein, warte mal kurz!\n-Okay, okay.'])
    for (const c of dual) expect(c.native.en).toBe(c.text.toUpperCase()) // translated line by line, hyphens kept
    expect(clip.cues.flatMap((c) => c.tokens).some((t) => t.word.startsWith('-'))).toBe(false)
    expect(dual[0]!.tokens.find((t) => t.word === 'Aber')!.sentenceInitial).toBe(true)
    expect(clip.warnings.filter((w) => w.startsWith('dropped cue ')).length).toBe(3)
    expect(clip.warnings.filter((w) => !w.startsWith('review: ')).length).toBe(3)
    for (const f of ['de.vtt', 'native-en.vtt', 'dropped.vtt', 'gate.json']) expect(existsSync(`${r.workDir}/${f}`)).toBe(true)
    const report = JSON.parse(await readFile(`${r.workDir}/gate.json`, 'utf8')) as { findings: unknown[]; dropped: Array<{ text: string; reason: string }> }
    expect(report.findings).toEqual([])
    expect(report.dropped.map((d) => [d.text, d.reason])).toEqual([['Ja.', 'unplaceable'], ['Ja.', 'interjection'], ['Mhm.', 'interjection']])
    const droppedVtt = parseVtt(await readFile(`${r.workDir}/dropped.vtt`, 'utf8'), { trackId: 'de', minDuration: 0, mergeGap: 0 })
    expect(droppedVtt.map((c) => c.text)).toEqual(['Ja.', 'Ja.', 'Mhm.'])
    expect(checkVtt(await readFile(r.files.vtt.de!, 'utf8'), 'de').findings).toEqual([])
  })
})

describe('prepare: vttNote (BY-SA, docs/content.md §5)', () => {
  it('writes the NOTE into the target and native VTTs but not dropped.vtt, and the cues are unchanged', async () => {
    const workRoot = await mkdtemp(join(tmpdir(), 'lingo-note-'))
    try {
      const note = 'CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0 — Test Credit. Subtitles and translations by Lingo, same licence.'
      const plain = await prepare({ slug: 'plain-de', source: 's3://unused', lang: 'de', natives: ['en'], workRoot, publish: false }, fixtureDeps('de', { transcript: 'overlap' }))
      const noted = await prepare({ slug: 'noted-de', source: 's3://unused', lang: 'de', natives: ['en'], workRoot, publish: false, vttNote: note }, fixtureDeps('de', { transcript: 'overlap' }))
      for (const f of ['de.vtt', 'native-en.vtt']) {
        const v = await readFile(`${noted.workDir}/${f}`, 'utf8')
        expect(v.startsWith(`WEBVTT\n\nNOTE ${note}\n\n`)).toBe(true)
        expect(v.replace(`NOTE ${note}\n\n`, '')).toBe(await readFile(`${plain.workDir}/${f}`, 'utf8'))
      }
      expect(await readFile(`${noted.workDir}/dropped.vtt`, 'utf8')).not.toContain('NOTE')
      expect(noted.clip.cues).toEqual(plain.clip.cues)
    } finally { await rm(workRoot, { recursive: true, force: true }) }
  })
})
