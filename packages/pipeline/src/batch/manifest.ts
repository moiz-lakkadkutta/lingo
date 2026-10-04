/**
 * The clip batch manifest (content/clips.json, docs/plans/LING-008.md §2.2): one row per clip of docs/content.md §2, with the licence,
 * attribution, segment and source exactly as the register states them. Zod checks the shape; validateManifest() checks what Zod cannot
 * (cross-field rules, placeholders, files on disk) and returns every problem at once.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { z } from 'zod'
import { HLS_NAMES } from '../steps/package'

export const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lower-case words joined by "-"')
/** mm:ss or hh:mm:ss, optional .mmm */
export const Timecode = z.string().regex(/^\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?$/, 'mm:ss or hh:mm:ss[.mmm]')
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const LicenceCheck = z.discriminatedUnion('kind', [
  /** https://archive.org/metadata/<id> → metadata.licenseurl must equal the clip's licenseUrl (https://archive.org/developers/md-read.html) */
  z.object({ kind: z.literal('ia'), id: z.string().min(1) }),
  /** File:<file> → imageinfo extmetadata.LicenseShortName must equal the label (https://www.mediawiki.org/wiki/API:Imageinfo) */
  z.object({ kind: z.literal('commons'), file: z.string().min(1) }),
  /** a page only a human can read (schule.zdf.de); verifiedOn is the date the human last opened it */
  z.object({ kind: z.literal('manual'), url: z.string().url(), verifiedOn: IsoDate.nullable() }),
])
export type LicenceCheck = z.infer<typeof LicenceCheck>

export const BatchClip = z.object({
  slug: Slug,
  title: z.string().min(1),
  lang: z.enum(['de', 'en']),
  /** first = gloss/quiz language */
  natives: z.array(z.string().min(2).max(5)).min(1),
  formality: z.enum(['FORMAL', 'INFORMAL']).default('INFORMAL'),
  /** short label exactly as docs/content.md §5: "CC BY 4.0", "CC BY-SA 4.0", "Public domain (US)" */
  license: z.string().min(1),
  licenseUrl: z.string().url(),
  /** character for character from docs/content.md */
  attribution: z.string().min(1),
  /** the page that states the licence */
  sourceUrl: z.string().url(),
  /** null when sourceS3 is given; https only (curl -L would follow file:, ftp: and other schemes) */
  downloadUrl: z.string().url().regex(/^https:\/\//, 'https:// only').nullable(),
  /** an already-uploaded cut (skips fetch/cut/upload); `$S3_BUCKET_MEDIA` is replaced by the env value */
  sourceS3: z.string().regex(/^s3:\/\//, 's3://…').nullable().default(null),
  segment: z.object({ in: Timecode, out: Timecode, confirmed: z.boolean() }),
  /** 3–8 min (docs/content.md "What qualifies") */
  expectedDurationS: z.number().min(180).max(480),
  /** corrected target VTT, relative to the manifest's directory (cues/<slug>.<lang>.vtt) → prepare --cues */
  cues: z.string().min(1).nullable().default(null),
  /** default 10 % of the duration */
  posterAtS: z.number().nonnegative().nullable().default(null),
  licenceCheck: LicenceCheck,
  editorialNote: z.string().nullable().default(null),
})
export type BatchClip = z.infer<typeof BatchClip>

export const BatchManifest = z.object({
  version: z.literal(1),
  /** the human flips this when docs/decisions/0001 records Gate C passing; the final phase refuses 'pending' */
  gateC: z.enum(['pending', 'passed']),
  bucketEnv: z.literal('S3_BUCKET_MEDIA'),
  /** reserve swaps keep the count at 12 (8 published is acceptable per PLAN §14: process a subset with --only) */
  clips: z.array(BatchClip).length(12),
})
export type BatchManifest = z.infer<typeof BatchManifest>

/** slug null = a problem of the whole manifest (fatal for a real run); otherwise it blocks that clip only. */
export interface ManifestProblem { slug: string | null; field: string; message: string }

export class ManifestError extends Error {
  constructor(readonly path: string, readonly problems: ManifestProblem[]) {
    super(`${path}: ${problems.length} problem(s)\n${problems.map((p) => `  ${p.slug ? `${p.slug} ` : ''}${p.field}: ${p.message}`).join('\n')}`)
  }
}

/** Licence labels used by docs/content.md §2/§5. */
export const LICENSE_LABEL = /^(CC BY(-SA)? \d\.\d( [a-z]{2})?|Public domain \((US|VOA)\))$/
const PLACEHOLDER = /…|\bTBD\b|\bTODO\b/

export const isShareAlike = (clip: Pick<BatchClip, 'license'>) => /BY-SA/.test(clip.license)

export function parseTimecode(t: string): number {
  const parts = t.split(':').map(Number)
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}
export const segmentSeconds = (clip: Pick<BatchClip, 'segment'>) => parseTimecode(clip.segment.out) - parseTimecode(clip.segment.in)

/**
 * Identity of a clip's media: the segment (in seconds, so "4:00" and "04:00" agree) and where it comes from. The cut, upload and prepare
 * markers store it, so editing the segment or the source re-runs every stage downstream of it (docs/reviews LING-008 M1).
 */
export const segmentKey = (clip: Pick<BatchClip, 'segment' | 'downloadUrl' | 'sourceS3'>) =>
  JSON.stringify({ in: parseTimecode(clip.segment.in), out: parseTimecode(clip.segment.out), url: clip.downloadUrl ?? clip.sourceS3 })

export const resolveFrom = (dir: string, p: string) => (isAbsolute(p) ? p : resolve(dir, p))

/** Cross-field rules (docs/plans/LING-008.md §2.2), all collected. `dir` resolves `cues`. */
export function validateManifest(m: BatchManifest, o: { dir: string; exists(path: string): boolean }): ManifestProblem[] {
  const out: ManifestProblem[] = []
  const seen = new Map<string, number>()
  for (const c of m.clips) seen.set(c.slug, (seen.get(c.slug) ?? 0) + 1)
  const dups = [...seen].filter(([, n]) => n > 1).map(([s]) => s)
  if (dups.length) out.push({ slug: null, field: 'slug', message: `duplicate slug(s): ${dups.join(', ')}` })
  for (const c of m.clips) {
    const add = (field: string, message: string) => out.push({ slug: c.slug, field, message })
    const inS = parseTimecode(c.segment.in), outS = parseTimecode(c.segment.out)
    if (outS <= inS) add('segment', `out ${c.segment.out} is not after in ${c.segment.in}`)
    else if (Math.abs(outS - inS - c.expectedDurationS) > 2) add('segment', `${c.segment.in}–${c.segment.out} is ${outS - inS} s but expectedDurationS is ${c.expectedDurationS} (more than 2 s apart)`)
    if (PLACEHOLDER.test(c.title)) add('title', `title contains a placeholder (…, TBD or TODO): ${JSON.stringify(c.title)}`)
    if (PLACEHOLDER.test(c.attribution)) add('attribution', `attribution contains a placeholder (…, TBD or TODO) — copy the full credit line from the source page: ${JSON.stringify(c.attribution)}`)
    if (!LICENSE_LABEL.test(c.license)) add('license', `${JSON.stringify(c.license)} is not a register label (CC BY x.y, CC BY-SA x.y, optional port like " de", Public domain (US|VOA))`)
    const badNatives = c.natives.filter((n) => n === c.lang || !(n in HLS_NAMES))
    if (badNatives.length) add('natives', `${badNatives.join(', ')}: a native must differ from lang ${c.lang} and have an HLS name (${Object.keys(HLS_NAMES).join(', ')})`)
    if ((c.downloadUrl === null) === (c.sourceS3 === null)) add('downloadUrl', 'set exactly one of downloadUrl and sourceS3')
    if (c.cues !== null) {
      if (!c.cues.endsWith(`.${c.lang}.vtt`)) add('cues', `${c.cues} must end in .${c.lang}.vtt`)
      else if (!o.exists(resolveFrom(o.dir, c.cues))) add('cues', `${resolveFrom(o.dir, c.cues)} does not exist (copy the corrected VTT there)`)
    }
  }
  return out
}

/** Read, parse (all schema errors at once → ManifestError) and validate. Paths in the manifest resolve against its directory. */
export async function loadManifest(path: string, o: { exists?(path: string): boolean } = {}): Promise<{ manifest: BatchManifest; problems: ManifestProblem[]; path: string; dir: string }> {
  const abs = resolve(path)
  let raw: unknown
  try { raw = JSON.parse(await readFile(abs, 'utf8')) } catch (e) { throw new Error(`${abs}: ${(e as Error).message}`) }
  const parsed = BatchManifest.safeParse(raw)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => {
      const idx = i.path[0] === 'clips' && typeof i.path[1] === 'number' ? i.path[1] : null
      const slug = idx !== null ? ((raw as { clips?: Array<{ slug?: unknown }> }).clips?.[idx]?.slug as string | undefined) ?? null : null
      return { slug: typeof slug === 'string' ? slug : null, field: i.path.join('.'), message: i.message }
    })
    throw new ManifestError(abs, problems)
  }
  const dir = dirname(abs)
  return { manifest: parsed.data, problems: validateManifest(parsed.data, { dir, exists: o.exists ?? existsSync }), path: abs, dir }
}
