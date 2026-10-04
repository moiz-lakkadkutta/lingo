/**
 * Derived from described/packages/pipeline/src/steps/03-speech.ts (docs/decisions/0003-pipeline-sharing.md).
 * Differences: the source s3:// URI is transcribed directly (no mezzanine re-upload); no OutputBucketName, so the transcript
 * is fetched from Transcribe's pre-signed TranscriptFileUri (valid 15 min) — https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html#how-output ;
 * punctuation items are attached to the preceding word (Described drops them) because Lingo's segmenter splits at sentence ends.
 * API: https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartTranscriptionJob.html · https://docs.aws.amazon.com/transcribe/latest/APIReference/API_GetTranscriptionJob.html
 */
import { GetTranscriptionJobCommand, StartTranscriptionJobCommand, TranscribeClient } from '@aws-sdk/client-transcribe'
import { TranscribeJson, type Lang, type Word } from '../types'

/** pronunciation → Word; punctuation appended to the previous word's text; leading punctuation with no previous word is dropped. */
export function wordsFromTranscribe(t: TranscribeJson): Word[] {
  const out: Word[] = []
  for (const item of t.results.items) {
    const content = item.alternatives[0]!.content
    if (item.type === 'punctuation') { const prev = out.at(-1); if (prev) prev.text += content; continue }
    const w: Word = { start: parseFloat(item.start_time ?? '0'), end: parseFloat(item.end_time ?? item.start_time ?? '0'), text: content }
    if (item.speaker_label) w.speaker = item.speaker_label
    out.push(w)
  }
  return out
}

/** `${slug}-${yyyymmdd-hhmmss}` (UTC); TranscriptionJobName must match ^[0-9a-zA-Z._-]+$. */
export function transcribeJobName(slug: string, at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${at.getUTCFullYear()}${p(at.getUTCMonth() + 1)}${p(at.getUTCDate())}-${p(at.getUTCHours())}${p(at.getUTCMinutes())}${p(at.getUTCSeconds())}`
  return `${slug.replace(/[^0-9a-zA-Z._-]/g, '-')}-${stamp}`
}

/** The two calls transcribeWithAws makes; a TranscribeClient satisfies it, tests pass a mock. */
export interface TranscribeSender {
  send(command: StartTranscriptionJobCommand | GetTranscriptionJobCommand): Promise<{ TranscriptionJob?: { TranscriptionJobStatus?: string; FailureReason?: string; Transcript?: { TranscriptFileUri?: string } } }>
}
export interface TranscribeOptions {
  region?: string
  /** default 5 000 ms */
  pollMs?: number
  /** give up when the job has not finished after this long; default 30 min */
  maxWaitMs?: number
  client?: TranscribeSender
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}
export const TRANSCRIBE_MAX_WAIT_MS = 30 * 60_000

export async function transcribeWithAws(sourceUri: string, lang: Lang, jobName: string, opts: TranscribeOptions = {}): Promise<TranscribeJson> {
  const tc: TranscribeSender = opts.client ?? (new TranscribeClient({ region: opts.region ?? process.env.AWS_REGION ?? 'eu-central-1' }) as unknown as TranscribeSender)
  const pollMs = opts.pollMs ?? 5000
  const maxWaitMs = opts.maxWaitMs ?? TRANSCRIBE_MAX_WAIT_MS
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  await tc.send(new StartTranscriptionJobCommand({ TranscriptionJobName: jobName, Media: { MediaFileUri: sourceUri }, LanguageCode: lang === 'de' ? 'de-DE' : 'en-US', Settings: { ShowSpeakerLabels: true, MaxSpeakerLabels: 6 } }))
  const started = now()
  for (;;) {
    const r = await tc.send(new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }))
    const job = r.TranscriptionJob
    if (job?.TranscriptionJobStatus === 'COMPLETED') {
      const uri = job.Transcript?.TranscriptFileUri
      if (!uri) throw new Error(`transcribe job ${jobName} completed without a TranscriptFileUri`)
      const res = await fetch(uri)
      if (!res.ok) throw new Error(`transcript download failed: ${res.status} ${res.statusText}`)
      return TranscribeJson.parse(await res.json())
    }
    if (job?.TranscriptionJobStatus === 'FAILED') throw new Error(`transcribe job ${jobName} failed: ${job.FailureReason ?? 'unknown reason'}`)
    if (now() - started >= maxWaitMs) {
      const mins = Math.round((maxWaitMs / 60_000) * 10) / 10
      throw new Error(`transcribe job ${jobName} did not finish within ${mins} min (last status ${job?.TranscriptionJobStatus ?? 'unknown'}); check it in the Transcribe console or raise maxWaitMs`)
    }
    await sleep(pollMs)
  }
}
