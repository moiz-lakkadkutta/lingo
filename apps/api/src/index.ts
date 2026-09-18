import { env } from './lib/env'
import { logger } from './lib/logger'
import { startQueue } from './lib/queue'
import { createServer } from './server'

const { server } = createServer()

startQueue()
  .then(() => server.listen(env.PORT, () => logger.info({ port: env.PORT }, 'api listening')))
  .catch((e) => { logger.error(e, 'failed to start'); process.exit(1) })
