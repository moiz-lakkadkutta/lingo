import type { PreparedCost } from '@lingo/contracts'

/**
 * The model and its price live together: switching to another model (e.g. Nova 2 Lite) is one edit here (default id + prices),
 * or NOVA_LITE_MODEL_ID in the environment plus the prices.
 * Model card: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-lite.html
 */
export const NOVA_LITE_MODEL_ID_DEFAULT = 'us.amazon.nova-lite-v1:0'

/** The single env-driven model id (NOVA_LITE_MODEL_ID; blank = default). */
export function novaLiteModelId(env: Record<string, string | undefined> = process.env): string {
  return env.NOVA_LITE_MODEL_ID || NOVA_LITE_MODEL_ID_DEFAULT
}

/**
 * Nova Lite on demand, US East (N. Virginia): $0.06 per million input tokens, $0.24 per million output tokens.
 * NOT YET VERIFIED: these figures come from search summaries (2026-10-01), not from the pricing page itself. Check them against
 * https://aws.amazon.com/bedrock/pricing/ (Amazon Nova tab) and fix them here; until then clip.json.cost is an estimate (see docs/aws.md).
 */
export const NOVA_LITE_USD_PER_M = { input: 0.06, output: 0.24 } as const

/** USD per million tokens. */
export interface Prices { input: number; output: number }

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
