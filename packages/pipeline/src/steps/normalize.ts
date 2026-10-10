/**
 * Derived from described/packages/pipeline/src/steps/01-probe.ts (docs/decisions/0003-pipeline-sharing.md).
 * Download the source (aws s3 cp), probe it, normalise to an H.264 + stereo AAC mezzanine of at most 1080 lines (never upscaled).
 */
import type { PrepareDeps } from '../types'

export function ffprobeArgs(src: string): string[] { return ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', src] }
/** The first video stream of an ffprobe answer: coded size and sample aspect ratio (https://ffmpeg.org/ffprobe.html). */
export interface VideoInfo { width: number; height: number; /** `num:den`; absent, `0:1` or `1:1` = square pixels */ sar?: string }
export const MAX_HEIGHT = 1080

interface ProbeJson { format?: { duration?: string }; streams?: Array<{ codec_type?: string; width?: number; height?: number; sample_aspect_ratio?: string }> }
export function videoOf(probe: ProbeJson): VideoInfo | undefined {
  const v = probe.streams?.find((s) => s.codec_type === 'video')
  if (!v || !(v.width! > 0) || !(v.height! > 0)) return undefined
  return { width: v.width!, height: v.height!, ...(v.sample_aspect_ratio ? { sar: v.sample_aspect_ratio } : {}) }
}

function sarValue(sar: string | undefined): number {
  const m = /^(\d+):(\d+)$/.exec(sar ?? '')
  const n = m ? Number(m[1]) / Number(m[2]) : NaN
  return Number.isFinite(n) && n > 0 ? n : 1
}
const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2)

/**
 * Square pixels (width × SAR, then setsar=1) and at most MAX_HEIGHT lines: a taller source scales down, a smaller one keeps its size
 * (upscaling adds bytes, not detail). Both sides even for libx264 4:2:0. Unknown size: the same rules as an ffmpeg scale expression
 * (https://ffmpeg.org/ffmpeg-filters.html#scale-1, https://ffmpeg.org/ffmpeg-filters.html#setdar_002c-setsar).
 */
export function scaleFilter(v: VideoInfo | undefined): string {
  if (!v) return `scale=w='trunc(iw*sar*min(1,${MAX_HEIGHT}/ih)/2)*2':h='trunc(min(ih,${MAX_HEIGHT})/2)*2',setsar=1`
  const k = Math.min(1, MAX_HEIGHT / v.height)
  return `scale=${even(v.width * sarValue(v.sar) * k)}:${even(v.height * k)},setsar=1`
}

export function ffmpegNormalizeArgs(src: string, dst: string, video?: VideoInfo): string[] {
  // quiet: no banner, errors only, no progress stats (https://ffmpeg.org/ffmpeg.html#Generic-options, https://ffmpeg.org/ffmpeg.html#Main-options)
  return ['-hide_banner', '-loglevel', 'error', '-nostats', '-y', '-i', src, '-vf', scaleFilter(video), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-ac', '2', '-b:a', '192k', dst]
}

/** The source's own extension, lower-cased (`.webm`, `.mkv`, …); `.mp4` when the key has none. */
export function sourceExt(source: string): string {
  const key = source.replace(/[?#].*$/, '').split('/').pop() ?? ''
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(key)
  return m ? `.${m[1]!.toLowerCase()}` : '.mp4'
}

async function probe(file: string, deps: Pick<PrepareDeps, 'exec'>): Promise<{ durationS: number; video?: VideoInfo }> {
  const { stdout } = await deps.exec('ffprobe', ffprobeArgs(file))
  const json = JSON.parse(stdout) as ProbeJson
  const durationS = parseFloat(json.format?.duration ?? '')
  if (!Number.isFinite(durationS) || durationS <= 0) throw new Error(`ffprobe returned no duration for ${file}`)
  const video = videoOf(json)
  return { durationS, ...(video ? { video } : {}) }
}

export async function normalize(work: string, source: string, deps: Pick<PrepareDeps, 'exec'>): Promise<{ durationS: number }> {
  const src = `${work}/source${sourceExt(source)}`
  await deps.exec('aws', ['s3', 'cp', source, src])
  const { durationS, video } = await probe(src, deps)
  await deps.exec('ffmpeg', ffmpegNormalizeArgs(src, `${work}/mezz.mp4`, video))
  return { durationS }
}

/** --cues re-runs: ffprobe the existing mezzanine instead of downloading and encoding again. */
export async function probeMezz(work: string, deps: Pick<PrepareDeps, 'exec'>): Promise<{ durationS: number }> {
  return { durationS: (await probe(`${work}/mezz.mp4`, deps)).durationS }
}
