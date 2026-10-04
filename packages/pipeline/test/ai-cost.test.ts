import { AI_MODEL_ID_DEFAULT, aiModelId, CostLedger, MODEL_PRICES, NOVA_LITE_MODEL_ID_DEFAULT, NOVA_LITE_USD_PER_M, novaLiteModelId, pricesFor } from '../src/ai/cost'

describe('CostLedger', () => {
  it('record sums tokens and prices them at $0.06 / $0.24 per million; snapshot rounds usd to 6 dp', () => {
    expect(NOVA_LITE_USD_PER_M).toEqual({ input: 0.06, output: 0.24 })
    const ledger = new CostLedger()
    expect(ledger.record({ inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(0.06, 12)
    expect(ledger.record({ inputTokens: 287, outputTokens: 61 })).toBeCloseTo((287 * 0.06 + 61 * 0.24) / 1e6, 12)
    expect(ledger.snapshot()).toEqual({ calls: 2, cachedCalls: 0, inputTokens: 1_000_287, outputTokens: 61, usd: 0.060032 })
    const tiny = new CostLedger({ input: 1, output: 1 })
    tiny.record({ inputTokens: 1, outputTokens: 0 })
    expect(tiny.snapshot().usd).toBe(0.000001)
  })

  it('hit increments cachedCalls without touching tokens or usd', () => {
    const ledger = new CostLedger()
    ledger.record({ inputTokens: 100, outputTokens: 10 })
    const before = ledger.snapshot()
    ledger.hit(); ledger.hit()
    expect(ledger.snapshot()).toEqual({ ...before, cachedCalls: 2 })
  })

  it('record tolerates a response without usage (counts the call, adds 0 tokens)', () => {
    const ledger = new CostLedger()
    expect(ledger.record(undefined)).toBe(0)
    expect(ledger.record({ inputTokens: 5 })).toBeCloseTo((5 * 0.06) / 1e6, 12)
    expect(ledger.snapshot()).toEqual({ calls: 2, cachedCalls: 0, inputTokens: 5, outputTokens: 0, usd: 0 })
  })

  it('the model id is one env-driven value that sits next to its price constants', () => {
    expect(NOVA_LITE_MODEL_ID_DEFAULT).toBe('us.amazon.nova-lite-v1:0')
    expect(novaLiteModelId({})).toBe('us.amazon.nova-lite-v1:0')
    expect(novaLiteModelId({ NOVA_LITE_MODEL_ID: '' })).toBe('us.amazon.nova-lite-v1:0')
    expect(novaLiteModelId({ NOVA_LITE_MODEL_ID: 'eu.amazon.nova-lite-v1:0' })).toBe('eu.amazon.nova-lite-v1:0')
  })

  it('pricesFor strips the geo prefix and knows Lite v1, 2 Lite, Pro and Premier', () => {
    expect(pricesFor('us.amazon.nova-lite-v1:0')).toMatchObject({ input: 0.06, output: 0.24 })
    expect(pricesFor('global.amazon.nova-2-lite-v1:0')).toMatchObject({ input: 0.3, output: 2.5 })
    expect(pricesFor('us.amazon.nova-pro-v1:0')).toMatchObject({ input: 0.8, output: 3.2 })
    expect(pricesFor('us.amazon.nova-premier-v1:0')).toMatchObject({ input: 2.5, output: 12.5 })
    expect(pricesFor('eu.amazon.nova-lite-v1:0')).toBe(MODEL_PRICES['amazon.nova-lite-v1:0'])
    expect(pricesFor('apac.amazon.nova-micro-v1:0')).toBeDefined()
    expect(pricesFor('anthropic.some-model')).toBeUndefined()
    // H4: no figure is verified against the official pricing page yet
    expect(Object.values(MODEL_PRICES).every((p) => p.verified === false)).toBe(true)
  })

  it('LINGO_AI_MODEL wins over NOVA_LITE_MODEL_ID; the default is Nova Pro v1 (eval 2026-10-03, approved) and Lite v1 stays selectable', () => {
    expect(AI_MODEL_ID_DEFAULT).toBe('us.amazon.nova-pro-v1:0')
    expect(aiModelId({ LINGO_AI_MODEL: 'us.amazon.nova-lite-v1:0' })).toBe('us.amazon.nova-lite-v1:0')
    expect(aiModelId({})).toBe(AI_MODEL_ID_DEFAULT)
    expect(aiModelId({ NOVA_LITE_MODEL_ID: 'eu.amazon.nova-lite-v1:0' })).toBe('eu.amazon.nova-lite-v1:0')
    expect(aiModelId({ NOVA_LITE_MODEL_ID: 'eu.amazon.nova-lite-v1:0', LINGO_AI_MODEL: 'us.amazon.nova-2-lite-v1:0' })).toBe('us.amazon.nova-2-lite-v1:0')
  })
})
