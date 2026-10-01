/**
 * Cost estimate printed by `batch --dry-run` (docs/plans/LING-008.md §2.11). Every price is the repo's own figure and UNVERIFIED —
 * check each against its pricing page (and the eu-central-1 rate) before relying on it.
 */
import { join } from 'node:path'
import type { BatchManifest } from './manifest'

export const PRICES = {
  /** USD per audio minute, docs/aws.md. verify: https://aws.amazon.com/transcribe/pricing/ (billed per second with a per-request minimum) */
  transcribePerMinute: 0.024,
  /** USD per million characters, docs/aws.md. verify: https://aws.amazon.com/translate/pricing/ */
  translatePerMillionChars: 15,
  /** characters of subtitle text per second of clip — an upper estimate; replace with the measured mean of the Phase 1 cue text */
  speechCharsPerSecond: 15,
  /** USD per clip for Nova Lite glosses + quiz plan, upper bound (Gate C measured $0.0010 for 16 calls and $0.0014 for 21: docs/spot-checks/2026-10-02-gate-c.md;
   * the per-token prices in src/ai/cost.ts are themselves unverified). verify: https://aws.amazon.com/bedrock/pricing/ */
  bedrockPerClipUpperBound: 0.005,
} as const

export const PRICING_PAGES = [
  'https://aws.amazon.com/transcribe/pricing/', 'https://aws.amazon.com/translate/pricing/', 'https://aws.amazon.com/bedrock/pricing/',
  'https://aws.amazon.com/s3/pricing/', 'https://aws.amazon.com/cloudfront/pricing/',
]

export type Phase = 'draft' | 'final'
export interface CostEstimate {
  phases: Phase[]
  transcribe: { slugs: string[]; minutes: number; usd: number }
  translate: { chars: number; usd: number }
  bedrock: { clips: number; usd: number }
  totalUsd: number
  note: string
}

/** Transcribe runs for a clip with neither a corrected VTT (`cues`) nor work/<slug>/transcript.json (prepare --reuse); Translate runs once per native per phase; Bedrock only in the final phase. */
export function estimateBatch(m: BatchManifest, fs: { exists(path: string): boolean }, o: { work: string; phases: Phase[]; only?: string[] }): CostEstimate {
  const clips = m.clips.filter((c) => !o.only || o.only.includes(c.slug))
  const tr = clips.filter((c) => c.cues === null && !fs.exists(join(o.work, c.slug, 'transcript.json')))
  const minutes = tr.reduce((s, c) => s + c.expectedDurationS, 0) / 60
  const chars = o.phases.length * clips.reduce((s, c) => s + c.expectedDurationS * PRICES.speechCharsPerSecond * c.natives.length, 0)
  const transcribe = { slugs: tr.map((c) => c.slug), minutes, usd: minutes * PRICES.transcribePerMinute }
  const translate = { chars, usd: (chars * PRICES.translatePerMillionChars) / 1e6 }
  const bedrockClips = o.phases.includes('final') ? clips.length : 0
  const bedrock = { clips: bedrockClips, usd: bedrockClips * PRICES.bedrockPerClipUpperBound }
  return {
    phases: o.phases, transcribe, translate, bedrock, totalUsd: transcribe.usd + translate.usd + bedrock.usd,
    note: 'S3 storage and CloudFront demo traffic add cents (not estimated). Prices are unverified — see the pricing pages.',
  }
}

export function renderEstimate(e: CostEstimate): string {
  const $ = (n: number) => `$${n.toFixed(2)}`
  return [
    `Cost estimate (${e.phases.join(' + ')}; prices UNVERIFIED, docs/aws.md):`,
    `  Transcribe  ${e.transcribe.slugs.length} clips, ${e.transcribe.minutes.toFixed(1)} min × $${PRICES.transcribePerMinute}/min = ${$(e.transcribe.usd)}`,
    `  Translate   ${Math.round(e.translate.chars).toLocaleString('en-US')} chars (${PRICES.speechCharsPerSecond} ch/s × natives × phases) × $${PRICES.translatePerMillionChars}/M = ${$(e.translate.usd)}`,
    `  Bedrock     ${e.bedrock.clips} clips × ≤ $${PRICES.bedrockPerClipUpperBound} = ≤ ${$(e.bedrock.usd)}`,
    `  Total       ≈ ${$(e.totalUsd)}  (${e.note})`,
    `  Verify: ${PRICING_PAGES.join(' · ')}`,
  ].join('\n')
}
