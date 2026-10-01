import type { PreparedCost } from '@lingo/contracts'
import { AiCache, DEFAULT_AI_CACHE_DIR } from './cache'
import { createBedrockSend, type BedrockSend } from './client'
import { CostLedger, novaLiteModelId, type Prices } from './cost'
import { makeGloss, type GlossFn } from './gloss'
import { makeQuiz, type QuizFn } from './quiz'

export { AiSchemaError } from './errors'

export interface AiOptions { send?: BedrockSend; model?: string; region?: string; cacheDir?: string; prices?: Prices; log?: (m: string) => void; now?: () => Date }
export interface Ai {
  gloss: GlossFn
  quiz: QuizFn
  /** Bedrock spend of this instance so far (one CostLedger per createAi()). */
  cost: () => PreparedCost
  /** Resolved settings (for logs and tests). */
  config: { model: string; region: string; cacheDir: string }
}

/**
 * Defaults: send = lazy Bedrock client in BEDROCK_REGION (us-east-1); model = NOVA_LITE_MODEL_ID (us.amazon.nova-lite-v1:0, see ./cost);
 * cacheDir = LINGO_AI_CACHE_DIR or packages/pipeline/data/.cache/ai; log = console.log.
 */
export function createAi(opts: AiOptions = {}): Ai {
  const region = opts.region ?? (process.env.BEDROCK_REGION || 'us-east-1')
  const model = opts.model ?? novaLiteModelId()
  const cacheDir = opts.cacheDir ?? (process.env.LINGO_AI_CACHE_DIR || DEFAULT_AI_CACHE_DIR)
  const ledger = new CostLedger(opts.prices)
  const deps = {
    send: opts.send ?? createBedrockSend({ region }),
    cache: new AiCache(cacheDir),
    ledger,
    model,
    log: opts.log ?? ((m: string) => console.log(m)),
    now: opts.now ?? (() => new Date()),
  }
  return { gloss: makeGloss(deps), quiz: makeQuiz(deps), cost: () => ledger.snapshot(), config: { model, region, cacheDir } }
}
