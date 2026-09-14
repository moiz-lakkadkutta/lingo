import cors from 'cors'
        import express from 'express'
        import type { Express } from 'express'
        import helmet from 'helmet'
        import pinoHttp from 'pino-http'
        import { errorHandler, ok } from './lib/http'
        import { logger } from './lib/logger'
        import { catalog } from './routes/catalog'
import { clips } from './routes/clips'
import { me } from './routes/me'
import { sessions } from './routes/sessions'
import { iap } from './routes/iap'

        export function createApp(): Express {
          const app = express()
          app.use(helmet())
          app.use(cors())
          app.use(express.json({ limit: '1mb' }))
          app.use(pinoHttp({ logger }))
          app.get('/health', (_req, res) => ok(res, { ok: true, service: 'lingo-api' }))
          app.use('/catalog', catalog)
  app.use('/clips', clips)
  app.use('/me', me)
  app.use('/sessions', sessions)
  app.use('/iap', iap)
          app.use(errorHandler)
          return app
        }
