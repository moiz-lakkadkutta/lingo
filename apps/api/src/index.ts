import { allowedPlusProblems, env } from './lib/env'
import { logger } from './lib/logger'
import { startQueue } from './lib/queue'
import { createServer } from './server'

const { server } = createServer()

// Never the secret: only the mode and which RVS answers (review-007 M2).
logger.info({ LINGO_PLUS_MODE: env.LINGO_PLUS_MODE, RVS_ENV: env.RVS_ENV }, 'lingo plus')
for (const p of allowedPlusProblems) logger.warn(`UNSAFE (LINGO_ALLOW_UNSAFE_PLUS=true): ${p}`)

startQueue()
  .then(() => server.listen(env.PORT, () => logger.info({ port: env.PORT }, 'api listening')))
  .catch((e) => { logger.error(e, 'failed to start'); process.exit(1) })
