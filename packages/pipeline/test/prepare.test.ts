import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PreparedClip } from '@lingo/contracts'
import { prepare } from '../src/prepare'
import { fixtureDeps } from '../src/fixtureDeps'
import { BANDS, NEXT } from '../src/highlights'
import { checkVtt, LINT_LIMITS } from '../src/vtt'
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
  it('highlights cover ≤ 40 % of cues, ≤ 2 per cue, none are names or contain digits, all ranks lie in the band above the clip level', () => {
    const [lo, hi] = BANDS[NEXT[clip.level]]
    const perCue = new Map<number, number>()
    for (const h of clip.highlights) {
      perCue.set(h.cueIndex, (perCue.get(h.cueIndex) ?? 0) + 1)
      expect(h.rank).toBeGreaterThanOrEqual(lo); expect(h.rank).toBeLessThan(hi)
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
      const { cues, findings } = checkVtt(vtt, code)
      expect(findings).toEqual([])
      expect(lintCues(cues, LINT_LIMITS)).toEqual([])
      expect(cues.map((c) => c.id)).toEqual(clip.cues.map((c) => `c${c.index}`))
      expect(cues.map((c) => Math.round(c.start * 1000))).toEqual(clip.cues.map((c) => c.startMs))
      expect(cues.map((c) => Math.round(c.end * 1000))).toEqual(clip.cues.map((c) => c.endMs))
    }
    expect(clip.warnings).toEqual([])
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
