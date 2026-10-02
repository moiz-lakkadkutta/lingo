import { randomBytes } from 'node:crypto'
import request from 'supertest'
import { DueWord, ProgressStats, ReviewResult, SessionDto } from '@lingo/contracts'
import { createServer } from '../src/server'
import { newCode } from '../src/routes/sessions'
import { db } from '../src/lib/db'
import { addUtcDays, DAY_MS, startOfNextUtcDay, utcDay } from '../src/lib/day'

const rnd = () => randomBytes(4).toString('hex')
const { app } = createServer()
let clip: { id: string; slug: string; title: string }
let other: { id: string }
let hl: string[] = []

const tv = async () => {
  const deviceId = 'test-l6-tv-' + rnd()
  const r = await request(app).post('/sessions').set('x-device-id', deviceId)
  const { code } = SessionDto.parse(r.body.data)
  const learner = await db.learner.findUniqueOrThrow({ where: { deviceId } })
  return { deviceId, code, learnerId: learner.id }
}
const save = async (deviceId: string, highlightId: string) => {
  const r = await request(app).post('/me/words').set('x-device-id', deviceId).send({ highlightId })
  expect(r.status).toBe(201)
  return (r.body.data.saved as { id: string }).id
}
const words = (h: Record<string, string>, q = '') => { const r = request(app).get('/me/words' + q); for (const [k, v] of Object.entries(h)) r.set(k, v); return r }
const review = (h: Record<string, string>, body: object) => { const r = request(app).post('/me/reviews'); for (const [k, v] of Object.entries(h)) r.set(k, v); return r.send(body) }
const stats = (h: Record<string, string>) => { const r = request(app).get('/me/stats'); for (const [k, v] of Object.entries(h)) r.set(k, v); return r }

beforeAll(async () => {
  clip = await db.clip.create({ data: { slug: 'test-l6-' + rnd(), title: 'Am Bahnhof', sourceLang: 'de', durationS: 60, level: 'A2', coverageRank: 1000, license: 'CC BY 4.0', attribution: 'test', status: 'published' } })
  other = await db.clip.create({ data: { slug: 'test-l6-other-' + rnd(), title: 'Other', sourceLang: 'de', durationS: 60, level: 'A2', coverageRank: 1000, license: 'CC BY 4.0', attribution: 'test', status: 'published' } })
  const cue = await db.cue.create({ data: { clipId: clip.id, index: 2, startMs: 0, endMs: 2000, text: 'Der Zug fährt vom Bahnhof ab.', native: { en: 'The train leaves from the station.', tr: 'Tren istasyondan kalkıyor.' } } })
  const levels = ['A1', 'A2', 'B1', 'B2'] as const
  for (const [i, w] of ['Zug', 'fährt', 'Bahnhof', 'ab'].entries()) {
    const h = await db.highlight.create({ data: { cueId: cue.id, word: w, lemma: w.toLowerCase(), rank: 100 + i, gloss: `gloss ${w}`, grammar: 'noun', example: `Beispiel mit ${w}.`, level: levels[i]! } })
    hl.push(h.id)
  }
}, 30_000)

afterAll(async () => {
  await db.learner.deleteMany({ where: { deviceId: { startsWith: 'test-l6-' } } }) // SavedWord → Highlight has no cascade: learners go first
  await db.clip.deleteMany({ where: { id: { in: [clip.id, other.id] } } })
  await db.$disconnect()
}, 30_000)

describe('learner resolution', () => {
  it('x-session-code resolves the TV learner: the phone sees the words the TV saved', async () => {
    const t = await tv(); const id = await save(t.deviceId, hl[0]!)
    const r = await words({ 'x-session-code': t.code, 'x-device-id': 'test-l6-phone-' + rnd() })
    expect(r.status).toBe(200)
    expect(r.body.data.map((w: DueWord) => w.savedWordId)).toEqual([id])
  })
  it('x-session-code wins over x-device-id', async () => {
    const t = await tv(); const phone = 'test-l6-phone-' + rnd()
    await save(phone, hl[1]!) // the phone's own learner has a different word
    const id = await save(t.deviceId, hl[0]!)
    const r = await words({ 'x-session-code': t.code, 'x-device-id': phone })
    expect(r.body.data.map((w: DueWord) => w.savedWordId)).toEqual([id])
  })
  it('without x-session-code the device id resolves its own learner as before', async () => {
    const phone = 'test-l6-phone-' + rnd()
    const id = await save(phone, hl[1]!)
    const r = await words({ 'x-device-id': phone })
    expect(r.body.data.map((w: DueWord) => w.savedWordId)).toEqual([id])
    const me = await request(app).get('/me').set('x-device-id', phone)
    expect(me.status).toBe(200)
    expect(me.body.data).toMatchObject({ learning: 'de', level: 'A2' })
  })
  it('a malformed x-session-code is 404 UNKNOWN_CODE (same as an unknown one) and creates no learner', async () => {
    const phone = 'test-l6-ghost-' + rnd()
    const r = await words({ 'x-session-code': 'ABC10O', 'x-device-id': phone })
    expect(r.status).toBe(404)
    expect(r.body).toMatchObject({ success: false, error: { code: 'UNKNOWN_CODE' } })
    expect(await db.learner.findUnique({ where: { deviceId: phone } })).toBeNull()
  })
  it('a well-formed unknown x-session-code is 404 UNKNOWN_CODE', async () => {
    let code = newCode()
    while (await db.session.findUnique({ where: { code } })) code = newCode()
    const r = await words({ 'x-session-code': code })
    expect(r.status).toBe(404)
    expect(r.body).toMatchObject({ success: false, error: { code: 'UNKNOWN_CODE' } })
  })
  it('lower-case x-session-code is accepted', async () => {
    const t = await tv(); const id = await save(t.deviceId, hl[2]!)
    const r = await words({ 'x-session-code': ` ${t.code.toLowerCase()} ` })
    expect(r.status).toBe(200)
    expect(r.body.data.map((w: DueWord) => w.savedWordId)).toEqual([id])
  })
})

describe('GET /me/words', () => {
  let t: Awaited<ReturnType<typeof tv>>; let ids: string[] = []
  beforeAll(async () => {
    t = await tv()
    ids = [await save(t.deviceId, hl[0]!), await save(t.deviceId, hl[1]!), await save(t.deviceId, hl[2]!)]
    const now = new Date(); const next = startOfNextUtcDay(now)
    await db.savedWord.update({ where: { id: ids[0] }, data: { due: new Date(next.getTime() - 1) } })        // last ms of today
    await db.savedWord.update({ where: { id: ids[1] }, data: { due: new Date(now.getTime() - 3 * DAY_MS) } }) // overdue
    await db.savedWord.update({ where: { id: ids[2] }, data: { due: next } })                                // tomorrow 00:00Z
  })
  it('due=today returns words due before the next UTC midnight, earliest first', async () => {
    const r = await words({ 'x-session-code': t.code }, '?due=today')
    expect(r.body.data.map((w: DueWord) => w.savedWordId)).toEqual([ids[1], ids[0]])
  })
  it('due=today leaves out words due on a later UTC day', async () => {
    const r = await words({ 'x-session-code': t.code }, '?due=today')
    expect(r.body.data.map((w: DueWord) => w.savedWordId)).not.toContain(ids[2])
  })
  it('without due returns every saved word', async () => {
    const r = await words({ 'x-session-code': t.code })
    expect(r.body.data.map((w: DueWord) => w.savedWordId)).toEqual([ids[1], ids[0], ids[2]])
  })
  it('each word carries lemma, level, clip slug and title, cue index and text, and the native line for the learner', async () => {
    await request(app).put('/me').set('x-device-id', t.deviceId).send({ native: 'tr' })
    const r = await words({ 'x-session-code': t.code })
    const w = DueWord.array().parse(r.body.data).find((x) => x.savedWordId === ids[0])!
    expect(w).toMatchObject({ word: 'Zug', lemma: 'zug', level: 'A1', clipSlug: clip.slug, clipTitle: 'Am Bahnhof', cueIndex: 2, cueText: 'Der Zug fährt vom Bahnhof ab.', cueNative: 'Tren istasyondan kalkıyor.', reps: 0, lapses: 0, intervalD: 0, highlightId: hl[0] })
  })
})

describe('POST /me/reviews', () => {
  it('good on a new word schedules it 1 day out with reps 1 and records one Review row', async () => {
    const t = await tv(); const id = await save(t.deviceId, hl[0]!)
    const before = Date.now()
    const r = await review({ 'x-session-code': t.code }, { savedWordId: id, grade: 'good' })
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({ savedWordId: id, intervalD: 1, reps: 1, lapses: 0, ease: 2.5 })
    const due = Date.parse(r.body.data.due)
    expect(due - before).toBeGreaterThanOrEqual(DAY_MS); expect(due - Date.now()).toBeLessThanOrEqual(DAY_MS)
    expect(await db.review.count({ where: { savedWordId: id } })).toBe(1)
  })
  it('a second good schedules it 6 days out', async () => {
    const t = await tv(); const id = await save(t.deviceId, hl[0]!)
    await review({ 'x-session-code': t.code }, { savedWordId: id, grade: 'good' })
    const r = await review({ 'x-session-code': t.code }, { savedWordId: id, grade: 'good' })
    expect(r.body.data).toMatchObject({ intervalD: 6, reps: 2 })
    expect((await db.savedWord.findUniqueOrThrow({ where: { id } })).intervalD).toBe(6)
  })
  it('again resets reps to 0, lowers ease by 0.2 and adds a lapse', async () => {
    const t = await tv(); const id = await save(t.deviceId, hl[0]!)
    await review({ 'x-session-code': t.code }, { savedWordId: id, grade: 'good' })
    const r = await review({ 'x-session-code': t.code }, { savedWordId: id, grade: 'again' })
    expect(r.body.data).toMatchObject({ reps: 0, lapses: 1, intervalD: 1 })
    expect(r.body.data.ease).toBeCloseTo(2.3)
  })
  it('the response parses with ReviewResult', async () => {
    const t = await tv(); const id = await save(t.deviceId, hl[3]!)
    const r = await review({ 'x-device-id': t.deviceId }, { savedWordId: id, grade: 'easy' })
    expect(ReviewResult.parse(r.body.data)).toEqual(r.body.data)
  })
  it('a review through the phone is visible to the TV device on its next GET /me/words', async () => {
    const t = await tv(); const id = await save(t.deviceId, hl[0]!)
    await review({ 'x-session-code': t.code, 'x-device-id': 'test-l6-phone-' + rnd() }, { savedWordId: id, grade: 'good' })
    const r = await words({ 'x-device-id': t.deviceId })
    expect(r.body.data.find((w: DueWord) => w.savedWordId === id)).toMatchObject({ reps: 1, intervalD: 1 })
  })
  it("a savedWordId of another learner is 404 and changes neither the word nor the Review table", async () => {
    const a = await tv(); const b = await tv(); const id = await save(a.deviceId, hl[0]!)
    const before = await db.savedWord.findUniqueOrThrow({ where: { id } })
    const r = await review({ 'x-session-code': b.code }, { savedWordId: id, grade: 'good' })
    expect(r.status).toBe(404)
    expect(await db.savedWord.findUniqueOrThrow({ where: { id } })).toEqual(before)
    expect(await db.review.count({ where: { savedWordId: id } })).toBe(0)
  })
  it('an unknown grade is 400 VALIDATION', async () => {
    const t = await tv(); const id = await save(t.deviceId, hl[0]!)
    const r = await review({ 'x-session-code': t.code }, { savedWordId: id, grade: 'perfect' })
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION')
  })
})

describe('streak', () => {
  const today = () => utcDay(new Date())
  it('a review on the day after lastStudyDay adds one to the streak', async () => {
    const t = await tv(); const id = await save(t.deviceId, hl[0]!)
    await db.learner.update({ where: { id: t.learnerId }, data: { streak: 3, lastStudyDay: addUtcDays(today(), -1) } })
    await review({ 'x-session-code': t.code }, { savedWordId: id, grade: 'good' })
    expect(await db.learner.findUniqueOrThrow({ where: { id: t.learnerId } })).toMatchObject({ streak: 4, lastStudyDay: today() })
  })
  it('a review two days after lastStudyDay restarts the streak at 1', async () => {
    const t = await tv(); const id = await save(t.deviceId, hl[0]!)
    await db.learner.update({ where: { id: t.learnerId }, data: { streak: 9, lastStudyDay: addUtcDays(today(), -2) } })
    await review({ 'x-session-code': t.code }, { savedWordId: id, grade: 'hard' })
    expect(await db.learner.findUniqueOrThrow({ where: { id: t.learnerId } })).toMatchObject({ streak: 1, lastStudyDay: today() })
  })
  it('saving a word also counts as a study day', async () => {
    const t = await tv()
    expect(await db.learner.findUniqueOrThrow({ where: { id: t.learnerId } })).toMatchObject({ streak: 0, lastStudyDay: null })
    await save(t.deviceId, hl[1]!)
    expect(await db.learner.findUniqueOrThrow({ where: { id: t.learnerId } })).toMatchObject({ streak: 1, lastStudyDay: today() })
  })
})

describe('GET /me/stats', () => {
  it('GET /me/stats parses with ProgressStats and counts saved and known words per band', async () => {
    const t = await tv()
    const ids = await Promise.all(hl.map((h) => save(t.deviceId, h)))
    await db.savedWord.update({ where: { id: ids[1] }, data: { intervalD: 6, reps: 2, due: new Date(Date.now() + 6 * DAY_MS) } })
    await db.savedWord.update({ where: { id: ids[2] }, data: { intervalD: 1, reps: 1, due: new Date(Date.now() - DAY_MS) } })
    const r = await stats({ 'x-device-id': t.deviceId })
    expect(r.status).toBe(200)
    const s = ProgressStats.parse(r.body.data)
    expect(s.bands).toEqual([{ level: 'A1', saved: 1, known: 0 }, { level: 'A2', saved: 1, known: 1 }, { level: 'B1', saved: 1, known: 0 }, { level: 'B2', saved: 1, known: 0 }])
    expect([s.newNow, s.dueNow]).toEqual([2, 1])
    expect(s.streak).toEqual({ day: 1, welcomeBack: false })
  })
  it('GET /me/stats counts completed Progress rows only as clips watched', async () => {
    const t = await tv()
    await db.progress.create({ data: { learnerId: t.learnerId, clipId: clip.id, positionS: 60, completed: true } })
    await db.progress.create({ data: { learnerId: t.learnerId, clipId: other.id, positionS: 12, completed: false } })
    const s = ProgressStats.parse((await stats({ 'x-device-id': t.deviceId })).body.data)
    expect(s.clipsWatched).toBe(1)
  })
  it('GET /me/stats with x-session-code reports the TV learner', async () => {
    const t = await tv(); await save(t.deviceId, hl[0]!)
    const phone = 'test-l6-phone-' + rnd(); await save(phone, hl[1]!); await save(phone, hl[2]!)
    const s = ProgressStats.parse((await stats({ 'x-session-code': t.code, 'x-device-id': phone })).body.data)
    expect(s.bands.reduce((n, b) => n + b.saved, 0)).toBe(1)
    expect(s.bands[0]).toEqual({ level: 'A1', saved: 1, known: 0 })
  })
})
