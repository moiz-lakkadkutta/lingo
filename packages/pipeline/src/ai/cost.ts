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
 * Nova Lite on demand, US East (N. Virginia): $0.06 per million input tokens, $0.24 per million output tokens (unverified, see MODEL_PRICES).
 */
export const NOVA_LITE_USD_PER_M = { input: 0.06, output: 0.24 } as const

/** USD per million tokens. */
export interface Prices { input: number; output: number }

/**
 * On-demand prices, US East, USD per million tokens, keyed by the model id without its geo prefix.
 * NOT VERIFIED (plan H4): from search summaries (2026-10-01/02), not the pricing page itself, which renders its Nova table with
 * JavaScript. Check them against https://aws.amazon.com/bedrock/pricing/ (Amazon Nova) and set verified: true; until then clip.json.cost
 * is an estimate (docs/aws.md).
 */
export const MODEL_PRICES: Readonly<Record<string, Prices & { verified: boolean }>> = {
  'amazon.nova-micro-v1:0': { input: 0.035, output: 0.14, verified: false },
  'amazon.nova-lite-v1:0': { ...NOVA_LITE_USD_PER_M, verified: false },
  'amazon.nova-2-lite-v1:0': { input: 0.3, output: 2.5, verified: false },
  'amazon.nova-pro-v1:0': { input: 0.8, output: 3.2, verified: false },
  'amazon.nova-premier-v1:0': { input: 2.5, output: 12.5, verified: false },
}

/** Price of a model id; the cross-Region prefix (us., eu., global., apac.) is ignored. undefined when unknown. */
export function pricesFor(modelId: string): (Prices & { verified: boolean }) | undefined {
  return MODEL_PRICES[modelId.replace(/^(us|eu|global|apac)\./, '')]
}

/** Only Nova 2 Lite supports extended thinking (reasoningConfig). */
export const supportsReasoning = (modelId: string) => modelId.replace(/^(us|eu|global|apac)\./, '').startsWith('amazon.nova-2-lite')

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
