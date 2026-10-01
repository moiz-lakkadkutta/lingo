import type { ToolConfiguration } from '@aws-sdk/client-bedrock-runtime'
import type { z } from 'zod'
import type { AiCache, AiKind } from './cache'
import { toolUseInput, type BedrockSend } from './client'
import type { CostLedger } from './cost'

/** Everything a gloss or quiz call needs; injected so tests never reach Bedrock. */
export interface AiDeps { send: BedrockSend; cache: AiCache; ledger: CostLedger; model: string; log: (m: string) => void; now: () => Date }

export interface AskSpec<T> {
  kind: AiKind
  /** lemma for gloss, 'clip' for quiz (log lines only) */
  label: string
  system: string
  payload: unknown
  toolName: string
  toolConfig: ToolConfiguration
  maxTokens: number
  schema: z.ZodType<T>
  /** context rules beyond the schema; [] = acceptable */
  check: (value: T) => string[]
}

export type AskResult<T> =
  | { ok: true; output: T; usage: { inputTokens: number; outputTokens: number } }
  | { ok: false; issues: string[]; lastOutput: unknown }

/** Temperature 0 as in the Nova tool-use sample (https://docs.aws.amazon.com/nova/latest/userguide/tool-use-definition.html). One constant if Bedrock ever rejects it. */
export const TEMPERATURE = 0

const zodIssues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.')}: ${i.message}`)

/**
 * Converse with forced tool use: attempt 1, then exactly one retry whose user message appends the issues and the rejected answer
 * (greedy decoding would otherwise repeat the same answer). Transport errors are thrown as-is (the SDK already retried them).
 */
export async function askWithRetry<T>(d: AiDeps, spec: AskSpec<T>): Promise<AskResult<T>> {
  let issues: string[] = []
  let lastOutput: unknown = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    const feedback = attempt === 2 ? [{ text: `Your previous tool call was rejected: ${issues.join('; ')}. Previous answer: ${JSON.stringify(lastOutput)}. Call ${spec.toolName} again with a corrected answer.` }] : []
    const out = await d.send({
      modelId: d.model,
      system: [{ text: spec.system }],
      messages: [{ role: 'user', content: [{ text: JSON.stringify(spec.payload) }, ...feedback] }],
      toolConfig: spec.toolConfig,
      inferenceConfig: { maxTokens: spec.maxTokens, temperature: TEMPERATURE },
    })
    const usd = d.ledger.record(out.usage)
    d.log(`ai ${spec.kind} ${spec.label} attempt=${attempt} in=${out.usage?.inputTokens ?? 0} out=${out.usage?.outputTokens ?? 0} ms=${out.metrics?.latencyMs ?? 0} usd=${usd.toFixed(6)} stop=${out.stopReason ?? 'unknown'}`)
    const input = toolUseInput(out, spec.toolName)
    lastOutput = input
    if (input === null) { issues = [`no tool call in the response (stopReason=${out.stopReason})`]; continue }
    const parsed = spec.schema.safeParse(input)
    issues = parsed.success ? spec.check(parsed.data) : zodIssues(parsed.error)
    if (parsed.success && !issues.length) return { ok: true, output: parsed.data, usage: { inputTokens: out.usage?.inputTokens ?? 0, outputTokens: out.usage?.outputTokens ?? 0 } }
  }
  return { ok: false, issues, lastOutput }
}
