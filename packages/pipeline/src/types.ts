import { z } from 'zod'
import type { PreparedClip, PreparedCost } from '@lingo/contracts'
import type { Lemmatizer } from './lemmatize'
import type { glossWord, quizForClip } from './prompts'
import type { Formality } from './steps/translate'

export type Lang = 'de' | 'en'

/** Amazon Transcribe output JSON (https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html#how-it-works-output). `passthrough` keeps speaker_labels / audio_segments. */
export const TranscribeItem = z
  .object({
    type: z.enum(['pronunciation', 'punctuation']),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    alternatives: z.array(z.object({ content: z.string(), confidence: z.string().optional() })).min(1),
    speaker_label: z.string().optional(),
  })
  .passthrough()
export const TranscribeJson = z
  .object({
    jobName: z.string().optional(),
    status: z.string().optional(),
    results: z.object({ transcripts: z.array(z.object({ transcript: z.string() })), items: z.array(TranscribeItem) }).passthrough(),
  })
  .passthrough()
export type TranscribeJson = z.infer<typeof TranscribeJson>
export type TranscribeItem = z.infer<typeof TranscribeItem>

/** A timed word; `text` carries attached trailing punctuation ("dich.") so the segmenter sees sentence ends. */
export interface Word { start: number; end: number; text: string; speaker?: string }
export interface ExecResult { stdout: string }

export interface PrepareInput {
  slug: string
  source: string
  lang: Lang
  natives: string[]
  /** default 'work' */
  workRoot?: string
  /** default true */
  publish?: boolean
  /** default true; false (--no-ai) skips the Bedrock gloss and quiz calls: highlights carry no gloss/grammar/example, clip.json has no quiz and generated.ai = false */
  ai?: boolean
  /** default env S3_BUCKET_MEDIA */
  bucket?: string
  /** default env CLOUDFRONT_DOMAIN */
  cloudfrontDomain?: string
  /** path of a corrected WebVTT for the target track; skips Transcribe + segmentation (docs/decisions/0007) */
  cues?: string
  /** reuse work/<slug>/{mezz.mp4,transcript.json} when present: no download, ffmpeg or Transcribe (re-measure after a pipeline change, docs/decisions/0008) */
  reuse?: boolean
  /** register of the native tracks where Translate supports it (Settings.Formality, docs/decisions/0008 decision 11); default 'INFORMAL' — 'FORMAL' for lectures/news that address the viewer */
  formality?: Formality
}

/** Every side effect of prepare() goes through this seam; tests use fixtureDeps(), the CLI uses defaultDeps(). */
export interface PrepareDeps {
  exec(cmd: string, args: string[], opts?: { cwd?: string }): Promise<ExecResult>
  transcribe(sourceUri: string, lang: Lang, jobName: string): Promise<TranscribeJson>
  /** opts.formality is bound per clip by prepare(); the fixture double ignores it */
  translate(text: string, from: Lang, to: string, opts?: { formality?: Formality }): Promise<string>
  lemmatizer: Lemmatizer
  /** lemmas, most frequent first */
  freqList(lang: Lang): Promise<string[]>
  /** data/names-{lang}.txt or empty set */
  names(lang: Lang): Promise<Set<string>>
  /** from ./prompts (LING-002 owns the body) */
  gloss: typeof glossWord
  quiz: typeof quizForClip
  /** Bedrock spend so far (LING-002); written to clip.json.cost when present. fixtureDeps() has none. */
  cost?(): PreparedCost
  now(): Date
  log(msg: string): void
}

export interface PrepareResult { clip: PreparedClip; workDir: string; files: { clipJson: string; vtt: Record<string, string>; manifest: string } }
