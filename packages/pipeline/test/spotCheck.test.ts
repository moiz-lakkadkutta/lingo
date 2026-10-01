import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import type { ConverseCommandInput } from '@aws-sdk/client-bedrock-runtime'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PreparedClip } from '@lingo/contracts'
import { prepare } from '../src/prepare'
import { fixtureDeps, fixtureSend } from '../src/fixtureDeps'
import { loadFreqList, rankFn } from '../src/freq'
import { isNumeral } from '../src/highlights'
import { createAi } from '../src/ai/index'
import { runSpotCheck, spotCheckCandidates } from '../src/spotCheck'

let root: string
let clipJson: string
let clip: PreparedClip
let rank: (lemma: string) => number | undefined
/** The 60 s fixture dialogue is A1 with only a handful of words above its band; shifting every rank by 1000 (1000 placeholder lines first)
 *  moves its A1 words into the A2 band so the widening reaches 15, as it will on a 6-minute real clip. */
let shifted: string[]
let shiftedRank: (lemma: string) => number | undefined
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lingo-spot-'))
  // as on the real clips: a --no-ai clip.json (no glosses, no quiz)
  const r = await prepare({ slug: 'demo-de', source: 's3://unused', lang: 'de', natives: ['en'], workRoot: root, publish: false, ai: false }, fixtureDeps('de'))
  clipJson = r.files.clipJson
  clip = r.clip
  const list = await loadFreqList('de')
  rank = rankFn(list)
  shifted = [...Array.from({ length: 1000 }, (_, i) => `zzplaceholder${i}`), ...list]
  shiftedRank = rankFn(shifted)
})
afterAll(async () => { await rm(root, { recursive: true, force: true }) })

const spot = async (perClip: number | undefined, name: string, logs: string[] = []) => {
  const send = vi.fn(fixtureSend())
  const ai = createAi({ send, cacheDir: join(root, `cache-${name}`), log: (m) => logs.push(m) })
  const out = join(root, `${name}.md`)
  const result = await runSpotCheck({ clipJson, perClip, out, ai, freqList: shifted, log: (m) => logs.push(m) })
  return { send, out, result }
}

describe('spot check', () => {
  it('glosses the clip highlights first, then widens the band until 15 candidates per clip, deduped by lemma and never names or numerals', () => {
    expect(clip.highlights.length).toBeGreaterThan(0)
    expect(clip.highlights.length).toBeLessThan(15)
    expect(clip.quiz).toBeUndefined()
    // real ranks: the short fixture runs out of words, and says so via the count. The highlight band has a floor and no ceiling
    // (docs/decisions/0008 decision 9), so on this A1 fixture the clip highlights may already hold every word ≥ the floor.
    const real = spotCheckCandidates(clip, rank, 15)
    expect(real.length).toBeGreaterThanOrEqual(clip.highlights.length)
    expect(real.length).toBeLessThan(15)
    expect(real.slice(clip.highlights.length).every((x) => x.rank >= 1000)).toBe(true)
    const c = spotCheckCandidates(clip, shiftedRank, 15)
    expect(c).toHaveLength(15)
    expect(c.slice(0, clip.highlights.length).map((x) => [x.cueIndex, x.word, x.lemma, x.fromClip])).toEqual(clip.highlights.map((h) => [h.cueIndex, h.word, h.lemma, true]))
    const extra = c.slice(clip.highlights.length)
    expect(extra.every((x) => !x.fromClip)).toBe(true)
    // widened candidates are ordered by cue index, then rank
    for (let i = 1; i < extra.length; i++) {
      const a = extra[i - 1]!, b = extra[i]!
      expect(a.cueIndex < b.cueIndex || (a.cueIndex === b.cueIndex && a.rank <= b.rank)).toBe(true)
    }
    expect(new Set(c.map((x) => x.lemma.toLowerCase())).size).toBe(15)
    for (const x of c) {
      const cue = clip.cues[x.cueIndex]!
      expect(x.cue).toBe(cue.text)
      const token = cue.tokens.find((t) => t.word === x.word && t.lemma === x.lemma)!
      expect(token).toBeDefined()
      expect(token.name).toBe(false)
      expect(isNumeral(x.word)).toBe(false)
      expect(/\d/.test(x.word)).toBe(false)
      expect(x.rank).toBe(x.fromClip ? clip.highlights.find((h) => h.lemma === x.lemma)!.rank : shiftedRank(x.lemma))
    }
    expect(spotCheckCandidates(clip, rank, 2)).toHaveLength(clip.highlights.length) // never drops a clip highlight
  })

  it('writes spot-check.json and markdown with 15 gloss rows, blank score columns, a quiz section and the cost line', async () => {
    const { send, out, result } = await spot(undefined, 'full')
    expect(send).toHaveBeenCalledTimes(15 + 1)
    const json = JSON.parse(await readFile(join(root, 'demo-de', 'spot-check.json'), 'utf8'))
    expect(json.slug).toBe('demo-de'); expect(json.level).toBe(clip.level)
    expect(json.glosses).toHaveLength(15)
    expect(Object.keys(json.glosses[0]).sort()).toEqual(['cached', 'cue', 'cueIndex', 'example', 'gloss', 'grammar', 'lemma', 'rank', 'word'])
    expect(json.quiz.length).toBeGreaterThan(0)
    expect(json.cost).toEqual(result.cost)
    expect(json.cost.calls).toBe(16)

    const md = await readFile(out, 'utf8')
    const lines = md.split('\n')
    expect(lines[0]).toBe(`## demo-de · de → en · level ${clip.level} · 15 glosses · ${json.quiz.length} quiz items · $${json.cost.usd.toFixed(4)} (16 calls, 0 cached)`)
    expect(md).toContain('| # | cue | word · lemma (rank) | gloss | grammar | example | G1 | G2 | G3 | G4 | G5 | pass |')
    const rows = lines.filter((l) => /^\| \d+ \| /.test(l))
    const glossRows = rows.slice(0, 15)
    expect(glossRows).toHaveLength(15)
    for (const r of glossRows) expect(r.endsWith('|  |  |  |  |  |  |')).toBe(true)
    expect(glossRows[0]).toContain(`| 1 | ${clip.cues[json.glosses[0].cueIndex]!.text.replace(/\n/g, ' ')} | ${json.glosses[0].word} · ${json.glosses[0].lemma} (${json.glosses[0].rank}) |`)
    expect(md).toContain('### Quiz')
    expect(md).toContain('| # | kind | prompt | options (answer marked *) | cue | Q1 | Q2 | Q3 | pass |')
    const quizRows = rows.slice(15)
    expect(quizRows).toHaveLength(json.quiz.length)
    for (const r of quizRows) { expect(r.endsWith('|  |  |  |  |')).toBe(true); expect((r.match(/\*/g) ?? []).length).toBe(1) }

    // a second run is served from the cache and --append adds a second section
    const logs: string[] = []
    const ai2 = createAi({ send, cacheDir: join(root, 'cache-full'), log: (m) => logs.push(m) })
    const again = await runSpotCheck({ clipJson, out, append: true, ai: ai2, freqList: shifted })
    expect(send).toHaveBeenCalledTimes(16)
    expect(again.cost).toMatchObject({ calls: 0, cachedCalls: 16 })
    expect(again.glosses.every((g) => g.cached)).toBe(true)
    expect((await readFile(out, 'utf8')).match(/^## demo-de /gm)).toHaveLength(2)
  })

  it('--per-clip 3 limits the rows and the quiz still uses every clip highlight', async () => {
    const { send, out, result } = await spot(3, 'three')
    expect(result.glosses).toHaveLength(3)
    const md = await readFile(out, 'utf8')
    expect(md.split('\n')[0]).toContain('· 3 glosses ·')
    const quizCall = send.mock.calls.find((c) => c[0].toolConfig?.toolChoice && 'tool' in c[0].toolConfig.toolChoice && c[0].toolConfig.toolChoice.tool?.name === 'plan_quiz')
    if (clip.highlights.length >= 4) {
      expect(quizCall).toBeDefined()
      const payload = JSON.parse(quizCall![0].messages![0]!.content![0]!.text!)
      expect(payload.highlights.map((h: { word: string }) => h.word)).toEqual(clip.highlights.map((h) => h.word))
    }
    // every clip highlight was glossed (for the quiz), only the first 3 are rows
    const glossCalls = send.mock.calls.filter((c) => c[0].toolConfig?.tools?.[0]?.toolSpec?.name === 'explain_word')
    expect(glossCalls).toHaveLength(Math.max(3, clip.highlights.length))
  })

  it('after widening the candidates, the quiz still uses only the clip\'s real highlights', async () => {
    const { send, result } = await spot(15, 'widened')
    expect(result.glosses).toHaveLength(15)
    const quizCall = send.mock.calls.find((c) => c[0].toolConfig?.tools?.[0]?.toolSpec?.name === 'plan_quiz')!
    const words = JSON.parse(quizCall[0].messages![0]!.content![0]!.text!).highlights.map((h: { word: string }) => h.word)
    expect(words).toEqual(clip.highlights.map((h) => h.word))
    const widened = result.glosses.slice(clip.highlights.length).map((g) => g.word)
    for (const w of widened) expect(words).not.toContain(w)
  })

  it('leaves REJECTED gloss rows out of the quiz input', async () => {
    const victim = clip.highlights[1]!
    const base = fixtureSend()
    const send = vi.fn(async (input: ConverseCommandInput) => {
      const out = await base(input)
      const payload = JSON.parse(input.messages![0]!.content![0]!.text!)
      const block = out.output!.message!.content![0]!
      if (block.toolUse?.name === 'explain_word' && payload.lemma === victim.lemma) block.toolUse.input = { gloss: victim.lemma, grammar: 'x', example: `Hier steht ${victim.word}.` }
      return out
    })
    const logs: string[] = []
    const ai = createAi({ send, cacheDir: join(root, 'cache-rejected'), log: (m) => logs.push(m) })
    const result = await runSpotCheck({ clipJson, perClip: 15, out: join(root, 'rejected.md'), ai, freqList: shifted, log: (m) => logs.push(m) })
    expect(result.glosses.find((g) => g.lemma === victim.lemma)!.gloss).toMatch(/^REJECTED: /)
    const quizCall = send.mock.calls.find((c) => c[0].toolConfig?.tools?.[0]?.toolSpec?.name === 'plan_quiz')
    const expected = clip.highlights.filter((h) => h.lemma !== victim.lemma).map((h) => h.word)
    if (expected.length >= 4) {
      const words = JSON.parse(quizCall![0].messages![0]!.content![0]!.text!).highlights.map((h: { word: string }) => h.word)
      expect(words).toEqual(expected)
    } else {
      expect(quizCall).toBeUndefined()
      expect(result.quiz).toEqual([])
    }
    for (const q of result.quiz) expect(q.options.join(' ')).not.toContain('REJECTED')
  })

  it('a fixture run writes spot-check.fixture.json and never touches spot-check.json', async () => {
    const real = join(root, 'demo-de', 'spot-check.json')
    await writeFile(real, '{"keep":true}\n')
    const ai = createAi({ send: fixtureSend(), cacheDir: join(root, 'cache-fixture'), log: () => {} })
    const r = await runSpotCheck({ clipJson, out: join(root, 'fixture.md'), ai, freqList: shifted, jsonFile: 'spot-check.fixture.json', log: () => {} })
    expect(r.files.json).toBe(join(root, 'demo-de', 'spot-check.fixture.json'))
    await expect(access(r.files.json)).resolves.toBeUndefined()
    expect(await readFile(real, 'utf8')).toBe('{"keep":true}\n')
  })
})
