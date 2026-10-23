import cors from 'cors'
import express from 'express'
import type { Express } from 'express'
import helmet from 'helmet'
import type { Logger } from 'pino'
import pinoHttp from 'pino-http'
import { errorHandler, ok, unknownRoute } from './lib/http'
import { logger } from './lib/logger'
import { catalog } from './routes/catalog'
import { clips } from './routes/clips'
import { learning } from './routes/learning'
import { meRouter } from './routes/me'
import { sessions } from './routes/sessions'
import { iapRouter } from './routes/iap'
import { createRvsClient, type RvsClient } from './lib/rvs'
import { TRUST_PROXY } from './lib/clientIp'
import { createRateLimiter, HTTP_LIMITS, limitByIp, type HttpLimits } from './lib/rateLimit'

/** Injected in tests: a fake RVS client, a clock and small rate limits. Production uses the real RVS (env RVS_ENV / RVS_BASE) and HTTP_LIMITS. */
export interface AppDeps { rvs?: RvsClient; now?: () => Date; log?: Logger; limits?: Partial<HttpLimits> }

/** Largest real body is POST /iap/verify (receiptId ≤ 512 + userId ≤ 256 characters, under 1 KB); 16 KB leaves ample room. */
export const JSON_LIMIT = '16kb'

/** x-session-code and x-device-id are credentials (lib/learner.ts): request logs never carry them. */
export const REDACTED_HEADERS = ['req.headers["x-session-code"]', 'req.headers["x-device-id"]']

export function createApp(deps: AppDeps = {}): Express {
  const app = express()
  // Behind Caddy every peer is 127.0.0.1; req.ip (the session-code miss limiter's key, lib/learner.ts) must be the client's address.
  app.set('trust proxy', TRUST_PROXY)
  const rvs = deps.rvs ?? createRvsClient()
  const now = deps.now ?? (() => new Date())
  const limits = { ...HTTP_LIMITS, ...deps.limits }
  const perIp = (k: keyof HttpLimits) => limitByIp(createRateLimiter(limits[k]))
  app.use(helmet())
  app.use(cors())
  // Per client IP (req.ip, so after trust proxy), before body parsing and request logs: a flood is refused cheaply and not logged line by line.
  // CORS preflights are answered by cors() above and never counted.
  app.use(limitByIp(createRateLimiter(limits.global), (path) => path === '/health'))
  app.post('/sessions', perIp('sessions'))
  app.put('/me', perIp('settings'))
  app.post('/iap/verify', perIp('iapVerify'))
  app.use(express.json({ limit: JSON_LIMIT }))
  // clientIp: req.ip after trust proxy (the miss limiter's key); req.remoteAddress stays the peer (Caddy on the server).
  app.use(pinoHttp({ logger: deps.log ?? logger, redact: { paths: REDACTED_HEADERS, censor: '[redacted]' }, customProps: (req) => ({ clientIp: (req as express.Request).ip }) }))
  app.get('/health', (_req, res) => ok(res, { ok: true, service: 'lingo-api' }))
  app.use('/catalog', catalog)
  app.use('/clips', clips)
  app.use('/me', learning)
  app.use('/me', meRouter({ rvs, now }))
  app.use('/sessions', sessions)
  app.use('/iap', iapRouter({ rvs, now }))
  app.use(unknownRoute)
  app.use(errorHandler)
  return app
}
