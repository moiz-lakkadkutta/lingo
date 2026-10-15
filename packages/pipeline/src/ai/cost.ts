import type { PreparedCost } from '@lingo/contracts'

/**
 * The model and its price live together (docs/plans/LING-002-gate-c.md §8, docs/decisions/0009 decision 2). Switching models is one env
 * variable (LINGO_AI_MODEL, or the older NOVA_LITE_MODEL_ID) or one edit of AI_MODEL_ID_DEFAULT; the price comes from MODEL_PRICES.
 * Model card: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-lite.html
 * Nova 2 extended thinking (reasoning tokens are billed as output): https://docs.aws.amazon.com/nova/latest/nova2-userguide/extended-thinking.html
 */
export const NOVA_LITE_MODEL_ID_DEFAULT = 'us.amazon.nova-lite-v1:0'
/** Nova Pro v1: best in the gloss eval (docs/decisions/0009, Eval results), approved 2026-10-04. Lite v1 stays selectable via LINGO_AI_MODEL. */
export const AI_MODEL_ID_DEFAULT = 'us.amazon.nova-pro-v1:0'

/** The single env-driven model id: LINGO_AI_MODEL, else NOVA_LITE_MODEL_ID, else the default (blank = unset). */
export function aiModelId(env: Record<string, string | undefined> = process.env): string {
  return env.LINGO_AI_MODEL || env.NOVA_LITE_MODEL_ID || AI_MODEL_ID_DEFAULT
}
/** @deprecated kept for older callers; = aiModelId without LINGO_AI_MODEL. */
export function novaLiteModelId(env: Record<string, string | undefined> = process.env): string {
  return env.NOVA_LITE_MODEL_ID || NOVA_LITE_MODEL_ID_DEFAULT
}

/**
 * Nova Lite on demand, US East (N. Virginia): $0.06 per million input tokens, $0.24 per million output tokens (verified 2026-10-15, see MODEL_PRICES).
 */
export const NOVA_LITE_USD_PER_M = { input: 0.06, output: 0.24 } as const

/** USD per million tokens. */
export interface Prices { input: number; output: number }

/**
 * On-demand prices, US East (N. Virginia), USD per million tokens, keyed by the model id without its geo prefix.
 * Verified 2026-10-15 against the AWS Price List API (on-demand, us-east-1):
 * https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/us-east-1/index.json
 * Nova 2 Lite: the standard rate ($0.33 / $2.75) applies to the in-Region id and the geographic profiles (us., eu., apac.); only the
 * global cross-Region profile (global.) is cheaper ($0.30 / $2.50, GLOBAL_PRICES), so an estimate never under-counts.
 */
export const MODEL_PRICES: Readonly<Record<string, Prices & { verified: boolean }>> = {
  'amazon.nova-micro-v1:0': { input: 0.035, output: 0.14, verified: true },
  'amazon.nova-lite-v1:0': { ...NOVA_LITE_USD_PER_M, verified: true },
  'amazon.nova-2-lite-v1:0': { input: 0.33, output: 2.75, verified: true },
  'amazon.nova-pro-v1:0': { input: 0.8, output: 3.2, verified: true },
  'amazon.nova-premier-v1:0': { input: 2.5, output: 12.5, verified: true },
}

/** Global cross-Region inference profile (`global.` prefix) where its rate differs from MODEL_PRICES (same source, 2026-10-15). */
const GLOBAL_PRICES: Readonly<Record<string, Prices & { verified: boolean }>> = {
  'amazon.nova-2-lite-v1:0': { input: 0.3, output: 2.5, verified: true },
}

const GEO_PREFIX = /^(us|eu|global|apac)\./

/** Price of a model id: the global. profile's own rate when it has one, else the standard rate (us., eu., apac. ignored). undefined when unknown. */
export function pricesFor(modelId: string): (Prices & { verified: boolean }) | undefined {
  const base = modelId.replace(GEO_PREFIX, '')
  return (modelId.startsWith('global.') ? GLOBAL_PRICES[base] : undefined) ?? MODEL_PRICES[base]
}

/** Only Nova 2 Lite supports extended thinking (reasoningConfig). */
export const supportsReasoning = (modelId: string) => modelId.replace(GEO_PREFIX, '').startsWith('amazon.nova-2-lite')

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** Bedrock spend of one prepare() run; snapshot() becomes clip.json.cost. */
export class CostLedger {
  private calls = 0
  private cachedCalls = 0
  private inputTokens = 0
  private outputTokens = 0
  private usd = 0

  constructor(private readonly prices: Prices = NOVA_LITE_USD_PER_M) {}

  /** Adds one call (rejected attempts included); returns the USD of this call. */
  record(usage: { inputTokens?: number; outputTokens?: number } | undefined): number {
    const input = usage?.inputTokens ?? 0, output = usage?.outputTokens ?? 0
    const usd = (input * this.prices.input + output * this.prices.output) / 1e6
    this.calls++
    this.inputTokens += input
    this.outputTokens += output
    this.usd += usd
    return usd
  }

  hit(): void {
    this.cachedCalls++
  }

  snapshot(): PreparedCost {
    return { calls: this.calls, cachedCalls: this.cachedCalls, inputTokens: this.inputTokens, outputTokens: this.outputTokens, usd: round6(this.usd) }
  }
}
