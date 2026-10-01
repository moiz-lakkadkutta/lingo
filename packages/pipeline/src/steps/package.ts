/**
 * Derived from described/packages/pipeline/src/steps/09-package.ts (docs/decisions/0003-pipeline-sharing.md).
 * Shaka Packager → HLS master with one video, ONE audio rendition and one WebVTT text track per language (target first, then each native).
 * No AD rendition, no CHARACTERISTICS; `--default_language` gives the target-language audio and text DEFAULT=YES.
 * Docs: https://shaka-project.github.io/shaka-packager/html/documentation.html · https://shaka-project.github.io/shaka-packager/html/tutorials/hls.html
 */
import type { Lang, PrepareDeps } from '../types'

/** hls_name must be a single ASCII word: descriptor values cannot carry commas and %20 is undocumented. Fallback: the code itself. */
export const HLS_NAMES: Record<string, string> = { de: 'German', en: 'English', tr: 'Turkish', ar: 'Arabic', uk: 'Ukrainian' }
const hlsName = (code: string) => HLS_NAMES[code] ?? code

/** Text tracks: the target language first, then each native in the given order, never the target twice. */
export function textLanguages(lang: Lang, natives: string[]): string[] {
  const out = [lang as string]
  for (const n of natives) if (!out.includes(n)) out.push(n)
  return out
}

export function packagerArgs(o: { work: string; lang: Lang; natives: string[] }): string[] {
  const W = o.work, O = `${W}/hls`, L = o.lang
  const text = textLanguages(L, o.natives).map((code) => {
    const file = code === L ? `${W}/${L}.vtt` : `${W}/native-${code}.vtt`
    return `in=${file},stream=text,segment_template=${O}/text_${code}/$Number$.vtt,playlist_name=text_${code}.m3u8,hls_group_id=text,hls_name=${hlsName(code)},language=${code}`
  })
  return [
    `in=${W}/mezz.mp4,stream=video,segment_template=${O}/video/$Number$.m4s,init_segment=${O}/video/init.mp4,playlist_name=video.m3u8`,
    `in=${W}/mezz.mp4,stream=audio,segment_template=${O}/audio/$Number$.m4s,init_segment=${O}/audio/init.mp4,playlist_name=audio.m3u8,hls_group_id=audio,hls_name=Original,language=${L}`,
    ...text,
    '--segment_duration', '4',
    '--default_language', L,
    '--hls_master_playlist_output', `${O}/master.m3u8`,
  ]
}

export async function pack(o: { work: string; lang: Lang; natives: string[] }, deps: Pick<PrepareDeps, 'exec'>): Promise<string> {
  await deps.exec('packager', packagerArgs(o))
  return `${o.work}/hls/master.m3u8`
}
