/**
 * Cost estimate printed by `batch --dry-run` (docs/plans/LING-008.md §2.11). Every price is the repo's own figure and UNVERIFIED —
 * check each against its pricing page (and the eu-central-1 rate) before relying on it.
 */
import { join } from 'node:path'
import { segmentKey, type BatchClip, type BatchManifest } from './manifest'

export const PRICES = {
  /** USD per audio minute, docs/aws.md. verify: https://aws.amazon.com/transcribe/pricing/ (billed per second with a per-request minimum) */
  transcribePerMinute: 0.024,
  /** USD per million characters, docs/aws.md. verify: https://aws.amazon.com/translate/pricing/ */
  translatePerMillionChars: 15,
  /** characters of subtitle text per second of clip — an upper estimate; replace with the measured mean of the Phase 1 cue text */
  speechCharsPerSecond: 15,
  /** USD per clip for glosses + quiz plan on the default model, Nova Pro v1, by clip language. German: ≈ $0.07–0.12 per clip in the first
   * clip batch (LING-008; longer clips, more highlights, the G-NONWORD retries). English: the decision 0009 eval measured ≈ $0.035–0.042
   * (Nova Lite v1 measured $0.0010–0.0014). The per-token prices in src/ai/cost.ts are themselves unverified.
   * verify: https://aws.amazon.com/bedrock/pricing/ */
  bedrockPerClip: { de: { low: 0.07, high: 0.12 }, en: { low: 0.035, high: 0.05 } },
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
  /** usd = upper bound (counted in totalUsd), lowUsd = lower bound; byLang = clips per language */
  bedrock: { clips: number; usd: number; lowUsd: number; byLang: Partial<Record<BatchClip['lang'], number>> }
  totalUsd: number
  note: string
}

export interface FsRead { exists(path: string): boolean; read?(path: string): string | undefined }

/** work/<slug>/.segment.json: the segmentKey() the files in work/<slug> (mezz.mp4, transcript.json, poster.jpg) were made from. */
export const segmentFile = (work: string, slug: string) => join(work, slug, '.segment.json')
/** work/<slug> was prepared for another segment or source. No record (a work dir from before the record existed) counts as unchanged. */
export function segmentChanged(c: BatchClip, work: string, fs: FsRead): boolean {
  const recorded = fs.read?.(segmentFile(work, c.slug))
  return recorded !== undefined && recorded !== segmentKey(c)
}
/**
 * The one rule for "will this clip call Amazon Transcribe?", shared by the plan (--reuse), the "Transcribe will run for" line and the
 * estimate: no corrected VTT (`cues`) and no transcript.json made from the current segment.
 */
export const transcribes = (c: BatchClip, work: string, fs: FsRead) => c.cues === null && (segmentChanged(c, work, fs) || !fs.exists(join(work, c.slug, 'transcript.json')))

/** Transcribe runs for a clip with neither a corrected VTT (`cues`) nor work/<slug>/transcript.json (prepare --reuse); Translate runs once per native per phase; Bedrock only in the final phase. */
export function estimateBatch(m: BatchManifest, fs: FsRead, o: { work: string; phases: Phase[]; only?: string[] }): CostEstimate {
  const clips = m.clips.filter((c) => !o.only || o.only.includes(c.slug))
  const tr = clips.filter((c) => transcribes(c, o.work, fs))
  const minutes = tr.reduce((s, c) => s + c.expectedDurationS, 0) / 60
  const chars = o.phases.length * clips.reduce((s, c) => s + c.expectedDurationS * PRICES.speechCharsPerSecond * c.natives.length, 0)
  const transcribe = { slugs: tr.map((c) => c.slug), minutes, usd: minutes * PRICES.transcribePerMinute }
  const translate = { chars, usd: (chars * PRICES.translatePerMillionChars) / 1e6 }
  const glossed = o.phases.includes('final') ? clips : []
  const byLang: Partial<Record<BatchClip['lang'], number>> = {}
  for (const c of glossed) byLang[c.lang] = (byLang[c.lang] ?? 0) + 1
  const bedrock = {
    clips: glossed.length, byLang,
    usd: glossed.reduce((s, c) => s + PRICES.bedrockPerClip[c.lang].high, 0),
    lowUsd: glossed.reduce((s, c) => s + PRICES.bedrockPerClip[c.lang].low, 0),
  }
  return {
    phases: o.phases, transcribe, translate, bedrock, totalUsd: transcribe.usd + translate.usd + bedrock.usd,
    note: 'S3 storage and CloudFront demo traffic add cents (not estimated). Prices are unverified — see the pricing pages.',
  }
}

const bedrockParts = (e: CostEstimate) => {
  const parts = (Object.entries(e.bedrock.byLang) as Array<[BatchClip['lang'], number]>).map(([l, n]) => `${l} ${n} × $${PRICES.bedrockPerClip[l].low}–${PRICES.bedrockPerClip[l].high}`)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

export function renderEstimate(e: CostEstimate): string {
  const $ = (n: number) => `$${n.toFixed(2)}`
  return [
    `Cost estimate (${e.phases.join(' + ')}; prices UNVERIFIED, docs/aws.md):`,
    `  Transcribe  ${e.transcribe.slugs.length} clips, ${e.transcribe.minutes.toFixed(1)} min × $${PRICES.transcribePerMinute}/min = ${$(e.transcribe.usd)}`,
    `  Translate   ${Math.round(e.translate.chars).toLocaleString('en-US')} chars (${PRICES.speechCharsPerSecond} ch/s × natives × phases) × $${PRICES.translatePerMillionChars}/M = ${$(e.translate.usd)}`,
    `  Bedrock     ${e.bedrock.clips} clips${bedrockParts(e)} = ${$(e.bedrock.lowUsd)}–${$(e.bedrock.usd)} (Nova Pro v1; the total counts the upper bound)`,
    `  Total       ≈ ${$(e.totalUsd)}  (${e.note})`,
    `  Verify: ${PRICING_PAGES.join(' · ')}`,
  ].join('\n')
}
