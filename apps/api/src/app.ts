import cors from 'cors'
import express from 'express'
import type { Express } from 'express'
import helmet from 'helmet'
import type { Logger } from 'pino'
import pinoHttp from 'pino-http'
import { errorHandler, ok } from './lib/http'
import { logger } from './lib/logger'
import { catalog } from './routes/catalog'
import { clips } from './routes/clips'
import { learning } from './routes/learning'
import { me } from './routes/me'
import { sessions } from './routes/sessions'
import { iapRouter } from './routes/iap'
import { createRvsClient, type RvsClient } from './lib/rvs'

/** Injected in tests: a fake RVS client and a clock. Production uses the real RVS (env RVS_ENV / RVS_BASE). */
export interface AppDeps { rvs?: RvsClient; now?: () => Date; log?: Logger }

/** x-session-code and x-device-id are credentials (lib/learner.ts): request logs never carry them. */
export const REDACTED_HEADERS = ['req.headers["x-session-code"]', 'req.headers["x-device-id"]']

export function createApp(deps: AppDeps = {}): Express {
  const app = express()
  app.use(helmet())
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))
  app.use(pinoHttp({ logger: deps.log ?? logger, redact: { paths: REDACTED_HEADERS, censor: '[redacted]' } }))
  app.get('/health', (_req, res) => ok(res, { ok: true, service: 'lingo-api' }))
  app.use('/catalog', catalog)
  app.use('/clips', clips)
  app.use('/me', learning)
  app.use('/me', me)
  app.use('/sessions', sessions)
  app.use('/iap', iapRouter({ rvs: deps.rvs ?? createRvsClient(), now: deps.now ?? (() => new Date()) }))
  app.use(errorHandler)
  return app
}
