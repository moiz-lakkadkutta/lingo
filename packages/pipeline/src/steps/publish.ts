/**
 * Derived from described/packages/pipeline/src/steps/10-publish.ts (docs/decisions/0003-pipeline-sharing.md).
 * `aws s3 sync` the HLS tree (segments immutable for a year), then re-put the master playlist, the whole-file VTTs (so the app can hand the
 * kit a TextTrack.url when a platform player does not surface a second text track) and clip.json with a 60 s cache. No per-cue Polly loop.
 */
import type { Lang, PrepareDeps } from '../types'
import { textLanguages } from './package'

export function publishCalls(o: { work: string; slug: string; lang: Lang; natives: string[]; bucket: string }): Array<{ cmd: 'aws'; args: string[] }> {
  const W = o.work, base = `s3://${o.bucket}/published/${o.slug}`
  const short = ['--cache-control', 'public,max-age=60']
  const cp = (from: string, to: string, contentType: string) => ({ cmd: 'aws' as const, args: ['s3', 'cp', from, to, ...short, '--content-type', contentType] })
  return [
    { cmd: 'aws', args: ['s3', 'sync', `${W}/hls`, `${base}/`, '--delete', '--cache-control', 'public,max-age=31536000,immutable'] },
    cp(`${W}/hls/master.m3u8`, `${base}/master.m3u8`, 'application/vnd.apple.mpegurl'),
    ...textLanguages(o.lang, o.natives).map((code) => cp(code === o.lang ? `${W}/${o.lang}.vtt` : `${W}/native-${code}.vtt`, `${base}/vtt/${code}.vtt`, 'text/vtt')),
    cp(`${W}/clip.json`, `${base}/clip.json`, 'application/json'),
  ]
}

export async function publish(o: { work: string; slug: string; lang: Lang; natives: string[]; bucket: string; cloudfrontDomain: string }, deps: Pick<PrepareDeps, 'exec' | 'log'>): Promise<string> {
  for (const c of publishCalls(o)) await deps.exec(c.cmd, c.args)
  const url = `https://${o.cloudfrontDomain}/published/${o.slug}`
  deps.log(`published ${url}/master.m3u8`)
  return url
}
