import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandInput, type ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime'

/**
 * Amazon Bedrock Converse with forced tool use (LING-002).
 * Converse API: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html
 * SDK retries: https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html
 */
export type BedrockSend = (input: ConverseCommandInput) => Promise<ConverseCommandOutput>

/**
 * Lazy: the client is constructed on the first call, never at import time (CI has no credentials).
 * maxAttempts 5 / retryMode 'standard' = SDK handles ThrottlingException (429), ModelNotReady, 5xx with exponential backoff + jitter.
 */
export function createBedrockSend(opts: { region: string }): BedrockSend {
  let client: BedrockRuntimeClient | undefined
  return (input) => {
    client ??= new BedrockRuntimeClient({ region: opts.region, maxAttempts: 5, retryMode: 'standard' })
    return client.send(new ConverseCommand(input))
  }
}

/** First content block with toolUse whose name matches; returns its input, or null if absent (also null when stopReason === 'max_tokens'). */
export function toolUseInput(out: ConverseCommandOutput, toolName: string): unknown | null {
  if (out.stopReason === 'max_tokens') return null
  for (const block of out.output?.message?.content ?? []) {
    if (block.toolUse && block.toolUse.name === toolName) return block.toolUse.input ?? null
  }
  return null
}
