/**
 * Turns the manifest into an ordered list of steps per clip (docs/plans/LING-008.md §2.4). Pure: what exists on disk comes in as `fs`,
 * so `--dry-run` and the tests plan without touching the network, AWS or ffmpeg. renderStep() prints a step as the shell line(s) a
 * human could paste; the runner executes the same argv.
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { PrepareInput } from '../types'
import { licenceExpect, licenceUrl } from './licence'
import { isShareAlike, parseTimecode, resolveFrom, segmentKey, segmentSeconds, type BatchClip, type BatchManifest, type LicenceCheck, type ManifestProblem } from './manifest'
import { segmentChanged, segmentFile, transcribes, type Phase } from './estimate'

export const STAGES = ['verify', 'fetch', 'cut', 'upload', 'prepare', 'poster', 'publish-extra'] as const
export type Stage = (typeof STAGES)[number]

export interface Cmd { cmd: string; args: string[] }
interface StepBase { slug: string; skip?: string; block?: string }
export type BatchStep =
  | (StepBase & { stage: 'verify'; check: LicenceCheck; url: string | null; expect: string })
  /**
   * cmds run in order; `probe` checks the duration printed by the ffprobe cmd (before any later cmd runs); `output` is removed when the
   * stage fails; `marker` is written when it succeeds, with `markerKey` (the inputs the output was made from) or else a timestamp.
   */
  | (StepBase & { stage: 'fetch' | 'cut' | 'upload' | 'poster' | 'publish-extra'; cmds: Cmd[]; output?: string; marker?: string; markerKey?: string; probe?: { atLeast?: number; expect?: number; tolerance?: number } })
  /**
   * transcribe: this prepare run will call Amazon Transcribe (no --cues, no reusable transcript); markerKey: identity of the inputs, written
   * to `marker` on success; segment: written to work/<slug>/.segment.json before prepare runs; invalidate: files made from an earlier
   * segment or source, removed before prepare runs.
   */
  | (StepBase & { stage: 'prepare'; input: PrepareInput; region: string; transcribe: boolean; marker: string; markerKey: string; segment: { file: string; key: string }; invalidate?: string[] })

export interface PlanOpts {
  phase: Phase
  /** absolute work root (prepare's --work) */
  work: string
  /** directory of the manifest: `cues` paths resolve against it */
  manifestDir: string
  stages?: readonly Stage[]
  only?: string[]
  allowUnconfirmed?: boolean
  forceAi?: boolean
  /** with forceAi: publish as well (the final phase publishes by default; --force-ai alone does not) */
  publish?: boolean
  /** S3_BUCKET_MEDIA; when unset the commands show the literal `$S3_BUCKET_MEDIA` */
  bucket?: string
  cloudfrontDomain?: string
  /** AWS_REGION for Transcribe/Translate (default eu-central-1) */
  region?: string
  /** from validateManifest(): a clip with problems is blocked on its first planned step */
  problems?: ManifestProblem[]
}
export interface FsState { exists(path: string): boolean; read?(path: string): string | undefined }

export class GateCPendingError extends Error {
  constructor(manifestPath = 'content/clips.json') {
    super([
      `phase final refused: ${manifestPath} has "gateC": "pending". The final phase writes Nova glosses and quiz items and publishes them;`,
      'set "gateC": "passed" only after docs/decisions/0001 records Gate C passing (LING-002).',
      'If Gate C is still not passing by Oct 13, the fallback is a decision for the human (docs/plans/LING-008.md open question 5):',
      'publish the draft (--no-ai) cues and highlights without glosses or quiz, move the content freeze, or publish only the clips that pass a spot check.',
      '--force-ai overrides this guard for a deliberate test run; it writes glosses and quiz items locally and publishes nothing unless --publish is also given.',
      'To test glosses without a batch run, use pnpm pipeline spot-check.',
    ].join('\n'))
  }
}

const BUCKET_VAR = '$S3_BUCKET_MEDIA'
const SAFE = /^[A-Za-z0-9_\-.,:/=@+]+$/
/** POSIX shell quoting: bare when safe; double quotes when the arg carries the `$S3_BUCKET_MEDIA` placeholder (so the shell expands it); single quotes otherwise. */
export function shellQuote(arg: string): string {
  if (arg !== '' && SAFE.test(arg)) return arg
  if (arg.includes(BUCKET_VAR)) {
    const parts = arg.split(BUCKET_VAR).map((p) => p.replace(/[\\"`$]/g, (c) => `\\${c}`))
    return `"${parts.join(BUCKET_VAR)}"`
  }
  return `'${arg.replace(/'/g, `'\\''`)}'`
}
const line = (c: Cmd) => [c.cmd, ...c.args].map(shellQuote).join(' ')

const PROBE = (file: string): Cmd => ({ cmd: 'ffprobe', args: ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file] })
const num = (n: number) => String(Math.round(n * 1000) / 1000)
const sourceExt = (url: string) => /\.(webm|mp4|mkv|mov|ogv)$/i.exec(new URL(url).pathname)?.[1]?.toLowerCase() ?? 'mp4'

/** Licence + attribution line written as a NOTE into the derived VTTs of BY-SA clips (docs/content.md §5). */
export const vttNoteFor = (c: BatchClip) => (isShareAlike(c) ? `${c.license} ${c.licenseUrl} — ${c.attribution}. Subtitles and translations by Lingo, same licence.` : undefined)

/** The s3:// URI prepare reads: the manifest's sourceS3 or the batch upload key. */
export const sourceUriFor = (c: BatchClip, bucket?: string) => (c.sourceS3 ?? `s3://${BUCKET_VAR}/clips/${c.slug}.mp4`).split(BUCKET_VAR).join(bucket ?? BUCKET_VAR)

export function paths(work: string, slug: string) {
  return { sources: join(work, '_sources'), cut: join(work, '_cuts', `${slug}.mp4`), cutKey: join(work, '_cuts', `${slug}.cut.json`), uploaded: join(work, '_cuts', `${slug}.uploaded`), dir: join(work, slug) }
}

export function planBatch(m: BatchManifest, o: PlanOpts, fs: FsState, manifestPath?: string): BatchStep[] {
  if (o.phase === 'final' && m.gateC !== 'passed' && !o.forceAi) throw new GateCPendingError(manifestPath)
  const unknown = (o.only ?? []).filter((s) => !m.clips.some((c) => c.slug === s))
  if (unknown.length) throw new Error(`--only: no clip with slug ${unknown.join(', ')} in the manifest`)
  const stages = new Set<Stage>(o.stages ?? STAGES)
  const bucket = o.bucket ?? BUCKET_VAR
  const region = o.region ?? 'eu-central-1'
  const final = o.phase === 'final'
  // --force-ai is for testing the AI stages: it publishes nothing unless --publish says so (review LING-008 M5)
  const publish = final && (!o.forceAi || !!o.publish)
  const out: BatchStep[] = []
  for (const c of m.clips) {
    if (o.only && !o.only.includes(c.slug)) continue
    const p = paths(o.work, c.slug)
    const steps: BatchStep[] = []
    const inS = parseTimecode(c.segment.in), outS = parseTimecode(c.segment.out), lenS = segmentSeconds(c)
    const ext = c.downloadUrl ? sourceExt(c.downloadUrl) : 'mp4'
    const src = join(p.sources, `${c.slug}.${ext}`)
    const preCut = c.sourceS3 ? 'sourceS3 is set (an uploaded cut)' : undefined
    const key = segmentKey(c)
    const changed = segmentChanged(c, o.work, fs)

    if (stages.has('verify')) {
      const check = c.licenceCheck
      steps.push({ slug: c.slug, stage: 'verify', check, url: licenceUrl(check), expect: licenceExpect(c), ...(check.kind === 'manual' && check.verifiedOn ? { skip: `manual check verified on ${check.verifiedOn}` } : {}) })
    }
    if (stages.has('fetch')) {
      // download to .part and rename only after ffprobe passes, so an interrupted download is never taken for a finished one (M1)
      const part = `${src}.part`, srcMarker = `${src}.json`, srcKey = JSON.stringify({ url: c.downloadUrl })
      const skip = preCut ?? (fs.exists(src) && fs.read?.(srcMarker) === srcKey ? `${src} exists (same downloadUrl)` : undefined)
      const curl: Cmd = { cmd: 'curl', args: ['-L', '--fail', '--retry', '3', '--proto', '=https', '--proto-redir', '=https', '-o', part, c.downloadUrl ?? ''] }
      steps.push({ slug: c.slug, stage: 'fetch', cmds: [curl, PROBE(part), { cmd: 'mv', args: ['-f', part, src] }], output: part, marker: srcMarker, markerKey: srcKey, probe: { atLeast: outS }, ...(skip ? { skip } : {}) })
    }
    if (stages.has('cut')) {
      const skip = preCut ?? (fs.exists(p.cut) && fs.read?.(p.cutKey) === key ? `${p.cut} exists (same segment)` : undefined)
      // -ss before -i with re-encoding is frame-accurate (https://trac.ffmpeg.org/wiki/Seeking); -c copy would snap to keyframes (docs/content.md §8)
      const cut: Cmd = { cmd: 'ffmpeg', args: ['-hide_banner', '-loglevel', 'error', '-nostats', '-y', '-ss', num(inS), '-to', num(outS), '-i', src, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-movflags', '+faststart', p.cut] }
      const block = !skip && !c.segment.confirmed && !o.allowUnconfirmed ? `segment ${c.segment.in}–${c.segment.out} is not confirmed: run with --allow-unconfirmed, watch the first and last 10 s of the cut, then set segment.confirmed = true` : undefined
      steps.push({ slug: c.slug, stage: 'cut', cmds: [cut, PROBE(p.cut)], output: p.cut, marker: p.cutKey, markerKey: key, probe: { expect: lenS, tolerance: 1 }, ...(skip ? { skip } : {}), ...(block ? { block } : {}) })
    }
    if (stages.has('upload')) {
      const skip = preCut ?? (fs.read?.(p.uploaded) === key ? `${p.uploaded} matches the segment` : undefined)
      steps.push({ slug: c.slug, stage: 'upload', cmds: [{ cmd: 'aws', args: ['s3', 'cp', p.cut, `s3://${bucket}/clips/${c.slug}.mp4`, '--content-type', 'video/mp4', '--only-show-errors'] }], marker: p.uploaded, markerKey: key, ...(skip ? { skip } : {}) })
    }
    if (stages.has('prepare')) {
      const cues = c.cues ? resolveFrom(o.manifestDir, c.cues) : undefined
      const transcript = join(p.dir, 'transcript.json'), mezz = join(p.dir, 'mezz.mp4')
      // prepare --reuse takes transcript.json and re-normalises a missing mezz.mp4 itself, so the transcript alone is enough (review H2)
      const reuse = !cues && !changed && fs.exists(transcript)
      const segFile = segmentFile(o.work, c.slug)
      const invalidate = changed && !cues ? [mezz, transcript, join(p.dir, 'words.json'), join(p.dir, 'poster.jpg'), join(p.dir, '.poster-published')] : undefined
      const block = changed && cues ? `segment or source changed since ${p.dir} was prepared, and ${cues} was corrected for the old segment: re-time it to ${c.segment.in}–${c.segment.out}, then delete ${segFile} and ${mezz} and re-run` : undefined
      const vttNote = vttNoteFor(c)
      const input: PrepareInput = {
        slug: c.slug, source: sourceUriFor(c, o.bucket), lang: c.lang, natives: c.natives, workRoot: o.work, formality: c.formality,
        publish, ai: final, ...(reuse ? { reuse: true } : {}), ...(cues ? { cues } : {}), ...(vttNote ? { vttNote } : {}),
        ...(o.bucket ? { bucket: o.bucket } : {}), ...(o.cloudfrontDomain ? { cloudfrontDomain: o.cloudfrontDomain } : {}),
      }
      // the marker identifies what was prepared; `reuse` is left out (a re-run that can reuse the transcript prepares the same clip)
      const cuesHash = cues ? createHash('sha256').update(fs.read?.(cues) ?? '').digest('hex') : null
      const markerKey = JSON.stringify({ phase: o.phase, publish, source: input.source, segment: key, lang: c.lang, natives: c.natives, formality: c.formality, cues: cues ?? null, cuesHash, vttNote: vttNote ?? null })
      const marker = join(p.dir, `.batch-${o.phase}.json`)
      const done = !changed && fs.read?.(marker) === markerKey
      // prepare reads the cut from S3: without the upload stage in this run, the uploaded cut must be for this segment, or prepare would
      // transcribe the old cut and record the new segment (PR #2 review C-M1)
      const staleUpload = !c.sourceS3 && !done && !stages.has('upload') && fs.read?.(p.uploaded) !== key
        ? `S3 does not hold the cut for ${c.segment.in}–${c.segment.out} (${p.uploaded} does not match the segment): include the upload stage (e.g. --stages cut,upload,prepare) so prepare reads the new cut`
        : undefined
      const prepBlock = block ?? staleUpload
      steps.push({
        slug: c.slug, stage: 'prepare', input, region, transcribe: transcribes(c, o.work, fs), marker, markerKey, segment: { file: segFile, key },
        ...(invalidate ? { invalidate } : {}), ...(done ? { skip: `prepared (${marker} matches)` } : {}), ...(prepBlock ? { block: prepBlock } : {}),
      })
    }
    if (stages.has('poster')) {
      const poster = join(p.dir, 'poster.jpg')
      const at = c.posterAtS ?? Math.round(lenS * 0.1 * 10) / 10
      const block = changed && !stages.has('prepare') ? `segment or source changed since ${p.dir} was prepared: run the prepare stage first (it replaces mezz.mp4)` : undefined
      steps.push({ slug: c.slug, stage: 'poster', cmds: [{ cmd: 'ffmpeg', args: ['-hide_banner', '-loglevel', 'error', '-nostats', '-y', '-ss', num(at), '-i', join(p.dir, 'mezz.mp4'), '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', poster] }], output: poster, ...(fs.exists(poster) && !changed ? { skip: `${poster} exists` } : {}), ...(block ? { block } : {}) })
    }
    if (stages.has('publish-extra') && publish) {
      const marker = join(p.dir, '.poster-published')
      steps.push({ slug: c.slug, stage: 'publish-extra', cmds: [{ cmd: 'aws', args: ['s3', 'cp', join(p.dir, 'poster.jpg'), `s3://${bucket}/published/${c.slug}/poster.jpg`, '--cache-control', 'public,max-age=60', '--content-type', 'image/jpeg'] }], marker, ...(fs.exists(marker) && !changed ? { skip: `${marker} exists` } : {}) })
    }
    const problems = (o.problems ?? []).filter((x) => x.slug === c.slug)
    if (problems.length && steps[0]) {
      // a blocked step is never also skipped: the runner and the dry run must both report BLOCKED and run nothing for the clip (review H1)
      const first: StepBase = { ...steps[0], block: `manifest: ${problems.map((x) => `${x.field}: ${x.message}`).join('; ')}` }
      delete first.skip
      steps[0] = first as BatchStep
    }
    out.push(...steps)
  }
  return out
}

/**
 * Steps the runner never reaches: everything after a clip's first BLOCKED step (run.ts stops the clip there). The dry run shows them as
 * "not reached", and the "Transcribe will run for" line leaves their clips out (PR #2 review C-L1).
 */
export function unreachedSteps(steps: readonly BatchStep[]): Set<BatchStep> {
  const blocked = new Set<string>(), out = new Set<BatchStep>()
  for (const s of steps) {
    if (blocked.has(s.slug)) out.add(s)
    else if (s.block) blocked.add(s.slug)
  }
  return out
}

/** The prepare CLI line for a step (what the runner calls in-process). */
export function prepareArgv(input: PrepareInput): string[] {
  return [
    '--clip', input.slug, '--source', input.source, '--lang', input.lang, '--native', input.natives.join(','), '--formality', input.formality ?? 'INFORMAL',
    '--work', input.workRoot ?? 'work', ...(input.reuse ? ['--reuse'] : []), ...(input.cues ? ['--cues', input.cues] : []), ...(input.vttNote ? ['--vtt-note', input.vttNote] : []),
    ...(input.ai === false ? ['--no-ai'] : []), ...(input.publish === false ? ['--no-publish'] : []),
  ]
}

export function renderStep(step: BatchStep): string {
  if (step.stage === 'verify') {
    if (step.check.kind === 'manual') return `# manual licence check: open ${step.check.url} — ${step.check.verifiedOn ? `verified on ${step.check.verifiedOn}` : 'not verified yet (set licenceCheck.verifiedOn)'}`
    const jq = step.check.kind === 'ia' ? '.metadata.licenseurl' : '.query.pages[].imageinfo[0].extmetadata.LicenseShortName.value'
    return `curl -s ${shellQuote(step.url!)} | jq -r ${shellQuote(jq)}   # expect ${step.expect}`
  }
  if (step.stage === 'prepare') {
    const rm = step.invalidate ? [`rm -f ${step.invalidate.map(shellQuote).join(' ')}   # made from an earlier segment or source`] : []
    return [...rm, `AWS_REGION=${step.region} pnpm pipeline prepare ${prepareArgv(step.input).map(shellQuote).join(' ')}`].join('\n')
  }
  return step.cmds.map(line).join('\n')
}
