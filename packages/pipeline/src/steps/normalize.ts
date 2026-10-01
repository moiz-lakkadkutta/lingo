/**
 * Derived from described/packages/pipeline/src/steps/01-probe.ts (docs/decisions/0003-pipeline-sharing.md).
 * Download the source (aws s3 cp), probe it, normalise to a 1080p H.264 + stereo AAC mezzanine.
 */
import type { PrepareDeps } from '../types'

export function ffprobeArgs(src: string): string[] { return ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', src] }
export function ffmpegNormalizeArgs(src: string, dst: string): string[] {
  return ['-y', '-i', src, '-vf', 'scale=-2:1080', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-ac', '2', '-b:a', '192k', dst]
}

/** The source's own extension, lower-cased (`.webm`, `.mkv`, …); `.mp4` when the key has none. */
export function sourceExt(source: string): string {
  const key = source.replace(/[?#].*$/, '').split('/').pop() ?? ''
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(key)
  return m ? `.${m[1]!.toLowerCase()}` : '.mp4'
}

export async function normalize(work: string, source: string, deps: Pick<PrepareDeps, 'exec'>): Promise<{ durationS: number }> {
  const src = `${work}/source${sourceExt(source)}`
  await deps.exec('aws', ['s3', 'cp', source, src])
  const { stdout } = await deps.exec('ffprobe', ffprobeArgs(src))
  const probe = JSON.parse(stdout) as { format?: { duration?: string } }
  const durationS = parseFloat(probe.format?.duration ?? '')
  if (!Number.isFinite(durationS) || durationS <= 0) throw new Error(`ffprobe returned no duration for ${src}`)
  await deps.exec('ffmpeg', ffmpegNormalizeArgs(src, `${work}/mezz.mp4`))
  return { durationS }
}
