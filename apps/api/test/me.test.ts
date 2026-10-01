import { randomBytes } from 'node:crypto'
import request from 'supertest'
import { createApp } from '../src/app'
import { db } from '../src/lib/db'

// PUT /me accepts only the learner-editable settings (LearnerSettingsPatch). plus comes from /iap/verify,
// level from PUT /me/level (LING-005), streak and knownRank are server-side.
const deviceId = 'test-me-' + randomBytes(4).toString('hex')
const app = createApp()
const put = (body: object) => request(app).put('/me').set('x-device-id', deviceId).send(body)
const row = () => db.learner.findUniqueOrThrow({ where: { deviceId } })

beforeAll(async () => { await request(app).get('/me').set('x-device-id', deviceId) })
afterAll(async () => { await db.learner.deleteMany({ where: { deviceId } }); await db.$disconnect() })

describe('PUT /me', () => {
  it('rejects plus in PUT /me', async () => {
    const r = await put({ plus: true })
    expect(r.status).toBe(400)
    expect((await row()).plus).toBe(false)
  })
  it('rejects streak, knownRank and level', async () => {
    for (const body of [{ streak: 99 }, { knownRank: 9000 }, { level: 'C1' }]) expect((await put(body)).status).toBe(400)
    const l = await row()
    expect([l.streak, l.knownRank, l.level]).toEqual([0, 1000, 'A2'])
  })
  it('rejects a forbidden field even next to allowed ones', async () => {
    expect((await put({ cueScale: 1.25, plus: true })).status).toBe(400)
    const l = await row()
    expect(l.plus).toBe(false)
    expect(l.cueScale).toBe(1)
  })
  it('persists nativeLine and cueScale', async () => {
    const r = await put({ nativeLine: 'never', cueScale: 1.5 })
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({ nativeLine: 'never', cueScale: 1.5 })
    const again = await request(app).get('/me').set('x-device-id', deviceId)
    expect(again.body.data).toMatchObject({ nativeLine: 'never', cueScale: 1.5 })
  })
  it('persists autoPause and firstRunDone', async () => {
    expect((await put({ autoPause: true, firstRunDone: true })).status).toBe(200)
    expect(await row()).toMatchObject({ autoPause: true, firstRunDone: true })
  })
  it('rejects a cueScale outside 100-150 %', async () => {
    expect((await put({ cueScale: 3 })).status).toBe(400)
    expect((await put({ cueScale: 0.5 })).status).toBe(400)
  })
  it('rejects an unknown nativeLine value', async () => {
    expect((await put({ nativeLine: 'sometimes' })).status).toBe(400)
  })
})
