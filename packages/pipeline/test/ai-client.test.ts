import type { ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime'
import { createBedrockSend, toolUseInput } from '../src/ai/client'

const sdk = vi.hoisted(() => ({ configs: [] as unknown[], sent: [] as unknown[] }))
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: class {
    constructor(config: unknown) { sdk.configs.push(config) }
    async send(cmd: { input: unknown }) { sdk.sent.push(cmd.input); return { $metadata: {}, stopReason: 'end_turn' } }
  },
  ConverseCommand: class { constructor(public input: unknown) {} },
}))

const out = (content: unknown[], stopReason = 'tool_use') =>
  ({ output: { message: { role: 'assistant', content } }, stopReason, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 }, $metadata: {} }) as unknown as ConverseCommandOutput

describe('client', () => {
  it('toolUseInput returns the input of the first toolUse block with the given name, null when absent or stopReason is max_tokens', () => {
    const input = { gloss: 'wait' }
    expect(toolUseInput(out([{ text: 'thinking' }, { toolUse: { toolUseId: 't0', name: 'other', input: {} } }, { toolUse: { toolUseId: 't1', name: 'explain_word', input } }]), 'explain_word')).toEqual(input)
    expect(toolUseInput(out([{ text: '{"gloss":"wait"}' }], 'end_turn'), 'explain_word')).toBeNull()
    expect(toolUseInput(out([{ toolUse: { toolUseId: 't1', name: 'explain_word', input } }], 'max_tokens'), 'explain_word')).toBeNull()
    expect(toolUseInput({ $metadata: {} } as ConverseCommandOutput, 'explain_word')).toBeNull()
  })

  it('toolUseInput ignores reasoningContent blocks before the toolUse block', () => {
    const input = { gloss: ['Schläger'] }
    expect(toolUseInput(out([{ reasoningContent: { reasoningText: { text: 'The word racket here means…' } } }, { toolUse: { toolUseId: 't1', name: 'explain_word', input } }]), 'explain_word')).toEqual(input)
    expect(toolUseInput(out([{ reasoningContent: { redactedContent: new Uint8Array([1]) } }], 'end_turn'), 'explain_word')).toBeNull()
  })

  it('createBedrockSend is lazy: no client until the first call, then one client with SDK retries (standard, 5 attempts) reused', async () => {
    const send = createBedrockSend({ region: 'us-east-1' })
    expect(sdk.configs).toHaveLength(0)
    const input = { modelId: 'us.amazon.nova-lite-v1:0', messages: [] }
    await send(input)
    await send(input)
    expect(sdk.configs).toEqual([{ region: 'us-east-1', maxAttempts: 5, retryMode: 'standard' }])
    expect(sdk.sent).toEqual([input, input])
  })
})
