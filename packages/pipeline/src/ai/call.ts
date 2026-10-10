import type { ConverseCommandInput, ConverseCommandOutput, ToolConfiguration } from '@aws-sdk/client-bedrock-runtime'
import type { z } from 'zod'
import type { AiCache, AiKind } from './cache'
import { toolUseInput, type BedrockSend } from './client'
import type { CostLedger } from './cost'
import type { GermanLexiconFn } from './germanWords'

/** Everything a gloss or quiz call needs; injected so tests never reach Bedrock. */
export type Reasoning = 'off' | 'low' | 'medium'
export interface AiDeps { send: BedrockSend; cache: AiCache; ledger: CostLedger; model: string; log: (m: string) => void; now: () => Date; /** Nova 2 extended thinking; default off */ reasoning?: Reasoning; /** G-NONWORD word knowledge for German glosses */ germanLexicon?: GermanLexiconFn; /** quiz planner: 'code' (default) or 'model' (LINGO_AI_QUIZ=model) */ quizMode?: 'code' | 'model'; /** backoff wait between throttled calls; default setTimeout (tests pass a recorder) */ sleep?: (ms: number) => Promise<void> }

export interface AskSpec<T> {
  kind: AiKind
  /** lemma for gloss, 'clip' for quiz (log lines only) */
  label: string
  system: string
  payload: unknown
  /** further user text blocks after the payload (e.g. the sibling hint of glossClip) */
  extraText?: string[]
  toolName: string
  toolConfig: ToolConfiguration
  maxTokens: number
  schema: z.ZodType<T, z.ZodTypeDef, unknown>
  /** context rules beyond the schema; [] = acceptable */
  check: (value: T) => string[] | Promise<string[]>
  /** issues that only nudge: on the retry, an answer whose remaining issues are all soft is accepted with a warning */
  soft?: (issue: string) => boolean
}

export type AskResult<T> =
  | { ok: true; output: T; usage: { inputTokens: number; outputTokens: number }; /** 1 or 2 */ attempt: number; /** soft issues left on an answer accepted on the retry */ issues: string[] }
  | { ok: false; issues: string[]; lastOutput: unknown }

/**
 * Temperature 0 as the Nova tool-use page recommends (https://docs.aws.amazon.com/nova/latest/userguide/tool-use-definition.html).
 * The request-schema page (https://docs.aws.amazon.com/nova/latest/userguide/complete-request-schema.html) gives a minimum of 0.00001, so
 * if Converse rejects 0 with a ValidationException about temperature, that call is repeated once at TEMPERATURE_FLOOR and the floor is
 * kept for the rest of the process.
 */
export const TEMPERATURE = 0
export const TEMPERATURE_FLOOR = 0.00001
let temperature: number = TEMPERATURE
export const currentTemperature = () => temperature
/** Tests only: back to TEMPERATURE. */
export const resetTemperature = () => { temperature = TEMPERATURE }

const isTemperatureRejection = (e: unknown) => e instanceof Error && e.name === 'ValidationException' && /temperature/i.test(e.message)

/**
 * Throttling and short outages that outlast the SDK's own retries (client.ts) are retried here: a batch of clips glossing in a row hit
 * ThrottlingException on Nova Pro in batch 1 (LING-008). Converse errors: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html#API_runtime_Converse_Errors
 * Backoff with jitter: https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html
 */
export const BACKOFF = { attempts: 5, baseMs: 1000 } as const
const RETRYABLE = new Set(['ThrottlingException', 'ServiceUnavailableException', 'ServiceUnavailable'])
export const isRetryableBedrockError = (e: unknown): boolean => e instanceof Error && RETRYABLE.has(e.name)
/** Wait before retry n (1-based): baseMs × 2^(n-1), scaled by a jitter factor in [0.5, 1]. */
export const backoffDelayMs = (n: number, baseMs: number, random: () => number = Math.random): number => Math.round(baseMs * 2 ** (n - 1) * (0.5 + 0.5 * random()))
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export interface BackoffOptions { attempts?: number; baseMs?: number; sleep?: (ms: number) => Promise<void>; random?: () => number; log: (m: string) => void }
export async function sendWithBackoff(send: BedrockSend, input: ConverseCommandInput, o: BackoffOptions): Promise<ConverseCommandOutput> {
  const attempts = o.attempts ?? BACKOFF.attempts, baseMs = o.baseMs ?? BACKOFF.baseMs, sleep = o.sleep ?? realSleep
  for (let n = 1; ; n++) {
    try {
      return await send(input)
    } catch (e) {
      if (n >= attempts || !isRetryableBedrockError(e)) throw e
      const ms = backoffDelayMs(n, baseMs, o.random)
      o.log(`WARNING ai: ${(e as Error).name} from Bedrock (attempt ${n}/${attempts}); retry in ${ms} ms`)
      await sleep(ms)
    }
  }
}

async function converse(d: AiDeps, input: ConverseCommandInput): Promise<ConverseCommandOutput> {
  const send = (i: ConverseCommandInput) => sendWithBackoff(d.send, i, { log: d.log, ...(d.sleep ? { sleep: d.sleep } : {}) })
  try {
    return await send({ ...input, inferenceConfig: { ...input.inferenceConfig, temperature } })
  } catch (e) {
    if (temperature === TEMPERATURE_FLOOR || !isTemperatureRejection(e)) throw e
    d.log(`WARNING ai: temperature ${temperature} rejected by Bedrock (${(e as Error).message}); using ${TEMPERATURE_FLOOR} from now on`)
    temperature = TEMPERATURE_FLOOR
    return send({ ...input, inferenceConfig: { ...input.inferenceConfig, temperature } })
  }
}

/**
 * With extended thinking on, a forced tool choice is replaced by `any` (one tool, so equivalent): the Nova 2 docs do not say that a
 * forced `tool` choice works together with reasoning (docs/plans/LING-002-gate-c.md §8.5).
 * https://docs.aws.amazon.com/nova/latest/nova2-userguide/extended-thinking.html
 */
function withReasoningToolChoice(tc: ToolConfiguration): ToolConfiguration {
  return tc.toolChoice && 'tool' in tc.toolChoice && tc.toolChoice.tool ? { ...tc, toolChoice: { any: {} } } : tc
}

const zodIssues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.')}: ${i.message}`)

/**
 * Converse with forced tool use: attempt 1, then exactly one retry whose user message appends the issues and the rejected answer
 * (greedy decoding would otherwise repeat the same answer). Throttling is retried with backoff (sendWithBackoff); other transport errors are thrown as-is (the SDK already retried them).
 */
export async function askWithRetry<T>(d: AiDeps, spec: AskSpec<T>): Promise<AskResult<T>> {
  let issues: string[] = []
  let lastOutput: unknown = null
  const reasoningOn = !!d.reasoning && d.reasoning !== 'off'
  for (let attempt = 1; attempt <= 2; attempt++) {
    const feedback = attempt === 2 ? [{ text: `Your previous tool call was rejected: ${issues.join('; ')}. Previous answer: ${JSON.stringify(lastOutput)}. Call ${spec.toolName} again with a corrected answer.` }] : []
    const out = await converse(d, {
      modelId: d.model,
      system: [{ text: spec.system }],
      messages: [{ role: 'user', content: [{ text: JSON.stringify(spec.payload) }, ...(spec.extraText ?? []).map((text) => ({ text })), ...feedback] }],
      toolConfig: reasoningOn ? withReasoningToolChoice(spec.toolConfig) : spec.toolConfig,
      inferenceConfig: { maxTokens: spec.maxTokens },
      ...(reasoningOn ? { additionalModelRequestFields: { reasoningConfig: { type: 'enabled', maxReasoningEffort: d.reasoning as string } } } : {}),
    })
    const usd = d.ledger.record(out.usage)
    d.log(`ai ${spec.kind} ${spec.label} attempt=${attempt} in=${out.usage?.inputTokens ?? 0} out=${out.usage?.outputTokens ?? 0} ms=${out.metrics?.latencyMs ?? 0} usd=${usd.toFixed(6)} stop=${out.stopReason ?? 'unknown'}`)
    const input = toolUseInput(out, spec.toolName)
    lastOutput = input
    if (input === null) { issues = [`no tool call in the response (stopReason=${out.stopReason})`]; continue }
    const parsed = spec.schema.safeParse(input)
    issues = parsed.success ? await spec.check(parsed.data) : zodIssues(parsed.error)
    const usage = { inputTokens: out.usage?.inputTokens ?? 0, outputTokens: out.usage?.outputTokens ?? 0 }
    if (parsed.success && !issues.length) return { ok: true, output: parsed.data, usage, attempt, issues: [] }
    if (parsed.success && attempt === 2 && spec.soft && issues.every(spec.soft)) {
      d.log(`WARNING ai ${spec.kind} ${spec.label} accepted on retry with a soft issue: ${issues.join('; ')}`)
      return { ok: true, output: parsed.data, usage, attempt, issues }
    }
  }
  return { ok: false, issues, lastOutput }
}
