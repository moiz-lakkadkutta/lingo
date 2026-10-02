import request from 'supertest'
import { LevelResult, LibraryWord } from '@lingo/contracts'
import { createApp } from '../src/app'
import { db } from '../src/lib/db'
import { fixtures } from './helpers/fixtures005'

const app = createApp()
const fx = fixtures('learning')
afterAll(() => fx.cleanup(), 30_000)

const put = (path: string, deviceId: string, body: object) => request(app).put('/me' + path).set('x-device-id', deviceId).send(body)
const row = (deviceId: string) => db.learner.findUniqueOrThrow({ where: { deviceId } })
const quiz = async (deviceId: string, clipSlug: string, correct: number, total = 10) => {
  const r = await put('/level', deviceId, { source: 'quiz', clipSlug, correct, total })
  expect(r.status).toBe(200)
  return LevelResult.parse(r.body.data)
}
async function savedWord(learnerId: string, o: { status?: string; intervalD?: number; due?: Date; lemma?: string; native?: Record<string, string> } = {}) {
  const c = await fx.clip({ status: o.status ?? 'published', title: `Title ${o.lemma ?? 'w'}` })
  const cue = await db.cue.create({ data: { clipId: c.id, index: 3, startMs: 4000, endMs: 6500, text: 'Der Zug\nfährt ab.', native: o.native ?? { en: 'The train leaves.', tr: 'Tren kalkıyor.' } } })
  const h = await db.highlight.create({ data: { cueId: cue.id, word: 'Zug', lemma: o.lemma ?? 'Zug', rank: 2500, gloss: 'train', grammar: 'noun', example: 'Der Zug.', level: 'B1' } })
  await db.savedWord.create({ data: { learnerId, highlightId: h.id, intervalD: o.intervalD ?? 0, due: o.due ?? new Date() } })
  return c
}

describe('learning routes', () => {
  it('PUT /me/progress upserts position and completed and 404s an unknown clip', async () => {
    const dev = fx.device(); const c = await fx.clip()
    const a = await put('/progress', dev, { clipSlug: c.slug, positionS: 30 })
    expect(a.status).toBe(200)
    expect(a.body.data).toEqual({ clipSlug: c.slug, positionS: 30, completed: false })
    const b = await put('/progress', dev, { clipSlug: c.slug, positionS: 120, completed: true })
    expect(b.body.data).toEqual({ clipSlug: c.slug, positionS: 120, completed: true })
    const l = await row(dev)
    expect(await db.progress.findMany({ where: { learnerId: l.id } })).toMatchObject([{ positionS: 120, completed: true }])
    expect((await put('/progress', dev, { clipSlug: `test-005-${fx.run}-nope`, positionS: 1 })).status).toBe(404)
    expect((await put('/progress', dev, { clipSlug: c.slug, positionS: -1 })).status).toBe(400)
  })
  it('PUT /me/level placement sets the level and levelChangedAt', async () => {
    const dev = fx.device(); await fx.learner(dev)
    const r = await put('/level', dev, { source: 'placement', level: 'B1' })
    expect(r.status).toBe(200)
    expect(LevelResult.parse(r.body.data)).toEqual({ level: 'B1', changed: 'set' })
    const l = await row(dev)
    expect(l.level).toBe('B1')
    expect(l.levelChangedAt).toBeInstanceOf(Date)
    const same = await put('/level', dev, { source: 'settings', level: 'B1' })
    expect(same.body.data).toEqual({ level: 'B1', changed: null })
    expect((await row(dev)).levelChangedAt!.getTime()).toBeGreaterThanOrEqual(l.levelChangedAt!.getTime())
  })
  it('PUT /me/level quiz records an attempt and moves up after two qualifying clips', async () => {
    const dev = fx.device(); await fx.learner(dev, { level: 'A2' })
    const x = await fx.clip({ level: 'A2' }); const y = await fx.clip({ level: 'B1' })
    expect(await quiz(dev, x.slug, 9)).toEqual({ level: 'A2', changed: null })
    expect(await quiz(dev, y.slug, 10)).toEqual({ level: 'B1', changed: 'up' })
    const l = await row(dev)
    expect(l.level).toBe('B1')
    expect(await db.quizAttempt.count({ where: { learnerId: l.id } })).toBe(2)
    expect((await put('/level', dev, { source: 'quiz', clipSlug: `test-005-${fx.run}-nope`, correct: 1, total: 5 })).status).toBe(404)
  })
  it('PUT /me/level quiz only counts attempts since the last level change', async () => {
    const dev = fx.device(); await fx.learner(dev, { level: 'B1' })
    const x = await fx.clip({ level: 'B1' }); const y = await fx.clip({ level: 'B1' })
    await quiz(dev, x.slug, 10)
    await new Promise((r) => setTimeout(r, 10))
    await put('/level', dev, { source: 'settings', level: 'B1' })
    await new Promise((r) => setTimeout(r, 10))
    expect(await quiz(dev, y.slug, 10)).toEqual({ level: 'B1', changed: null })
    expect(await quiz(dev, x.slug, 10)).toEqual({ level: 'B2', changed: 'up' })
  })
  it('PUT /me/level rejects correct greater than total', async () => {
    const dev = fx.device(); const c = await fx.clip()
    const r = await put('/level', dev, { source: 'quiz', clipSlug: c.slug, correct: 11, total: 10 })
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION')
  })
  it('GET /me/library lists saved words due first with clip, cue span and native line', async () => {
    const dev = fx.device(); const l = await fx.learner(dev)
    const later = await savedWord(l.id, { lemma: 'later', due: new Date(Date.now() + 3 * 86_400_000) })
    const soon = await savedWord(l.id, { lemma: 'soon', due: new Date(Date.now() - 86_400_000) })
    const r = await request(app).get('/me/library').set('x-device-id', dev).set('x-native', 'tr')
    expect(r.status).toBe(200)
    const ws = LibraryWord.array().parse(r.body.data)
    expect(ws.map((w) => w.clip.slug)).toEqual([soon.slug, later.slug])
    expect(ws[0]).toMatchObject({ lemma: 'soon', gloss: 'train', word: 'Zug', learned: false, clip: { title: soon.title }, cue: { index: 3, startS: 4, endS: 6.5, text: 'Der Zug\nfährt ab.', native: 'Tren kalkıyor.' } })
    expect(ws[0]!.clip.manifestUrl).toMatch(/master\.m3u8$/)
    const fallback = await request(app).get('/me/library').set('x-device-id', dev).set('x-native', 'pl')
    expect(fallback.body.data[0].cue.native).toBe('The train leaves.')
  })
  it('GET /me/library marks intervals of 21 days or more as learned', async () => {
    const dev = fx.device(); const l = await fx.learner(dev)
    await savedWord(l.id, { lemma: 'a', intervalD: 20, due: new Date(Date.now() - 1000) })
    await savedWord(l.id, { lemma: 'b', intervalD: 21 })
    const ws = LibraryWord.array().parse((await request(app).get('/me/library').set('x-device-id', dev)).body.data)
    expect(ws.map((w) => [w.lemma, w.learned])).toEqual([['a', false], ['b', true]])
  })
  it('GET /me/library gives a null manifestUrl for an unpublished clip', async () => {
    const dev = fx.device(); const l = await fx.learner(dev)
    await savedWord(l.id, { status: 'ready', native: {} })
    const ws = LibraryWord.array().parse((await request(app).get('/me/library').set('x-device-id', dev)).body.data)
    expect(ws[0]!.clip.manifestUrl).toBeNull()
    expect(ws[0]!.cue.native).toBe('')
  })
})

describe('learner lookup shared with /me (LING-006) and Plus from entitled() (LING-007)', () => {
  const code = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
  it('M1: the TV routes ignore x-session-code and use x-device-id only', async () => {
    const dev = fx.device(); const l = await fx.learner(dev)
    await savedWord(l.id, { lemma: 'paired' })
    const sc = code()
    await db.session.create({ data: { code: sc, learnerId: l.id } })
    const other = fx.device()
    const r = await request(app).get('/me/library').set('x-session-code', sc).set('x-device-id', other)
    expect(r.status).toBe(200)
    expect(r.body.data).toEqual([]) // the phone's own (empty) learner, not the TV's
    expect((await request(app).get('/catalog').set('x-session-code', code())).status).toBe(200)
    const before = await row(dev)
    expect((await put('/level', other, { level: 'B2', source: 'settings' }).set('x-session-code', sc)).status).toBe(200)
    expect((await row(dev)).level).toBe(before.level)
  })
  it('PUT /me answers plus from entitled(), not the cached column', async () => {
    const { env } = await import('../src/lib/env')
    const before = env.LINGO_PLUS_MODE
    env.LINGO_PLUS_MODE = 'demo'
    try {
      const dev = fx.device(); await fx.learner(dev)
      const r = await request(app).put('/me').set('x-device-id', dev).send({ cueScale: 1.25 })
      expect(r.status).toBe(200)
      expect(r.body.data).toMatchObject({ cueScale: 1.25, plus: true })
      expect((await row(dev)).plus).toBe(false)
    } finally { env.LINGO_PLUS_MODE = before }
  })
})
