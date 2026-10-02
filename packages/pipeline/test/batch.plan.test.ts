import { GateCPendingError, planBatch, renderStep, shellQuote, unreachedSteps, type BatchStep, type PlanOpts } from '../src/batch/plan'
import { estimateBatch } from '../src/batch/estimate'
import { segmentKey } from '../src/batch/manifest'
import { transcribeLine } from '../src/batch/run'
import { clipRow, fsOf, fsWith, manifestOf } from './helpers/batch'

const W = '/w'
const base: PlanOpts = { phase: 'draft', work: W, manifestDir: '/m', bucket: 'lingo-media-dev-acct', region: 'eu-central-1' }
const stagesOf = (steps: BatchStep[], slug = 'clip-1') => steps.filter((s) => s.slug === slug).map((s) => `${s.stage}${s.skip ? ' (skip)' : ''}${s.block ? ' (blocked)' : ''}`)
const stepOf = <S extends BatchStep['stage']>(steps: BatchStep[], stage: S, slug = 'clip-1') => steps.find((s) => s.slug === slug && s.stage === stage) as BatchStep & { stage: S }

describe('planBatch', () => {
  it('plans verify, fetch, cut, upload, prepare, poster in order for a fresh clip', () => {
    const steps = planBatch(manifestOf(), base, fsOf())
    expect(stagesOf(steps)).toEqual(['verify', 'fetch', 'cut', 'upload', 'prepare', 'poster'])
    expect(new Set(steps.map((s) => s.slug)).size).toBe(12)
    const fetch = stepOf(steps, 'fetch')
    expect(renderStep(fetch)).toBe([
      'curl -L --fail --retry 3 --proto =https --proto-redir =https -o /w/_sources/clip-1.mp4.part https://archive.org/download/clip1/clip1.mp4',
      'ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 /w/_sources/clip-1.mp4.part',
      'mv -f /w/_sources/clip-1.mp4.part /w/_sources/clip-1.mp4',
    ].join('\n'))
    expect(renderStep(stepOf(steps, 'cut'))).toBe([
      'ffmpeg -hide_banner -loglevel error -nostats -y -ss 0 -to 240 -i /w/_sources/clip-1.mp4 -c:v libx264 -preset veryfast -crf 18 -c:a aac -b:a 192k -ac 2 -movflags +faststart /w/_cuts/clip-1.mp4',
      'ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 /w/_cuts/clip-1.mp4',
    ].join('\n'))
    expect(renderStep(stepOf(steps, 'upload'))).toBe('aws s3 cp /w/_cuts/clip-1.mp4 s3://lingo-media-dev-acct/clips/clip-1.mp4 --content-type video/mp4 --only-show-errors')
    expect(renderStep(stepOf(steps, 'verify'))).toBe("curl -s https://archive.org/metadata/clip1 | jq -r .metadata.licenseurl   # expect https://creativecommons.org/licenses/by/4.0")
    expect(renderStep(stepOf(steps, 'poster'))).toBe('ffmpeg -hide_banner -loglevel error -nostats -y -ss 24 -i /w/clip-1/mezz.mp4 -frames:v 1 -vf scale=1280:-2 -q:v 3 /w/clip-1/poster.jpg')
  })

  it('skips what is already on disk (resume) and the stages left out of --stages', () => {
    const key = segmentKey(manifestOf().clips[0]!)
    const fs = fsWith({
      '/w/_sources/clip-1.mp4': '', '/w/_sources/clip-1.mp4.json': JSON.stringify({ url: 'https://archive.org/download/clip1/clip1.mp4' }),
      '/w/_cuts/clip-1.mp4': '', '/w/_cuts/clip-1.cut.json': key, '/w/_cuts/clip-1.uploaded': key, '/w/clip-1/poster.jpg': '',
    })
    expect(stagesOf(planBatch(manifestOf(), base, fs))).toEqual(['verify', 'fetch (skip)', 'cut (skip)', 'upload (skip)', 'prepare', 'poster (skip)'])
    expect(stagesOf(planBatch(manifestOf(), { ...base, stages: ['verify', 'fetch', 'cut'] }, fsOf()))).toEqual(['verify', 'fetch', 'cut'])
  })

  it('skips fetch, cut and upload when sourceS3 is set (and expands $S3_BUCKET_MEDIA)', () => {
    const steps = planBatch(manifestOf({ downloadUrl: null, sourceS3: 's3://$S3_BUCKET_MEDIA/clips/clip-1.mp4' }), base, fsOf())
    expect(stagesOf(steps)).toEqual(['verify', 'fetch (skip)', 'cut (skip)', 'upload (skip)', 'prepare', 'poster'])
    expect(stepOf(steps, 'prepare').input.source).toBe('s3://lingo-media-dev-acct/clips/clip-1.mp4')
    const noBucket = planBatch(manifestOf({ downloadUrl: null, sourceS3: 's3://$S3_BUCKET_MEDIA/clips/clip-1.mp4' }), { ...base, bucket: undefined }, fsOf())
    expect(renderStep(stepOf(noBucket, 'prepare'))).toContain('--source "s3://$S3_BUCKET_MEDIA/clips/clip-1.mp4"')
  })

  it('adds --reuse when transcript.json exists, and --cues when the manifest sets cues', () => {
    const m = manifestOf({ lang: 'en', natives: ['de'], cues: 'cues/clip-1.en.vtt' })
    const fresh = stepOf(planBatch(m, base, fsOf()), 'prepare')
    expect(fresh.input.reuse).toBeUndefined(); expect(fresh.input.cues).toBe('/m/cues/clip-1.en.vtt'); expect(fresh.transcribe).toBe(false)
    const reused = stepOf(planBatch(manifestOf(), base, fsOf('/w/clip-1/transcript.json', '/w/clip-1/mezz.mp4')), 'prepare')
    expect(reused.input.reuse).toBe(true); expect(reused.transcribe).toBe(false)
    expect(renderStep(reused)).toContain(' --reuse')
    expect(stepOf(planBatch(manifestOf(), base, fsOf('/w/clip-1/transcript.json')), 'prepare').input.reuse).toBe(true)
    expect(stepOf(planBatch(manifestOf(), base, fsOf()), 'prepare').transcribe).toBe(true)
  })

  it('renders the draft prepare as --no-ai --no-publish and the final prepare without them', () => {
    const draft = stepOf(planBatch(manifestOf(), base, fsOf()), 'prepare')
    expect(draft.input).toMatchObject({ publish: false, ai: false, workRoot: W, lang: 'de', natives: ['en'], formality: 'INFORMAL' })
    expect(renderStep(draft)).toBe('AWS_REGION=eu-central-1 pnpm pipeline prepare --clip clip-1 --source s3://lingo-media-dev-acct/clips/clip-1.mp4 --lang de --native en --formality INFORMAL --work /w --no-ai --no-publish')
    const finalSteps = planBatch(manifestOf({}, { gateC: 'passed' }), { ...base, phase: 'final' }, fsOf())
    const fin = stepOf(finalSteps, 'prepare')
    expect(fin.input).toMatchObject({ publish: true, ai: true })
    expect(renderStep(fin)).toBe('AWS_REGION=eu-central-1 pnpm pipeline prepare --clip clip-1 --source s3://lingo-media-dev-acct/clips/clip-1.mp4 --lang de --native en --formality INFORMAL --work /w')
    expect(stagesOf(finalSteps)).toEqual(['verify', 'fetch', 'cut', 'upload', 'prepare', 'poster', 'publish-extra'])
    expect(renderStep(stepOf(finalSteps, 'publish-extra'))).toBe('aws s3 cp /w/clip-1/poster.jpg s3://lingo-media-dev-acct/published/clip-1/poster.jpg --cache-control public,max-age=60 --content-type image/jpeg')
  })

  it('refuses phase final while gateC is pending unless forceAi', () => {
    expect(() => planBatch(manifestOf(), { ...base, phase: 'final' }, fsOf())).toThrow(GateCPendingError)
    expect(() => planBatch(manifestOf(), { ...base, phase: 'final' }, fsOf())).toThrow(/gateC.*passed[\s\S]*human/)
    expect(() => planBatch(manifestOf(), { ...base, phase: 'final', forceAi: true }, fsOf())).not.toThrow()
  })

  it('refuses to cut an unconfirmed segment unless allowUnconfirmed', () => {
    const m = manifestOf({ segment: { in: '00:00', out: '04:00', confirmed: false } })
    expect(stepOf(planBatch(m, base, fsOf()), 'cut').block).toMatch(/confirm/)
    expect(stepOf(planBatch(m, { ...base, allowUnconfirmed: true }, fsOf()), 'cut').block).toBeUndefined()
    // a cut that already exists was confirmed by whoever kept it
    expect(stepOf(planBatch(m, base, fsWith({ '/w/_cuts/clip-1.mp4': '', '/w/_cuts/clip-1.cut.json': segmentKey(m.clips[0]!) })), 'cut').block).toBeUndefined()
  })

  it('blocks a clip that has manifest problems, on its first planned step', () => {
    const steps = planBatch(manifestOf(), { ...base, problems: [{ slug: 'clip-1', field: 'attribution', message: 'attribution contains "…"' }] }, fsOf())
    expect(steps.find((s) => s.slug === 'clip-1')!.block).toMatch(/attribution/)
    expect(steps.filter((s) => s.slug === 'clip-2').every((s) => !s.block)).toBe(true)
  })

  it('sets vttNote only for BY-SA licences', () => {
    const sa = stepOf(planBatch(manifestOf({ license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0', attribution: 'ZDF Terra X Redaktion — CC BY-SA 4.0' }), base, fsOf()), 'prepare')
    expect(sa.input.vttNote).toBe('CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0 — ZDF Terra X Redaktion — CC BY-SA 4.0. Subtitles and translations by Lingo, same licence.')
    expect(renderStep(sa)).toContain(`--vtt-note 'CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0 — ZDF Terra X Redaktion — CC BY-SA 4.0. Subtitles and translations by Lingo, same licence.'`)
    expect(stepOf(planBatch(manifestOf(), base, fsOf()), 'prepare').input.vttNote).toBeUndefined()
  })

  it('renders every command as a copy-pasteable shell line (quotes URLs with & and %)', () => {
    const m = manifestOf({ downloadUrl: 'https://upload.wikimedia.org/x/Drogen_-_Jung_%26_Naiv.webm?a=1&b=2', attribution: "O'Brien — CC BY 4.0" })
    const steps = planBatch(m, base, fsOf())
    expect(renderStep(stepOf(steps, 'fetch'))).toContain("-o /w/_sources/clip-1.webm.part 'https://upload.wikimedia.org/x/Drogen_-_Jung_%26_Naiv.webm?a=1&b=2'")
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
    expect(shellQuote('plain/path-1.mp4')).toBe('plain/path-1.mp4')
    expect(shellQuote('')).toBe("''")
    expect(shellQuote('s3://$S3_BUCKET_MEDIA/a b')).toBe('"s3://$S3_BUCKET_MEDIA/a b"')
    expect(shellQuote('s3://$S3_BUCKET_MEDIA/$HOME`x`')).toBe('"s3://$S3_BUCKET_MEDIA/\\$HOME\\`x\\`"')
    const commons = planBatch(manifestOf({ licenceCheck: { kind: 'commons', file: 'Drogen_-_Jung_&_Naiv_Folge_81_-_YouTube.webm' }, license: 'CC BY 3.0' }), base, fsOf())
    expect(renderStep(stepOf(commons, 'verify'))).toBe("curl -s 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=File%3ADrogen_-_Jung_%26_Naiv_Folge_81_-_YouTube.webm' | jq -r '.query.pages[].imageinfo[0].extmetadata.LicenseShortName.value'   # expect CC BY 3.0")
    const manual = planBatch(manifestOf({ licenceCheck: { kind: 'manual', url: 'https://schule.zdf.de/x', verifiedOn: '2026-10-03' } }), base, fsOf())
    expect(stepOf(manual, 'verify').skip).toMatch(/2026-10-03/)
    expect(renderStep(stepOf(manual, 'verify'))).toBe('# manual licence check: open https://schule.zdf.de/x — verified on 2026-10-03')
  })

  it('--only plans a subset and rejects an unknown slug', () => {
    expect(new Set(planBatch(manifestOf(), { ...base, only: ['clip-3', 'clip-5'] }, fsOf()).map((s) => s.slug))).toEqual(new Set(['clip-3', 'clip-5']))
    expect(() => planBatch(manifestOf(), { ...base, only: ['nope'] }, fsOf())).toThrow(/nope/)
  })

  it('uses posterAtS when set and the source extension of the download URL', () => {
    const steps = planBatch(manifestOf({ posterAtS: 12.5, downloadUrl: 'https://x.org/a/file.webm' }), base, fsOf())
    expect(renderStep(stepOf(steps, 'poster'))).toContain('-ss 12.5 ')
    expect(renderStep(stepOf(steps, 'fetch'))).toContain('/w/_sources/clip-1.webm')
    expect(clipRow().slug).toBe('clip-1')
  })
})

describe('review LING-008 fixes (planBatch)', () => {
  const attributionProblem = [{ slug: 'clip-1', field: 'attribution', message: 'attribution contains "…"' }]

  it('H1: a manifest block on a skipped first step drops the skip, so the step reports BLOCKED', () => {
    const m = manifestOf({ licenceCheck: { kind: 'manual', url: 'https://schule.zdf.de/x', verifiedOn: '2026-10-03' } })
    const verify = stepOf(planBatch(m, { ...base, problems: attributionProblem }, fsOf()), 'verify')
    expect(verify.block).toMatch(/attribution/); expect(verify.skip).toBeUndefined()
  })

  it('H2: transcript.json without mezz.mp4 → --reuse and no Transcribe; plan, spend line and estimate agree', () => {
    const fs = fsOf('/w/clip-1/transcript.json')
    const steps = planBatch(manifestOf(), base, fs)
    const prep = stepOf(steps, 'prepare')
    expect(prep.input.reuse).toBe(true); expect(prep.transcribe).toBe(false); expect(renderStep(prep)).toContain(' --reuse')
    expect(transcribeLine(steps, manifestOf())).not.toMatch(/\bclip-1\b/)
    expect(estimateBatch(manifestOf(), fs, { work: W, phases: ['draft'] }).transcribe.slugs).not.toContain('clip-1')
  })

  it('M1: an edited segment re-runs cut, upload and prepare (dropping the stale transcript, mezzanine and poster)', () => {
    const old = manifestOf()
    const oldKey = segmentKey(old.clips[0]!)
    const files = {
      '/w/_sources/clip-1.mp4': '', '/w/_sources/clip-1.mp4.json': JSON.stringify({ url: old.clips[0]!.downloadUrl }),
      '/w/_cuts/clip-1.mp4': '', '/w/_cuts/clip-1.cut.json': oldKey, '/w/_cuts/clip-1.uploaded': oldKey,
      '/w/clip-1/transcript.json': '{}', '/w/clip-1/mezz.mp4': '', '/w/clip-1/poster.jpg': '', '/w/clip-1/.segment.json': oldKey,
    }
    const prepKey = stepOf(planBatch(old, base, fsWith(files)), 'prepare').markerKey
    const fs = fsWith({ ...files, '/w/clip-1/.batch-draft.json': prepKey })
    expect(stagesOf(planBatch(old, base, fs))).toEqual(['verify', 'fetch (skip)', 'cut (skip)', 'upload (skip)', 'prepare (skip)', 'poster (skip)'])
    const edited = manifestOf({ segment: { in: '00:10', out: '04:10', confirmed: true } })
    const steps = planBatch(edited, base, fs)
    expect(stagesOf(steps)).toEqual(['verify', 'fetch (skip)', 'cut', 'upload', 'prepare', 'poster'])
    const prep = stepOf(steps, 'prepare')
    expect(prep.input.reuse).toBeUndefined(); expect(prep.transcribe).toBe(true)
    expect(prep.invalidate).toEqual(['/w/clip-1/mezz.mp4', '/w/clip-1/transcript.json', '/w/clip-1/words.json', '/w/clip-1/poster.jpg', '/w/clip-1/.poster-published'])
    expect(prep.segment).toEqual({ file: '/w/clip-1/.segment.json', key: segmentKey(edited.clips[0]!) })
    expect(renderStep(prep).split('\n')[0]).toMatch(/^rm -f \/w\/clip-1\/mezz\.mp4 /)
    expect(estimateBatch(edited, fs, { work: W, phases: ['draft'] }).transcribe.slugs).toContain('clip-1')
    // a corrected cues file was made for the old segment: refuse rather than guess
    const withCues = manifestOf({ segment: { in: '00:10', out: '04:10', confirmed: true }, cues: 'cues/clip-1.de.vtt' })
    expect(stepOf(planBatch(withCues, base, fs), 'prepare').block).toMatch(/re-time it to 00:10–04:10/)
    // a poster-only run cannot use the old mezzanine
    expect(stepOf(planBatch(edited, { ...base, stages: ['poster'] }, fs), 'poster').block).toMatch(/prepare stage first/)
  })

  describe('PR2-C-M1: prepare never runs on a stale S3 cut', () => {
    const old = manifestOf()
    const oldKey = segmentKey(old.clips[0]!)
    const edited = manifestOf({ segment: { in: '00:10', out: '04:10', confirmed: true } })
    const newKey = segmentKey(edited.clips[0]!)
    const files = {
      '/w/_sources/clip-1.mp4': '', '/w/_sources/clip-1.mp4.json': JSON.stringify({ url: old.clips[0]!.downloadUrl }),
      '/w/_cuts/clip-1.mp4': '', '/w/_cuts/clip-1.cut.json': oldKey, '/w/_cuts/clip-1.uploaded': oldKey,
      '/w/clip-1/transcript.json': '{}', '/w/clip-1/mezz.mp4': '', '/w/clip-1/.segment.json': oldKey,
    }
    it('PR2-C-M1: --stages prepare after a segment edit is blocked until the new cut is uploaded', () => {
      const prep = stepOf(planBatch(edited, { ...base, stages: ['prepare'] }, fsWith(files)), 'prepare')
      expect(prep.block).toMatch(/include the upload stage/)
      expect(transcribeLine(planBatch(edited, { ...base, stages: ['prepare'] }, fsWith(files)), edited)).toBe('Transcribe will run for: no clip')
    })
    it('PR2-C-M1: --stages cut,prepare after a segment edit is blocked too (the cut is local, S3 still has the old one)', () => {
      const steps = planBatch(edited, { ...base, stages: ['cut', 'prepare'] }, fsWith(files))
      expect(stagesOf(steps)).toEqual(['cut', 'prepare (blocked)'])
    })
    it('PR2-C-M1: with the upload stage in the run, or once .uploaded matches the new segment, prepare runs', () => {
      expect(stepOf(planBatch(edited, { ...base, stages: ['cut', 'upload', 'prepare'] }, fsWith(files)), 'prepare').block).toBeUndefined()
      expect(stepOf(planBatch(edited, { ...base, stages: ['prepare'] }, fsWith({ ...files, '/w/_cuts/clip-1.uploaded': newKey })), 'prepare').block).toBeUndefined()
    })
    it('PR2-C-M1: a clip with sourceS3 (no batch upload) is never blocked by the upload marker', () => {
      const s3 = manifestOf({ downloadUrl: null, sourceS3: 's3://$S3_BUCKET_MEDIA/clips/clip-1.mp4' })
      expect(stepOf(planBatch(s3, { ...base, stages: ['prepare'] }, fsOf()), 'prepare').block).toBeUndefined()
    })
  })

  it('PR2-C-L1: steps after a BLOCKED step are not reached, and their clip is left out of the Transcribe line', () => {
    const m = manifestOf({ segment: { in: '00:00', out: '04:00', confirmed: false } })
    const steps = planBatch(m, base, fsOf())
    expect(stepOf(steps, 'cut').block).toMatch(/not confirmed/)
    const unreached = unreachedSteps(steps)
    expect(steps.filter((s) => s.slug === 'clip-1' && unreached.has(s)).map((s) => s.stage)).toEqual(['upload', 'prepare', 'poster'])
    expect(transcribeLine(steps, m)).not.toMatch(/\bclip-1\b/)
    // a manifest problem blocks the first step: nothing after it is reached either
    const withProblem = planBatch(manifestOf(), { ...base, problems: [{ slug: 'clip-2', field: 'attribution', message: 'x' }] }, fsOf())
    expect(transcribeLine(withProblem, manifestOf())).not.toMatch(/\bclip-2\b/)
    expect(transcribeLine(withProblem, manifestOf())).toMatch(/\bclip-3\b/)
  })

  it('M1: a changed downloadUrl re-fetches; a source without its marker (an interrupted download) is fetched again', () => {
    const fs = fsWith({ '/w/_sources/clip-1.mp4': '', '/w/_sources/clip-1.mp4.json': JSON.stringify({ url: 'https://archive.org/download/old/old.mp4' }) })
    expect(stepOf(planBatch(manifestOf(), base, fs), 'fetch').skip).toBeUndefined()
    expect(stepOf(planBatch(manifestOf(), base, fsOf('/w/_sources/clip-1.mp4')), 'fetch').skip).toBeUndefined()
    const fetch = stepOf(planBatch(manifestOf(), base, fsOf()), 'fetch')
    expect(fetch.output).toBe('/w/_sources/clip-1.mp4.part'); expect(fetch.marker).toBe('/w/_sources/clip-1.mp4.json')
  })

  it('M5: --force-ai plans no publishing unless --publish is also given', () => {
    const forced = planBatch(manifestOf(), { ...base, phase: 'final', forceAi: true }, fsOf())
    expect(stepOf(forced, 'prepare').input).toMatchObject({ ai: true, publish: false })
    expect(renderStep(stepOf(forced, 'prepare'))).toContain('--no-publish')
    expect(forced.some((s) => s.stage === 'publish-extra')).toBe(false)
    const both = planBatch(manifestOf(), { ...base, phase: 'final', forceAi: true, publish: true }, fsOf())
    expect(stepOf(both, 'prepare').input.publish).toBe(true); expect(both.some((s) => s.stage === 'publish-extra')).toBe(true)
    // a forced run's prepare marker never stands in for the real final run
    expect(stepOf(forced, 'prepare').markerKey).not.toBe(stepOf(planBatch(manifestOf({}, { gateC: 'passed' }), { ...base, phase: 'final' }, fsOf()), 'prepare').markerKey)
    expect(() => planBatch(manifestOf(), { ...base, phase: 'final' }, fsOf())).toThrow(/publishes nothing unless --publish/)
  })
})
