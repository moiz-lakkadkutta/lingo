import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BatchManifest, isShareAlike, loadManifest, ManifestError, parseTimecode, validateManifest } from '../src/batch/manifest'
import { clipRow, manifestOf } from './helpers/batch'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const CONTENT = join(REPO, 'content')
const v = (m: BatchManifest, exists: (p: string) => boolean = () => true) => validateManifest(m, { dir: '/m', exists })
const messages = (m: BatchManifest) => v(m).map((p) => `${p.slug ?? '*'} ${p.field}`)

describe('batch manifest', () => {
  it('parses mm:ss and hh:mm:ss[.mmm] timecodes', () => {
    expect(parseTimecode('02:00')).toBe(120); expect(parseTimecode('01:02:03.5')).toBe(3723.5); expect(parseTimecode('00:16.250')).toBe(16.25)
  })

  it('accepts the committed content/clips.json except the documented TBD rows', async () => {
    const raw = JSON.parse(await readFile(join(CONTENT, 'clips.json'), 'utf8')) as { clips: Array<{ slug: string; lang: string; expectedDurationS: number }> }
    const { manifest, problems } = await loadManifest(join(CONTENT, 'clips.json'))
    // Slugs and durations come from the file itself, so swapping a clip (e.g. tears-of-steel → elephants-dream) needs no test edit.
    const slugs = manifest.clips.map((c) => c.slug)
    expect(slugs).toEqual(raw.clips.map((c) => c.slug))
    expect(slugs).toHaveLength(12) // docs/plans/LING-008.md §2.3: twelve rows
    expect(new Set(slugs).size).toBe(slugs.length)
    // §2.3 defaults: six German rows, six English rows
    expect(manifest.clips.filter((c) => c.lang === 'de')).toHaveLength(6)
    expect(manifest.clips.filter((c) => c.lang === 'en')).toHaveLength(6)
    // The human flips gateC to 'passed' once the spot check is scored.
    expect(['pending', 'passed']).toContain(manifest.gateC)
    // Documented TBDs (docs/plans/LING-008.md §2.9 Phase 0). Each may still be open or already fixed by the human;
    // only a problem outside this list fails the test.
    // row 6: the ZDF credit is cut off at "Jochen …" (docs/content.md [^g5]);
    // row 7: the corrected Gate A VTT is copied into content/cues/ by the human.
    const tolerated = new Set(['terra-x-so-trinken-baeume attribution'])
    if (!existsSync(join(CONTENT, 'cues/what-to-do-on-a-date-1950.en.vtt'))) tolerated.add('what-to-do-on-a-date-1950 cues')
    const unexpected = problems.filter((p) => !tolerated.has(`${p.slug} ${p.field}`)).map((p) => `${p.slug} ${p.field}: ${p.message}`)
    expect(unexpected).toEqual([])
    const total = manifest.clips.reduce((s, c) => s + c.expectedDurationS, 0)
    expect(total).toBeCloseTo(raw.clips.reduce((s, c) => s + c.expectedDurationS, 0), 6)
    // Each clip is 3–8 min (manifest schema, docs/content.md "What qualifies"), so the batch is 36–96 min.
    for (const c of manifest.clips) { expect(c.expectedDurationS).toBeGreaterThanOrEqual(180); expect(c.expectedDurationS).toBeLessThanOrEqual(480) }
    expect(total).toBeGreaterThanOrEqual(12 * 180)
    expect(total).toBeLessThanOrEqual(12 * 480)
  })

  it('rejects duplicate slugs, out <= in, and a segment that disagrees with expectedDurationS by more than 2 s', () => {
    const m = manifestOf({ segment: { in: '01:00', out: '01:00', confirmed: true }, expectedDurationS: 240 })
    m.clips[2] = clipRow({ slug: 'clip-2' }, 3) // duplicate of row 2
    m.clips[3] = clipRow({ segment: { in: '00:00', out: '04:03', confirmed: true } }, 4) // 243 s vs 240
    m.clips[4] = clipRow({ segment: { in: '00:00', out: '04:02', confirmed: true } }, 5) // 2 s off: fine
    expect(messages(m).sort()).toEqual(['* slug', 'clip-1 segment', 'clip-4 segment'].sort())
    expect(v(m).find((p) => p.slug === null)!.message).toMatch(/clip-2/)
  })

  it('rejects attribution or title containing …, TBD or TODO', () => {
    const m = manifestOf({ attribution: 'ZDF/TerraX/Jochen … — CC BY 4.0' }, {})
    m.clips[1] = clipRow({ title: 'TBD' }, 2)
    m.clips[2] = clipRow({ attribution: 'TODO credit' }, 3)
    expect(messages(m).sort()).toEqual(['clip-1 attribution', 'clip-2 title', 'clip-3 attribution'])
  })

  it('rejects a licence label outside the register vocabulary and accepts the register labels', () => {
    for (const ok of ['CC BY 3.0', 'CC BY-SA 4.0', 'CC BY 3.0 de', 'Public domain (US)', 'Public domain (VOA)']) expect(messages(manifestOf({ license: ok }))).toEqual([])
    for (const bad of ['CC BY', 'Public domain', 'CC BY-NC 4.0']) expect(messages(manifestOf({ license: bad }))).toEqual(['clip-1 license'])
  })

  it('rejects a natives list containing the clip language or a code without an HLS name', () => {
    expect(messages(manifestOf({ lang: 'de', natives: ['de'] }))).toEqual(['clip-1 natives'])
    expect(messages(manifestOf({ lang: 'en', natives: ['de', 'xx'] }))).toEqual(['clip-1 natives'])
    expect(messages(manifestOf({ lang: 'de', natives: ['en', 'tr', 'ar', 'uk'] }))).toEqual([])
  })

  it('requires exactly one of downloadUrl and sourceS3', () => {
    expect(messages(manifestOf({ downloadUrl: null, sourceS3: null }))).toEqual(['clip-1 downloadUrl'])
    expect(messages(manifestOf({ sourceS3: 's3://$S3_BUCKET_MEDIA/clips/clip-1.mp4' }))).toEqual(['clip-1 downloadUrl'])
    expect(messages(manifestOf({ downloadUrl: null, sourceS3: 's3://$S3_BUCKET_MEDIA/clips/clip-1.mp4' }))).toEqual([])
  })

  it('requires the cues file to exist next to the manifest and to end in .<lang>.vtt', () => {
    const m = manifestOf({ lang: 'en', natives: ['de'], cues: 'cues/clip-1.en.vtt' })
    expect(v(m, (p) => p === '/m/cues/clip-1.en.vtt')).toEqual([])
    expect(v(m, () => false).map((p) => p.field)).toEqual(['cues'])
    expect(v(manifestOf({ lang: 'en', natives: ['de'], cues: 'cues/clip-1.de.vtt' })).map((p) => p.field)).toEqual(['cues'])
  })

  it('reports all problems at once, not the first', async () => {
    const m = manifestOf({ title: 'TODO', attribution: 'x … y', natives: ['de'], downloadUrl: null })
    expect(messages(m).sort()).toEqual(['clip-1 attribution', 'clip-1 downloadUrl', 'clip-1 natives', 'clip-1 title'])
    // schema errors are collected too (zod), and thrown together
    const dir = await mkdtemp(join(tmpdir(), 'lingo-manifest-'))
    try {
      const bad = manifestOf() as unknown as { clips: Array<Record<string, unknown>> }
      bad.clips[0]!.slug = 'Bad Slug'; bad.clips[1]!.lang = 'fr'; bad.clips[2]!.expectedDurationS = 60
      await writeFile(join(dir, 'clips.json'), JSON.stringify(bad))
      const err = await loadManifest(join(dir, 'clips.json')).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ManifestError)
      expect((err as ManifestError).problems.map((p) => p.field)).toEqual(['clips.0.slug', 'clips.1.lang', 'clips.2.expectedDurationS'])
      await mkdir(join(dir, 'x'))
      await writeFile(join(dir, 'x', 'clips.json'), '{ not json')
      await expect(loadManifest(join(dir, 'x', 'clips.json'))).rejects.toThrow(/clips\.json/)
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it('isShareAlike is true only for BY-SA labels', () => {
    expect(isShareAlike(clipRow({ license: 'CC BY-SA 3.0' }))).toBe(true)
    expect(isShareAlike(clipRow({ license: 'CC BY 4.0' }))).toBe(false)
    expect(isShareAlike(clipRow({ license: 'Public domain (US)' }))).toBe(false)
  })
})

describe('review LING-008 fixes (manifest)', () => {
  it('L1: downloadUrl accepts https only', () => {
    for (const bad of ['http://archive.org/x.mp4', 'file:///etc/passwd', 'ftp://x.org/a.mp4']) {
      expect(BatchManifest.safeParse(manifestOf({ downloadUrl: bad })).success).toBe(false)
    }
    expect(BatchManifest.safeParse(manifestOf()).success).toBe(true)
  })
})

