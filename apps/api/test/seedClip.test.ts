import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import request from 'supertest'
import { ClipResponse, PreparedClip } from '@lingo/contracts'
import { createApp } from '../src/app'
import { db } from '../src/lib/db'
import { levelForRank, seedClip } from '../src/lib/seedClip'

// `pnpm --filter @lingo/api seed:dev` (S1 follow-up): the committed demo-de fixture, published idempotently.
const fixture = PreparedClip.parse(JSON.parse(readFileSync(new URL('../scripts/fixtures/demo-de.clip.json', import.meta.url), 'utf8')))
const run = randomBytes(4).toString('hex')
const slug = `test-seed-${run}`
const device = `test-seed-${run}-tv`
const opts = { slug, title: 'Seed test', manifestKey: `${slug}/master.m3u8`, license: 'Test fixture', attribution: 'Lingo test fixture' }

afterAll(async () => {
  await db.learner.deleteMany({ where: { deviceId: device } })
  await db.clip.deleteMany({ where: { slug } })
  await db.$disconnect()
}, 30_000)

const snapshot = async () => {
  const c = await db.clip.findUniqueOrThrow({ where: { slug }, include: { cues: { orderBy: { index: 'asc' }, include: { highlights: { orderBy: { word: 'asc' } } } }, quiz: true } })
  return { id: c.id, status: c.status, manifestKey: c.manifestKey, cues: c.cues.map((q) => ({ id: q.id, index: q.index, text: q.text, highlights: q.highlights.map((h) => ({ id: h.id, word: h.word, gloss: h.gloss, level: h.level })) })), quiz: c.quiz.length }
}

describe('seedClip (seed:dev)', () => {
  it('the committed fixture is the demo-de clip: 23 cues, 7 highlights', () => {
    expect(fixture.slug).toBe('demo-de')
    expect(fixture.cues).toHaveLength(23)
    expect(fixture.highlights).toHaveLength(7)
  })

  it('publishes the clip, and a second run changes nothing (same ids, no duplicates)', async () => {
    const first = await seedClip(db, fixture, opts)
    expect(first).toMatchObject({ slug, cues: 23, highlights: 7, quiz: 0, created: true })
    const a = await snapshot()
    expect(a.status).toBe('published')
    expect(a.manifestKey).toBe(`${slug}/master.m3u8`)
    expect(a.cues).toHaveLength(23)
    expect(a.cues.flatMap((q) => q.highlights)).toHaveLength(7)

    const second = await seedClip(db, fixture, opts)
    expect(second).toMatchObject({ clipId: first.clipId, created: false, highlights: 7 })
    expect(await snapshot()).toEqual(a)
  })

  it('keeps a saved word across a re-seed and updates its gloss in place', async () => {
    const h = await db.highlight.findFirstOrThrow({ where: { cue: { clip: { slug } } }, orderBy: { word: 'asc' } })
    const l = await db.learner.upsert({ where: { deviceId: device }, create: { deviceId: device }, update: {} })
    await db.savedWord.create({ data: { learnerId: l.id, highlightId: h.id } })
    const changed = { ...fixture, highlights: fixture.highlights.map((x) => (x.word === h.word ? { ...x, gloss: 'new gloss' } : x)) }
    await seedClip(db, changed, opts)
    expect((await db.highlight.findUniqueOrThrow({ where: { id: h.id } })).gloss).toBe('new gloss')
    expect(await db.savedWord.count({ where: { learnerId: l.id, highlightId: h.id } })).toBe(1)
  })

  it('serves through GET /clips/:slug with every highlight for an A1 learner', async () => {
    await db.learner.update({ where: { deviceId: device }, data: { level: 'A1' } })
    const r = await request(createApp()).get(`/clips/${slug}`).set('x-device-id', device).set('x-native', 'en')
    const body = ClipResponse.parse(r.body.data)
    if (body.status !== 'ready') throw new Error('expected ready')
    expect(body.cues).toHaveLength(23)
    expect(body.cues.flatMap((q) => q.highlights)).toHaveLength(7)
    expect(body.manifestUrl.endsWith(`/${slug}/master.m3u8`)).toBe(true)
  })

  it('levelForRank follows the frequency bands', () => {
    expect([999, 1000, 1999, 2000, 3999, 4000, 10139].map(levelForRank)).toEqual(['A1', 'A2', 'A2', 'B1', 'B1', 'B2', 'B2'])
  })
})
