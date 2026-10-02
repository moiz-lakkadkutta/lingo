import type { BatchClip, BatchManifest } from '../../src/batch/manifest'

/** A valid clip row (CC BY 4.0, archive.org check) with overrides; `slug` defaults to clip-<n>. */
export function clipRow(over: Partial<BatchClip> = {}, n = 1): BatchClip {
  return {
    slug: `clip-${n}`, title: `Clip ${n}`, lang: 'de', natives: ['en'], formality: 'INFORMAL',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0', attribution: `Credit ${n} — CC BY 4.0`,
    sourceUrl: `https://archive.org/details/clip${n}`, downloadUrl: `https://archive.org/download/clip${n}/clip${n}.mp4`, sourceS3: null,
    segment: { in: '00:00', out: '04:00', confirmed: true }, expectedDurationS: 240, cues: null, posterAtS: null,
    licenceCheck: { kind: 'ia', id: `clip${n}` }, editorialNote: null,
    ...over,
  }
}

/** Twelve clips (the schema requires 12); `first` overrides row 1, `rest` every other row. */
export function manifestOf(first: Partial<BatchClip> = {}, opts: { gateC?: 'pending' | 'passed'; rest?: Partial<BatchClip> } = {}): BatchManifest {
  return {
    version: 1, gateC: opts.gateC ?? 'pending', bucketEnv: 'S3_BUCKET_MEDIA',
    clips: Array.from({ length: 12 }, (_, i) => (i === 0 ? clipRow(first, 1) : clipRow({ ...opts.rest }, i + 1))),
  }
}

/** fsState over a set of absolute paths. */
export const fsOf = (...paths: string[]) => { const s = new Set(paths); return { exists: (p: string) => s.has(p) } }

/** fsState over files with contents (exists + read), for the marker checks. */
export const fsWith = (files: Record<string, string>) => ({ exists: (p: string) => p in files, read: (p: string) => files[p] })
