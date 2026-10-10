import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { prepare } from '../src/prepare'
import { fixtureDeps } from '../src/fixtureDeps'
import { nodeRunDeps, runBatch, type RunDeps, type RunOpts } from '../src/batch/run'
import type { PrepareInput } from '../src/types'
import { manifestOf } from './helpers/batch'

const iaOk = (async () => new Response(JSON.stringify({ metadata: { licenseurl: 'https://creativecommons.org/licenses/by/4.0/' } }))) as unknown as typeof fetch

/** Fake exec: curl/ffmpeg create their output file; ffprobe answers 600 s for sources and the segment length for cuts. `failOn` throws. */
function fakeExec(failOn?: (cmd: string, args: string[]) => boolean) {
  const calls: Array<{ cmd: string; args: string[] }> = []
  const exec: RunDeps['exec'] = async (cmd, args) => {
    calls.push({ cmd, args })
    if (failOn?.(cmd, args)) throw new Error(`${cmd} exited with code 1`)
    if (cmd === 'curl') { const out = args[args.indexOf('-o') + 1]!; await mkdir(dirname(out), { recursive: true }); await writeFile(out, 'src') }
    if (cmd === 'ffmpeg') { const out = args[args.length - 1]!; await mkdir(dirname(out), { recursive: true }); await writeFile(out, 'media') }
    if (cmd === 'mv') await rename(args.at(-2)!, args.at(-1)!)
    if (cmd === 'ffprobe') return { stdout: args[args.length - 1]!.includes('/_cuts/') ? '240.04\n' : '600.0\n' }
    return { stdout: '' }
  }
  return Object.assign(exec, { calls })
}
const fixturePrepare = (input: PrepareInput) => prepare(input, fixtureDeps(input.lang))

describe('runBatch', () => {
  let work: string
  let logs: string[]
  const deps = (over: Partial<RunDeps>): RunDeps => ({ ...nodeRunDeps(), fetch: iaOk, exec: fakeExec(), prepare: fixturePrepare, log: (m) => logs.push(m), now: () => new Date('2026-10-05T10:00:00Z'), ...over })
  const opts = (over: Partial<RunOpts> = {}): RunOpts => ({ phase: 'draft', work, manifestDir: '/m', bucket: 'lingo-media-dev-acct', region: 'eu-central-1', ...over })
  beforeEach(async () => { work = await mkdtemp(join(tmpdir(), 'lingo-batch-')); logs = [] })
  afterEach(async () => { await rm(work, { recursive: true, force: true }) })

  it('writes batch-report.json and .md with one row per clip', async () => {
    const report = await runBatch(manifestOf(), opts(), deps({}))
    expect(report.rows.map((r) => r.status)).toEqual(Array(12).fill('ok'))
    const json = JSON.parse(await readFile(join(work, 'batch-report.json'), 'utf8')) as typeof report
    expect(json.rows).toHaveLength(12); expect(json.phase).toBe('draft'); expect(json.at).toBe('2026-10-05T10:00:00.000Z')
    const row = json.rows[0]!
    expect(row).toMatchObject({ slug: 'clip-1', status: 'ok', gate: 'pass' })
    expect(row.cues).toBeGreaterThan(5); expect(typeof row.level).toBe('string'); expect(row.highlights).toBeGreaterThanOrEqual(0)
    const clip = JSON.parse(await readFile(join(work, 'clip-1/clip.json'), 'utf8')) as { generated: { ai: boolean }; publishedBase: unknown }
    expect(clip.generated.ai).toBe(false); expect(clip.publishedBase).toBeNull()
    const md = await readFile(join(work, 'batch-report.md'), 'utf8')
    expect(md.split('\n').filter((l) => /^\| clip-\d+ \|/.test(l))).toHaveLength(12)
    expect(md).toContain('## Needs a human')
    expect(existsSync(join(work, '_cuts/clip-1.uploaded'))).toBe(true)
    expect(logs.join('\n')).toMatch(/Transcribe will run for: clip-1, clip-2, .*clip-12 \(48\.0 min\)/)
  })

  it('continues after a failed clip and exits non-zero at the end; --fail-fast stops', async () => {
    const failCut1 = (cmd: string, args: string[]) => cmd === 'ffmpeg' && args.at(-1)!.endsWith('/_cuts/clip-1.mp4')
    const r = await runBatch(manifestOf(), opts({ stages: ['verify', 'fetch', 'cut'] }), deps({ exec: fakeExec(failCut1) }))
    expect(r.rows[0]).toMatchObject({ slug: 'clip-1', status: 'failed', failedStage: 'cut' })
    expect(r.rows[0]!.error).toMatch(/ffmpeg exited/)
    expect(r.rows.slice(1).every((x) => x.status === 'ok')).toBe(true)
    expect(existsSync(join(work, '_cuts/clip-1.mp4'))).toBe(false) // a failed stage leaves no half output behind
    const ff = await runBatch(manifestOf(), opts({ stages: ['verify', 'fetch', 'cut'], failFast: true }), deps({ exec: fakeExec(() => true) }))
    expect(ff.rows.map((x) => x.status)).toEqual(['failed', ...Array(11).fill('skipped')])
  })

  it('fails a clip whose cut does not match the segment length', async () => {
    const exec = fakeExec()
    const short: RunDeps['exec'] = async (cmd, args) => (cmd === 'ffprobe' && args.at(-1)!.includes('/_cuts/') ? { stdout: '200\n' } : exec(cmd, args))
    const r = await runBatch(manifestOf(), opts({ stages: ['fetch', 'cut'], only: ['clip-1'] }), deps({ exec: short }))
    expect(r.rows[0]).toMatchObject({ status: 'failed', failedStage: 'cut' }); expect(r.rows[0]!.error).toMatch(/200\.0 s.*240/)
  })

  it('marks a licence mismatch as a failed verify', async () => {
    const changed = (async () => new Response(JSON.stringify({ metadata: { licenseurl: 'https://creativecommons.org/licenses/by-nc/4.0/' } }))) as unknown as typeof fetch
    const r = await runBatch(manifestOf(), opts({ only: ['clip-1'] }), deps({ fetch: changed }))
    expect(r.rows[0]).toMatchObject({ status: 'failed', failedStage: 'verify' })
  })

  it('marks a gate failure as gate: fail with the --cues hint, not as a crash', async () => {
    const gateFail = async (input: PrepareInput) => {
      const dir = join(input.workRoot!, input.slug); await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'gate.json'), JSON.stringify({ findings: [{ cueIndex: 3, problem: 'cps' }], dropped: [], review: [] }))
      throw new Error('quality gate: 1 finding(s) — cue 3 cps=24.1')
    }
    const r = await runBatch(manifestOf(), opts({ only: ['clip-1'] }), deps({ prepare: gateFail }))
    expect(r.rows[0]).toMatchObject({ status: 'failed', failedStage: 'prepare', gate: 'fail' })
    expect(r.rows[0]!.error).toContain(`edit ${join(work, 'clip-1/de.vtt')}, copy it to content/cues/clip-1.de.vtt, set "cues" in content/clips.json, re-run --only clip-1`)
  })

  it('marks no highlights as failed with the swap hint', async () => {
    const noHighlights = async (input: PrepareInput) => {
      const dir = join(input.workRoot!, input.slug); await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'gate.json'), JSON.stringify({ findings: [], dropped: [], review: [] }))
      await writeFile(join(dir, 'clip.json'), JSON.stringify({ level: 'A2', cues: [{}, {}], highlights: [], warnings: ['no highlights: no countable token has rank ≥ 2000', 'review: rare highlight 9000 sal'] }))
    }
    const r = await runBatch(manifestOf(), opts({ only: ['clip-1'] }), deps({ prepare: noHighlights }))
    expect(r.rows[0]).toMatchObject({ status: 'failed', failedStage: 'prepare', gate: 'pass', highlights: 0, cues: 2 })
    expect(r.rows[0]!.error).toMatch(/swap for a reserve row/)
    expect(await readFile(join(work, 'batch-report.md'), 'utf8')).toContain('review: rare highlight 9000 sal')
  })

  it('resumes from the first missing output', async () => {
    const failPrepare = async () => { throw new Error('Transcribe throttled') }
    const first = await runBatch(manifestOf(), opts({ only: ['clip-1'] }), deps({ prepare: failPrepare }))
    expect(first.rows[0]).toMatchObject({ status: 'failed', failedStage: 'prepare' })
    const exec = fakeExec()
    const second = await runBatch(manifestOf(), opts({ only: ['clip-1'] }), deps({ exec }))
    expect(second.rows[0]!.status).toBe('ok')
    // fetch, cut and upload were done: the second run starts at prepare (fixture prepare has its own exec), then makes the poster
    expect(exec.calls.map((c) => c.cmd)).toEqual(['ffmpeg'])
    expect(exec.calls[0]!.args.at(-1)).toBe(join(work, 'clip-1/poster.jpg'))
    // a third run has nothing left to do: prepare's marker matches, poster exists
    const exec3 = fakeExec(); let prepared = 0
    const third = await runBatch(manifestOf(), opts({ only: ['clip-1'] }), deps({ exec: exec3, prepare: async (i) => { prepared++; return fixturePrepare(i) } }))
    expect(third.rows[0]!.status).toBe('ok'); expect(exec3.calls).toEqual([]); expect(prepared).toBe(0)
    expect(third.rows[0]!.cues).toBeGreaterThan(0) // the report still reads clip.json
  })

  it('refuses a real run that needs the bucket when S3_BUCKET_MEDIA is unset', async () => {
    await expect(runBatch(manifestOf(), opts({ bucket: undefined }), deps({}))).rejects.toThrow(/S3_BUCKET_MEDIA/)
    const local = await runBatch(manifestOf(), opts({ bucket: undefined, stages: ['verify', 'fetch', 'cut'], only: ['clip-2'] }), deps({}))
    expect(local.rows[0]!.status).toBe('ok')
  })

  it('refuses the final phase without CLOUDFRONT_DOMAIN', async () => {
    await expect(runBatch(manifestOf({}, { gateC: 'passed' }), opts({ phase: 'final' }), deps({}))).rejects.toThrow(/CLOUDFRONT_DOMAIN/)
  })

  it('fails a blocked clip (manifest problem) without running anything for it', async () => {
    const exec = fakeExec()
    const r = await runBatch(manifestOf(), opts({ only: ['clip-1', 'clip-2'], stages: ['verify', 'fetch'], problems: [{ slug: 'clip-1', field: 'attribution', message: 'attribution contains "…"' }] }), deps({ exec }))
    expect(r.rows[0]).toMatchObject({ status: 'failed', failedStage: 'verify' }); expect(r.rows[0]!.error).toMatch(/attribution/)
    expect(exec.calls.every((c) => !c.args.join(' ').includes('clip-1'))).toBe(true)
    expect(r.rows[1]!.status).toBe('ok')
  })
})

describe('batch command', () => {
  it('dry-run makes no exec and no fetch calls, prints every clip, command and the estimate, and exits 0', async () => {
    const { batchCommand } = await import('../src/batch/command')
    const { fileURLToPath } = await import('node:url')
    const manifest = join(dirname(fileURLToPath(import.meta.url)), '../../../content/clips.json')
    let execs = 0, fetches = 0, prepares = 0, writes = 0
    const out: string[] = []
    const work = await mkdtemp(join(tmpdir(), 'lingo-dry-'))
    try {
      const deps: RunDeps = {
        ...nodeRunDeps(), log: (m) => out.push(m),
        exec: async () => { execs++; return { stdout: '' } }, fetch: (async () => { fetches++; return new Response('{}') }) as unknown as typeof fetch,
        prepare: async () => { prepares++ }, writeFile: async () => { writes++ },
      }
      const code = await batchCommand(manifest, { phase: 'draft', dryRun: true, work }, deps, { AWS_REGION: 'eu-central-1' })
      expect(code).toBe(0)
      expect({ execs, fetches, prepares, writes }).toEqual({ execs: 0, fetches: 0, prepares: 0, writes: 0 })
      const text = out.join('\n')
      expect(text.match(/^## /gm)).toHaveLength(12)
      expect(text).toContain('Transcribe will run for:')
      expect(text).toMatch(/Cost estimate \(draft \+ final/)
      expect(text).toContain('pnpm pipeline prepare --clip duck-and-cover')
      expect(text).not.toContain('BLOCKED') // every row's credit line is complete since c476e2f
      // gateC is passed (2026-10-10), so the final dry run is accepted; the pending refusal is covered in batch.plan.test.ts
      out.length = 0
      expect(await batchCommand(manifest, { phase: 'final', dryRun: true, work }, deps, {})).toBe(0)
      expect(out.join('\n')).toContain('phase final, gateC passed')
      expect(execs + fetches + prepares + writes).toBe(0)
    } finally { await rm(work, { recursive: true, force: true }) }
  })

  it('resolves a relative manifest path from INIT_CWD (where pnpm was invoked) before the package directory', async () => {
    const { resolveManifestPath } = await import('../src/batch/command')
    const repo = join(dirname(new URL(import.meta.url).pathname), '../../..')
    expect(resolveManifestPath('content/clips.json', { INIT_CWD: repo }, '/elsewhere')).toBe(join(repo, 'content/clips.json'))
    expect(resolveManifestPath('/abs/clips.json', {}, '/x')).toBe('/abs/clips.json')
  })
})

describe('review LING-008 fixes (runBatch)', () => {
  let work: string
  let logs: string[]
  const deps = (over: Partial<RunDeps>): RunDeps => ({ ...nodeRunDeps(), fetch: iaOk, exec: fakeExec(), prepare: fixturePrepare, log: (m) => logs.push(m), now: () => new Date('2026-10-05T10:00:00Z'), ...over })
  const opts = (over: Partial<RunOpts> = {}): RunOpts => ({ phase: 'draft', work, manifestDir: '/m', bucket: 'lingo-media-dev-acct', region: 'eu-central-1', ...over })
  beforeEach(async () => { work = await mkdtemp(join(tmpdir(), 'lingo-batch-')); logs = [] })
  afterEach(async () => { await rm(work, { recursive: true, force: true }) })

  it('H1: a manual-verified clip with a placeholder attribution runs no stage and reports failed', async () => {
    const exec = fakeExec(); let prepared = 0
    const m = manifestOf({ attribution: 'ZDF/Terra X/Jochen … — CC BY 4.0', licenceCheck: { kind: 'manual', url: 'https://schule.zdf.de/x', verifiedOn: '2026-10-03' } })
    const r = await runBatch(m, opts({ only: ['clip-1'], problems: [{ slug: 'clip-1', field: 'attribution', message: 'attribution contains "…"' }] }), deps({ exec, prepare: async () => { prepared++ } }))
    expect(r.rows[0]).toMatchObject({ slug: 'clip-1', status: 'failed', failedStage: 'verify' })
    expect(r.rows[0]!.error).toMatch(/attribution/)
    expect(exec.calls).toEqual([]); expect(prepared).toBe(0)
  })

  it('M1: an interrupted or short download stays a .part file and is fetched again next run', async () => {
    const exec = fakeExec()
    const short: RunDeps['exec'] = async (cmd, args) => (cmd === 'ffprobe' && args.at(-1)!.endsWith('.part') ? { stdout: '100\n' } : exec(cmd, args))
    const r = await runBatch(manifestOf(), opts({ only: ['clip-1'], stages: ['fetch'] }), deps({ exec: short }))
    expect(r.rows[0]).toMatchObject({ status: 'failed', failedStage: 'fetch' })
    expect(exec.calls.map((c) => c.cmd)).toEqual(['curl']) // no mv after the failed probe
    expect(existsSync(join(work, '_sources/clip-1.mp4'))).toBe(false); expect(existsSync(join(work, '_sources/clip-1.mp4.part'))).toBe(false)
    const ok = await runBatch(manifestOf(), opts({ only: ['clip-1'], stages: ['fetch'] }), deps({ exec: fakeExec() }))
    expect(ok.rows[0]!.status).toBe('ok')
    expect(await readFile(join(work, '_sources/clip-1.mp4'), 'utf8')).toBe('src')
  })

  it('M1: editing the segment after a run re-cuts, re-uploads and re-prepares from a fresh transcript', async () => {
    const first = await runBatch(manifestOf(), opts({ only: ['clip-1'] }), deps({}))
    expect(first.rows[0]!.status).toBe('ok')
    await writeFile(join(work, 'clip-1/transcript.json'), 'stale') // would make prepare --reuse fail to parse
    const exec = fakeExec(); const inputs: PrepareInput[] = []
    const edited = manifestOf({ segment: { in: '00:10', out: '04:10', confirmed: true } })
    const second = await runBatch(edited, opts({ only: ['clip-1'] }), deps({ exec, prepare: async (i) => { inputs.push(i); return fixturePrepare(i) } }))
    expect(second.rows[0]!.status).toBe('ok')
    const cut = exec.calls.find((c) => c.cmd === 'ffmpeg' && c.args.at(-1)!.endsWith('/_cuts/clip-1.mp4'))!
    expect(cut.args.slice(cut.args.indexOf('-ss'), cut.args.indexOf('-ss') + 4)).toEqual(['-ss', '10', '-to', '250'])
    expect(exec.calls.some((c) => c.cmd === 'aws' && c.args[1] === 'cp')).toBe(true)
    expect(inputs).toHaveLength(1); expect(inputs[0]!.reuse).toBeUndefined()
    expect(await readFile(join(work, 'clip-1/transcript.json'), 'utf8')).not.toBe('stale')
    expect(exec.calls.some((c) => c.cmd === 'ffmpeg' && c.args.at(-1)!.endsWith('poster.jpg'))).toBe(true)
  })

  it('PR2-C-M1: after a segment edit, --stages prepare and --stages cut,prepare never transcribe the old S3 cut or record the new segment', async () => {
    expect((await runBatch(manifestOf(), opts({ only: ['clip-1'] }), deps({}))).rows[0]!.status).toBe('ok')
    const segFile = join(work, 'clip-1/.segment.json'), marker = join(work, 'clip-1/.batch-draft.json')
    const before = { seg: await readFile(segFile, 'utf8'), marker: await readFile(marker, 'utf8') }
    const edited = manifestOf({ segment: { in: '00:10', out: '04:10', confirmed: true } })
    for (const stages of [['prepare'], ['cut', 'prepare']] as const) {
      const inputs: PrepareInput[] = []
      const r = await runBatch(edited, opts({ only: ['clip-1'], stages: [...stages] }), deps({ prepare: async (i) => { inputs.push(i); return fixturePrepare(i) } }))
      expect(r.rows[0]).toMatchObject({ status: 'failed', failedStage: 'prepare' })
      expect(r.rows[0]!.error).toMatch(/include the upload stage/)
      expect(inputs).toHaveLength(0)
      expect(await readFile(segFile, 'utf8')).toBe(before.seg)
      expect(await readFile(marker, 'utf8')).toBe(before.marker)
    }
    // with the upload stage the new cut reaches S3 first, and prepare runs
    const inputs: PrepareInput[] = []
    const ok = await runBatch(edited, opts({ only: ['clip-1'], stages: ['cut', 'upload', 'prepare'] }), deps({ prepare: async (i) => { inputs.push(i); return fixturePrepare(i) } }))
    expect(ok.rows[0]!.status).toBe('ok'); expect(inputs).toHaveLength(1)
  })

  it('M5: --force-ai runs the final phase without publishing, so it needs no CLOUDFRONT_DOMAIN', async () => {
    const inputs: PrepareInput[] = []; const exec = fakeExec()
    const r = await runBatch(manifestOf(), opts({ phase: 'final', forceAi: true, only: ['clip-1'] }), deps({ exec, prepare: async (i) => { inputs.push(i); return fixturePrepare(i) } }))
    expect(r.rows[0]!.status).toBe('ok')
    expect(inputs[0]).toMatchObject({ ai: true, publish: false })
    expect(exec.calls.some((c) => c.args.join(' ').includes('/published/'))).toBe(false)
    await expect(runBatch(manifestOf(), opts({ phase: 'final', forceAi: true, publish: true, only: ['clip-2'] }), deps({}))).rejects.toThrow(/CLOUDFRONT_DOMAIN/)
  })

  it('L5: a runBatch refusal prints one line, not a stack trace, and exits 1', async () => {
    const { batchCommand } = await import('../src/batch/command')
    const dir = await mkdtemp(join(tmpdir(), 'lingo-man-'))
    try {
      const path = join(dir, 'clips.json')
      await writeFile(path, JSON.stringify(manifestOf()))
      const out: string[] = []
      const code = await batchCommand(path, { phase: 'draft', work, only: 'clip-1' }, deps({ log: (m) => out.push(m) }), {})
      expect(code).toBe(1)
      expect(out.join('\n')).toMatch(/^cannot run: S3_BUCKET_MEDIA is not set/m)
      expect(out.join('\n')).not.toMatch(/\n\s+at /)
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})

