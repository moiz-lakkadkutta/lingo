import type { Request } from 'express'
import { db } from './db'
/** Device-id learner lookup for the TV routes (catalog, clips, learning). LING-006 owns `learner()` in me.ts. */
export const tvLearner = (req: Request) => {
  const deviceId = String(req.header('x-device-id') ?? 'anon')
  return db.learner.upsert({ where: { deviceId }, create: { deviceId }, update: {} })
}
