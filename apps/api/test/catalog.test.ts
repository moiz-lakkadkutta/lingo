import request from 'supertest'
import { Catalog } from '@lingo/contracts'
import { createApp } from '../src/app'
import { db } from '../src/lib/db'
import { fixtures } from './helpers/fixtures005'

const app = createApp()
const fx = fixtures('catalog')
afterAll(() => fx.cleanup(), 30_000)

const get = async (deviceId: string, q = '') => {
  const r = await request(app).get('/catalog' + q).set('x-device-id', deviceId)
  return { status: r.status, body: r.body }
}
/** Rows restricted to this file's clips (other test files may publish clips concurrently). */
const mine = async (deviceId: string, q = '') => {
  const r = await get(deviceId, q)
  expect(r.status).toBe(200)
  const c = Catalog.parse(r.body.data)
  const own = (cs: typeof c.justRight) => cs.filter((x) => x.slug.startsWith(`test-005-${fx.run}`))
  return { continue: own(c.continue), justRight: own(c.justRight), harder: own(c.harder), fresh: own(c.fresh) }
}
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000)

describe('GET /catalog', () => {
  it('returns the four rows for the learner language and level', async () => {
    const dev = fx.device(); await fx.learner(dev, { level: 'A2', learning: 'de' })
    const a2 = await fx.clip({ level: 'A2' }); const b1 = await fx.clip({ level: 'B1' }); const en = await fx.clip({ level: 'A2', lang: 'en' }); const a1 = await fx.clip({ level: 'A1' })
    const c = await mine(dev)
    expect(c.justRight.map((x) => x.slug)).toContain(a2.slug)
    expect(c.justRight.map((x) => x.slug)).not.toContain(a1.slug)
    expect(c.harder.map((x) => x.slug)).toEqual([b1.slug])
    expect([...c.justRight, ...c.harder, ...c.fresh].map((x) => x.slug)).not.toContain(en.slug)
    expect(c.continue).toEqual([])
    const card = c.justRight.find((x) => x.slug === a2.slug)!
    expect(card).toMatchObject({ level: 'A2', durationS: 120, resumeS: null, completed: false, attribution: a2.attribution })
  })
  it('continue holds started, unfinished clips, newest progress first', async () => {
    const dev = fx.device(); const l = await fx.learner(dev)
    const x = await fx.clip(); const y = await fx.clip(); const done = await fx.clip()
    await db.progress.create({ data: { learnerId: l.id, clipId: x.id, positionS: 10 } })
    await new Promise((r) => setTimeout(r, 15))
    await db.progress.create({ data: { learnerId: l.id, clipId: y.id, positionS: 20 } })
    await db.progress.create({ data: { learnerId: l.id, clipId: done.id, positionS: 120, completed: true } })
    const c = await mine(dev)
    expect(c.continue.map((k) => k.slug)).toEqual([y.slug, x.slug])
    expect(c.continue[0]!.resumeS).toBe(20)
    // another learner sees no Continue row from this one's progress
    expect((await mine(fx.device())).continue).toEqual([])
  })
  it('completed clips carry completed true and no resumeS', async () => {
    const dev = fx.device(); const l = await fx.learner(dev)
    const done = await fx.clip(); const open = await fx.clip()
    await db.progress.create({ data: { learnerId: l.id, clipId: done.id, positionS: 120, completed: true } })
    const c = await mine(dev)
    expect(c.justRight.find((k) => k.slug === done.slug)).toMatchObject({ completed: true, resumeS: null })
    // not-completed first
    const order = c.justRight.map((k) => k.slug)
    expect(order.indexOf(open.slug)).toBeLessThan(order.indexOf(done.slug))
  })
  it('harder is empty for a B2 learner', async () => {
    const dev = fx.device(); await fx.learner(dev, { level: 'B2' })
    const b2 = await fx.clip({ level: 'B2' })
    const c = await mine(dev)
    expect(c.harder).toEqual([])
    expect(c.justRight.map((k) => k.slug)).toContain(b2.slug)
  })
  it('fresh holds only clips from the last seven days', async () => {
    const dev = fx.device(); await fx.learner(dev)
    const old = await fx.clip({ createdAt: daysAgo(8) }); const recent = await fx.clip({ createdAt: daysAgo(1) })
    const all = Catalog.parse((await get(dev)).body.data).fresh
    expect(all.length).toBeLessThanOrEqual(10)
    for (const k of all) expect(k.slug).not.toBe(old.slug)
    const c = await mine(dev)
    expect(c.fresh.map((k) => k.slug)).not.toContain(old.slug)
    expect(c.justRight.map((k) => k.slug)).toContain(old.slug)
    // fresh is ordered newest first; the one-day-old clip is in it unless ten newer clips exist
    if (all.length < 10) expect(c.fresh.map((k) => k.slug)).toContain(recent.slug)
  })
  it('query overrides learning and level, and rejects an unknown level with 400', async () => {
    const dev = fx.device(); await fx.learner(dev, { level: 'A2', learning: 'de' })
    const en = await fx.clip({ level: 'B1', lang: 'en' })
    const c = await mine(dev, '?learning=en&level=B1')
    expect(c.justRight.map((k) => k.slug)).toContain(en.slug)
    expect((await get(dev, '?level=C1')).status).toBe(400)
    expect((await get(dev, '?learning=fr')).status).toBe(400)
  })
  it('drafts never appear', async () => {
    const dev = fx.device(); await fx.learner(dev)
    const draft = await fx.clip({ status: 'draft' }); const ready = await fx.clip({ status: 'ready' })
    const c = await mine(dev)
    const slugs = [...c.continue, ...c.justRight, ...c.harder, ...c.fresh].map((k) => k.slug)
    expect(slugs).not.toContain(draft.slug)
    expect(slugs).not.toContain(ready.slug)
  })
})
