import request from 'supertest'
import { ClipResponse, type Level } from '@lingo/contracts'
import { createApp } from '../src/app'
import { db } from '../src/lib/db'
import { fixtures } from './helpers/fixtures005'

const app = createApp()
const fx = fixtures('clips')
afterAll(() => fx.cleanup(), 30_000)

const get = (slug: string, deviceId: string) => request(app).get('/clips/' + slug).set('x-device-id', deviceId).set('x-native', 'en')
const ready = async (slug: string, deviceId: string) => {
  const r = await get(slug, deviceId)
  expect(r.status).toBe(200)
  const c = ClipResponse.parse(r.body.data)
  if (c.status !== 'ready') throw new Error('expected ready')
  return c
}
async function clipWithRanks(ranks: Array<[string, number]>, perCue = 1) {
  const c = await fx.clip()
  for (let i = 0; i * perCue < ranks.length; i++) {
    const cue = await db.cue.create({ data: { clipId: c.id, index: i, startMs: i * 3000, endMs: i * 3000 + 2500, text: `Zeile ${i}`, native: { en: `Line ${i}` } } })
    for (const [lemma, rank] of ranks.slice(i * perCue, (i + 1) * perCue)) {
      await db.highlight.create({ data: { cueId: cue.id, word: lemma, lemma, rank, gloss: `g ${lemma}`, grammar: 'noun', example: `${lemma}.`, level: 'B1' } })
    }
  }
  return c
}
const learnerAt = async (level: Level) => { const d = fx.device(); await fx.learner(d, { level }); return d }

describe('GET /clips/:slug', () => {
  it('returns 404 for an unknown slug', async () => {
    const r = await get(`test-005-${fx.run}-missing`, fx.device())
    expect(r.status).toBe(404)
    expect(r.body.error.code).toBe('NOT_FOUND')
  })
  it('returns status preparing with etaMin for an unpublished clip', async () => {
    const c = await fx.clip({ status: 'ready' })
    const r = await get(c.slug, fx.device())
    expect(r.status).toBe(200)
    const body = ClipResponse.parse(r.body.data)
    expect(body).toMatchObject({ status: 'preparing', etaMin: 3, slug: c.slug, title: c.title })
  })
  it('filters highlights below the floor of the band above the learner level', async () => {
    const c = await clipWithRanks([['a', 500], ['b', 1500], ['c', 2500], ['d', 5000]])
    const ranks = async (level: Level) => (await ready(c.slug, await learnerAt(level))).cues.flatMap((q) => q.highlights.map((h) => h.rank))
    expect(await ranks('A1')).toEqual([1500, 2500, 5000])
    expect(await ranks('A2')).toEqual([2500, 5000])
    expect(await ranks('B2')).toEqual([5000])
  })
  it('builds wordsYoullMeet from the filtered set, distinct lemmas, at most eight', async () => {
    const words: Array<[string, number]> = [['low', 100], ['w1', 3000], ['w1', 3000], ['w2', 3001], ['w3', 3002], ['w4', 3003], ['w5', 3004], ['w6', 3005], ['w7', 3006], ['w8', 3007], ['w9', 3008]]
    const c = await clipWithRanks(words, 2)
    const d = await ready(c.slug, await learnerAt('A2'))
    expect(d.wordsYoullMeet.map((h) => h.lemma)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'])
  })
  it('fills resumeS and completed from this learner progress only', async () => {
    const c = await clipWithRanks([['x', 3000]])
    const dev = await learnerAt('A2'); const other = await learnerAt('A2')
    const l = await db.learner.findUniqueOrThrow({ where: { deviceId: dev } })
    await db.progress.create({ data: { learnerId: l.id, clipId: c.id, positionS: 42 } })
    expect(await ready(c.slug, dev)).toMatchObject({ resumeS: 42, completed: false })
    expect(await ready(c.slug, other)).toMatchObject({ resumeS: null, completed: false })
    await db.progress.update({ where: { learnerId_clipId: { learnerId: l.id, clipId: c.id } }, data: { completed: true } })
    expect(await ready(c.slug, dev)).toMatchObject({ resumeS: null, completed: true })
    // with CLOUDFRONT_DOMAIN unset the manifest falls back to http://localhost/<key> so it stays a URL (ClipDetail)
    const m = (await ready(c.slug, dev)).manifestUrl
    expect(m.endsWith(`/clips/${c.slug}/master.m3u8`)).toBe(true)
    expect(m).not.toContain('undefined')
  })
})
