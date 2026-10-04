import request from 'supertest'
import { DeviceId } from '@lingo/contracts'
import { createApp } from '../src/app'
import { db } from '../src/lib/db'
import { fixtures } from './helpers/fixtures005'

// PR #2 review, slice A: L1 (saving an unknown or unpublished highlight) and L2 (x-device-id validation).
const fx = fixtures('pr2')
const app = createApp()
afterAll(() => fx.cleanup())

async function highlightOn(status: string) {
  const c = await fx.clip({ status })
  const cue = await db.cue.create({ data: { clipId: c.id, index: 0, startMs: 0, endMs: 2000, text: 'Wort.', native: { en: 'Word.' } } })
  return (await db.highlight.create({ data: { cueId: cue.id, word: 'Wort', lemma: 'wort', rank: 100, gloss: 'word', grammar: '', example: '', level: 'A1' } })).id
}
const save = (deviceId: string, highlightId: string) => request(app).post('/me/words').set('x-device-id', deviceId).send({ highlightId })

describe('PR2-A-L1: POST /me/words only saves highlights on published clips', () => {
  it('PR2-A-L1: an unknown highlightId answers 404 NOT_FOUND, not 500', async () => {
    const r = await save(fx.device(), 'no-such-highlight')
    expect(r.status).toBe(404)
    expect(r.body.error.code).toBe('NOT_FOUND')
  })
  it('PR2-A-L1: a highlight on an unpublished clip answers 404 and saves nothing', async () => {
    const d = fx.device()
    for (const status of ['draft', 'ready']) {
      const r = await save(d, await highlightOn(status))
      expect(r.status).toBe(404)
    }
    const l = await fx.learner(d)
    expect(await db.savedWord.count({ where: { learnerId: l.id } })).toBe(0)
  })
  it('PR2-A-L1: a highlight on a published clip still saves (201)', async () => {
    expect((await save(fx.device(), await highlightOn('published'))).status).toBe(201)
  })
})

describe('PR2-A-L2: x-device-id is validated', () => {
  it('PR2-A-L2: the contract accepts a UUID and short test ids and refuses long or unsafe ids', () => {
    for (const ok of ['3f2b8a6e-1c4d-4e5f-9a0b-123456789abc', 'fake-tv-1', 'a', 'x'.repeat(128)]) expect(DeviceId.safeParse(ok).success).toBe(true)
    for (const bad of ['', 'x'.repeat(129), 'a b', 'a/b', "a'b", 'ä', 'a\nb']) expect(DeviceId.safeParse(bad).success).toBe(false)
  })
  it('PR2-A-L2: a 5 KB device id answers 400 VALIDATION on /me, /catalog, /me/words and POST /sessions, and creates no learner', async () => {
    const long = 'x'.repeat(5300)
    for (const r of [
      await request(app).get('/me').set('x-device-id', long),
      await request(app).get('/catalog?learning=de').set('x-device-id', long),
      await request(app).post('/me/words').set('x-device-id', long).send({ highlightId: 'h' }),
      await request(app).post('/sessions').set('x-device-id', long),
    ]) {
      expect(r.status).toBe(400)
      expect(r.body.error.code).toBe('VALIDATION')
    }
    expect(await db.learner.count({ where: { deviceId: { startsWith: 'xxxxxxxxxxxxxxxx' } } })).toBe(0)
  })
  it('PR2-A-L2: an id with unsafe characters answers 400; a well-formed one works', async () => {
    expect((await request(app).get('/me').set('x-device-id', 'tv;drop table')).status).toBe(400)
    expect((await request(app).get('/me').set('x-device-id', fx.device())).status).toBe(200)
  })
})
