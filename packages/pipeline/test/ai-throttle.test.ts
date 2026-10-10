import type { ConverseCommandInput, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime'
import { z } from 'zod'
import { askWithRetry, backoffDelayMs, isRetryableBedrockError, sendWithBackoff, type AiDeps } from '../src/ai/call'
import { CostLedger } from '../src/ai/cost'
import type { AiCache } from '../src/ai/cache'

const named = (name: string, message = name) => Object.assign(new Error(message), { name })
const ok = { $metadata: {}, stopReason: 'tool_use', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, metrics: { latencyMs: 1 }, output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 't', name: 'answer', input: { a: 1 } } }] } } } as unknown as ConverseCommandOutput

/** throws `errors` in order, then answers ok */
function throttlingSend(...errors: Error[]) {
  let i = 0
  return vi.fn(async (_input: ConverseCommandInput): Promise<ConverseCommandOutput> => { if (i < errors.length) throw errors[i++]!; return structuredClone(ok) })
}

describe('Bedrock throttling: exponential backoff with jitter in the shared call layer', () => {
  it('ThrottlingException and ServiceUnavailable(Exception) are retried; other errors are not', () => {
    expect(isRetryableBedrockError(named('ThrottlingException'))).toBe(true)
    expect(isRetryableBedrockError(named('ServiceUnavailableException'))).toBe(true)
    expect(isRetryableBedrockError(named('ServiceUnavailable'))).toBe(true)
    expect(isRetryableBedrockError(named('ValidationException'))).toBe(false)
    expect(isRetryableBedrockError(named('AccessDeniedException'))).toBe(false)
    expect(isRetryableBedrockError('ThrottlingException')).toBe(false)
  })

  it('delay n is base × 2^(n-1) scaled by the jitter in [0.5, 1]', () => {
    expect(backoffDelayMs(1, 1000, () => 1)).toBe(1000)
    expect(backoffDelayMs(2, 1000, () => 1)).toBe(2000)
    expect(backoffDelayMs(4, 1000, () => 1)).toBe(8000)
    expect(backoffDelayMs(3, 1000, () => 0)).toBe(2000)
  })

  it('a send that throttles twice and then succeeds: 3 calls, 2 growing waits, the answer is returned', async () => {
    const send = throttlingSend(named('ThrottlingException', 'Too many requests'), named('ServiceUnavailableException'))
    const waits: number[] = []
    const logs: string[] = []
    const out = await sendWithBackoff(send, { modelId: 'm', messages: [] }, { sleep: async (ms) => { waits.push(ms) }, random: () => 1, log: (m) => logs.push(m) })
    expect(out.stopReason).toBe('tool_use')
    expect(send).toHaveBeenCalledTimes(3)
    expect(waits).toEqual([1000, 2000])
    expect(logs.filter((l) => /throttl|retry/i.test(l))).toHaveLength(2)
  })

  it('gives up after 5 attempts and throws the last error; a non-retryable error is thrown at once', async () => {
    const t = named('ThrottlingException')
    const send = throttlingSend(t, t, t, t, t, t)
    const waits: number[] = []
    await expect(sendWithBackoff(send, { modelId: 'm' }, { sleep: async (ms) => { waits.push(ms) }, random: () => 0.5, log: () => {} })).rejects.toBe(t)
    expect(send).toHaveBeenCalledTimes(5)
    expect(waits).toHaveLength(4)
    const v = named('ValidationException', 'bad input')
    const once = throttlingSend(v)
    await expect(sendWithBackoff(once, { modelId: 'm' }, { sleep: async () => {}, log: () => {} })).rejects.toBe(v)
    expect(once).toHaveBeenCalledTimes(1)
  })

  it('askWithRetry rides through two throttles (deps.sleep) and records one billed call', async () => {
    const send = throttlingSend(named('ThrottlingException'), named('ThrottlingException'))
    const waits: number[] = []
    const ledger = new CostLedger({ input: 1, output: 1 })
    const d: AiDeps = { send, cache: {} as AiCache, ledger, model: 'm', log: () => {}, now: () => new Date(0), sleep: async (ms) => { waits.push(ms) } }
    const r = await askWithRetry(d, { kind: 'gloss', label: 'x', system: 's', payload: {}, toolName: 'answer', toolConfig: { tools: [] }, maxTokens: 10, schema: z.object({ a: z.number() }), check: () => [] })
    expect(r.ok).toBe(true)
    expect(send).toHaveBeenCalledTimes(3)
    expect(waits).toHaveLength(2)
    expect(waits[0]).toBeGreaterThanOrEqual(500); expect(waits[0]).toBeLessThanOrEqual(1000)
    expect(waits[1]).toBeGreaterThanOrEqual(1000); expect(waits[1]).toBeLessThanOrEqual(2000)
    expect(ledger.snapshot().calls).toBe(1)
  })
})
