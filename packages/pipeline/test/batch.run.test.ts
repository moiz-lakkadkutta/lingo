import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
      expect(text).toContain('BLOCKED: manifest: attribution') // row 6 until the human fixes the credit line
      // the final phase is refused while gateC is pending, with the fallback left to the human
      out.length = 0
      expect(await batchCommand(manifest, { phase: 'final', dryRun: true, work }, deps, {})).toBe(1)
      expect(out.join('\n')).toMatch(/open question 5/)
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
