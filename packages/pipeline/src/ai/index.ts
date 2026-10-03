import type { PreparedCost } from '@lingo/contracts'
import { AiCache, DEFAULT_AI_CACHE_DIR } from './cache'
import { createBedrockSend, type BedrockSend } from './client'
import { aiModelId, CostLedger, pricesFor, supportsReasoning, type Prices } from './cost'
import type { Reasoning } from './call'
import { makeGloss, type GlossFn } from './gloss'
export type { GlossFn, GlossOutcome, GlossRequest } from './gloss'
import { makeQuiz, type QuizFn } from './quiz'

export { AiSchemaError } from './errors'

export interface AiOptions { send?: BedrockSend; model?: string; region?: string; cacheDir?: string; prices?: Prices; log?: (m: string) => void; now?: () => Date; /** Nova 2 Lite extended thinking; default LINGO_AI_REASONING or off */ reasoning?: Reasoning }
export interface Ai {
  gloss: GlossFn
  quiz: QuizFn
  /** Bedrock spend of this instance so far (one CostLedger per createAi()). */
  cost: () => PreparedCost
  /** Resolved settings (for logs and tests). */
  config: { model: string; region: string; cacheDir: string; reasoning: Reasoning }
}

/**
 * Defaults: send = lazy Bedrock client in BEDROCK_REGION (us-east-1); model = LINGO_AI_MODEL or NOVA_LITE_MODEL_ID (us.amazon.nova-lite-v1:0,
 * see ./cost); prices = MODEL_PRICES of that model (unknown model without opts.prices → throws); reasoning = LINGO_AI_REASONING or off
 * (only Nova 2 Lite; `high` is not offered, it forbids temperature and maxTokens); cacheDir = LINGO_AI_CACHE_DIR or
 * packages/pipeline/data/.cache/ai; log = console.log.
 */
export function createAi(opts: AiOptions = {}): Ai {
  const region = opts.region ?? (process.env.BEDROCK_REGION || 'us-east-1')
  const model = opts.model ?? aiModelId()
  const cacheDir = opts.cacheDir ?? (process.env.LINGO_AI_CACHE_DIR || DEFAULT_AI_CACHE_DIR)
  const prices = opts.prices ?? pricesFor(model)
  if (!prices) throw new Error(`createAi: no price for model ${model}; add it to MODEL_PRICES (src/ai/cost.ts) or pass opts.prices`)
  const envReasoning = process.env.LINGO_AI_REASONING || 'off'
  if (!opts.reasoning && !['off', 'low', 'medium'].includes(envReasoning)) throw new Error(`LINGO_AI_REASONING must be off, low or medium, got ${envReasoning}`)
  const reasoning = opts.reasoning ?? (envReasoning as Reasoning)
  if (reasoning !== 'off' && !supportsReasoning(model)) throw new Error(`createAi: reasoning ${reasoning} needs Nova 2 Lite, not ${model}`)
  const ledger = new CostLedger(prices)
  const deps = {
    send: opts.send ?? createBedrockSend({ region }),
    cache: new AiCache(cacheDir),
    ledger,
    model,
    log: opts.log ?? ((m: string) => console.log(m)),
    now: opts.now ?? (() => new Date()),
    reasoning,
  }
  return { gloss: makeGloss(deps), quiz: makeQuiz(deps), cost: () => ledger.snapshot(), config: { model, region, cacheDir, reasoning } }
}
