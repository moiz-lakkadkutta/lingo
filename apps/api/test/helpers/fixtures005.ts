import { randomBytes } from 'node:crypto'
import type { Level } from '@lingo/contracts'
import { db } from '../../src/lib/db'

/** LING-005 DB fixtures: device ids `test-005-<rnd>`, clip slugs `test-005-<rnd>-…`; `cleanup()` deletes learners first (SavedWord → Highlight has no cascade), then clips. */
export function fixtures(file: string) {
  const run = `${file}-${randomBytes(4).toString('hex')}`
  const deviceIds: string[] = []
  const clipIds: string[] = []
  let n = 0
  return {
    run,
    device(): string { const d = `test-005-${run}-${n++}`; deviceIds.push(d); return d },
    async clip(o: { level?: Level; lang?: 'de' | 'en'; status?: string; createdAt?: Date; attribution?: string; manifestKey?: string | null; title?: string } = {}) {
      const slug = `test-005-${run}-${n++}`
      const c = await db.clip.create({ data: { slug, title: o.title ?? `Clip ${slug}`, sourceLang: o.lang ?? 'de', durationS: 120, level: o.level ?? 'A2', coverageRank: 1500, license: 'CC BY 4.0', attribution: o.attribution ?? `By ${slug}, CC BY 4.0`, manifestKey: o.manifestKey === undefined ? `clips/${slug}/master.m3u8` : o.manifestKey, status: o.status ?? 'published', ...(o.createdAt ? { createdAt: o.createdAt } : {}) } })
      clipIds.push(c.id)
      return c
    },
    learner(deviceId: string, data: { level?: Level; learning?: 'de' | 'en' } = {}) {
      return db.learner.upsert({ where: { deviceId }, create: { deviceId, ...data }, update: data })
    },
    async cleanup() {
      await db.learner.deleteMany({ where: { deviceId: { in: deviceIds } } })
      await db.clip.deleteMany({ where: { id: { in: clipIds } } })
      await db.$disconnect()
    },
  }
}
