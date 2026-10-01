import { GateCPendingError, planBatch, renderStep, shellQuote, type BatchStep, type PlanOpts } from '../src/batch/plan'
import { clipRow, fsOf, manifestOf } from './helpers/batch'

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
      "curl -L --fail --retry 3 -o /w/_sources/clip-1.mp4 https://archive.org/download/clip1/clip1.mp4",
      'ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 /w/_sources/clip-1.mp4',
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
    const fs = fsOf('/w/_sources/clip-1.mp4', '/w/_cuts/clip-1.mp4', '/w/_cuts/clip-1.uploaded', '/w/clip-1/poster.jpg')
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

  it('adds --reuse when transcript.json and mezz.mp4 exist, and --cues when the manifest sets cues', () => {
    const m = manifestOf({ lang: 'en', natives: ['de'], cues: 'cues/clip-1.en.vtt' })
    const fresh = stepOf(planBatch(m, base, fsOf()), 'prepare')
    expect(fresh.input.reuse).toBeUndefined(); expect(fresh.input.cues).toBe('/m/cues/clip-1.en.vtt'); expect(fresh.transcribe).toBe(false)
    const reused = stepOf(planBatch(manifestOf(), base, fsOf('/w/clip-1/transcript.json', '/w/clip-1/mezz.mp4')), 'prepare')
    expect(reused.input.reuse).toBe(true); expect(reused.transcribe).toBe(false)
    expect(renderStep(reused)).toContain(' --reuse')
    expect(stepOf(planBatch(manifestOf(), base, fsOf('/w/clip-1/transcript.json')), 'prepare').input.reuse).toBeUndefined()
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
    expect(stepOf(planBatch(m, base, fsOf('/w/_cuts/clip-1.mp4')), 'cut').block).toBeUndefined()
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
    expect(renderStep(stepOf(steps, 'fetch'))).toContain("-o /w/_sources/clip-1.webm 'https://upload.wikimedia.org/x/Drogen_-_Jung_%26_Naiv.webm?a=1&b=2'")
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
