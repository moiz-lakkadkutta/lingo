/**
 * Executes planBatch() steps clip by clip (docs/plans/LING-008.md §2.6): a failed stage stops that clip only; the next run resumes from the
 * first stage whose output is missing; a quality-gate failure and "no highlights" are normal outcomes with a hint, not crashes.
 * Every side effect goes through RunDeps so the tests use recorders and the real prepare() on fixtures.
 */
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { execa } from 'execa'
import { prepare as realPrepare } from '../prepare'
import type { PrepareInput } from '../types'
import { checkLicence } from './licence'
import { estimateBatch, type CostEstimate, type Phase } from './estimate'
import type { BatchManifest } from './manifest'
import { planBatch, renderStep, type BatchStep, type PlanOpts } from './plan'

export interface RunDeps {
  exec(cmd: string, args: string[]): Promise<{ stdout: string }>
  fetch: typeof fetch
  /** in-process prepare(); the CLI passes the real one with AWS deps */
  prepare(input: PrepareInput): Promise<unknown>
  exists(path: string): boolean
  read(path: string): string | undefined
  readFile(path: string): Promise<string>
  writeFile(path: string, data: string): Promise<void>
  rm(path: string): Promise<void>
  log(msg: string): void
  now(): Date
}

export interface RunOpts extends PlanOpts {
  failFast?: boolean
  /** report path without extension (default <work>/batch-report → .json and .md) */
  report?: string
  /** shown in hints (default content/clips.json) */
  manifestLabel?: string
}

export interface BatchRow {
  slug: string; status: 'ok' | 'failed' | 'skipped'; failedStage?: string; error?: string
  level?: string; cues?: number; highlights?: number; quiz?: number; warnings: string[]; dropped?: number
  gate: 'pass' | 'fail' | 'n/a'; costUsd?: number; seconds: number
}
export interface BatchReport { phase: Phase; at: string; rows: BatchRow[]; estimate: CostEstimate }

export function nodeRunDeps(): RunDeps {
  return {
    exec: async (cmd, args) => { const r = await execa(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }); return { stdout: r.stdout } },
    fetch: (...a) => fetch(...a),
    prepare: (input) => realPrepare(input),
    exists: (p) => existsSync(p),
    read: (p) => { try { return readFileSync(p, 'utf8') } catch { return undefined } },
    readFile: (p) => readFile(p, 'utf8'),
    writeFile: async (p, d) => { await mkdir(dirname(p), { recursive: true }); await writeFile(p, d) },
    rm: (p) => rm(p, { force: true }),
    log: (m) => console.log(m),
    now: () => new Date(),
  }
}

class StageError extends Error { constructor(message: string, readonly gate?: 'fail') { super(message) } }

const NEEDS_BUCKET = new Set(['upload', 'prepare', 'publish-extra'])
const reviewLines = (r: BatchRow) => r.warnings.filter((w) => w.startsWith('review:'))

export function transcribeLine(steps: BatchStep[], m: BatchManifest): string {
  const tr = steps.filter((s): s is Extract<BatchStep, { stage: 'prepare' }> => s.stage === 'prepare' && s.transcribe && !s.skip && !s.block)
  if (!tr.length) return 'Transcribe will run for: no clip'
  const min = tr.reduce((s, x) => s + (m.clips.find((c) => c.slug === x.slug)?.expectedDurationS ?? 0), 0) / 60
  return `Transcribe will run for: ${tr.map((x) => x.slug).join(', ')} (${min.toFixed(1)} min)`
}

export async function runBatch(m: BatchManifest, o: RunOpts, deps: RunDeps): Promise<BatchReport> {
  const fsState = { exists: deps.exists, read: deps.read }
  const steps = planBatch(m, o, fsState)
  const live = steps.filter((s) => !s.skip && !s.block)
  if (!o.bucket && live.some((s) => NEEDS_BUCKET.has(s.stage))) throw new Error('S3_BUCKET_MEDIA is not set: the upload, prepare and publish-extra stages need it (the media bucket from the lingo-media-dev stack output, lingo-media-<stage>-<account>)')
  if (o.phase === 'final' && !o.cloudfrontDomain && live.some((s) => s.stage === 'prepare' || s.stage === 'publish-extra')) throw new Error('CLOUDFRONT_DOMAIN is not set: the final phase publishes (the CdnDomain output of the lingo-media-dev stack)')
  const estimate = estimateBatch(m, fsState, { work: o.work, phases: o.phase === 'draft' ? ['draft', 'final'] : ['final'], ...(o.only ? { only: o.only } : {}) })
  deps.log(transcribeLine(steps, m))
  const label = o.manifestLabel ?? 'content/clips.json'
  const rows: BatchRow[] = []
  let stop = false
  for (const clip of m.clips) {
    if (o.only && !o.only.includes(clip.slug)) continue
    const row: BatchRow = { slug: clip.slug, status: 'ok', warnings: [], gate: 'n/a', seconds: 0 }
    rows.push(row)
    if (stop) { row.status = 'skipped'; continue }
    const t0 = deps.now().getTime()
    const dir = join(o.work, clip.slug)
    let prepared = false
    for (const step of steps.filter((s) => s.slug === clip.slug)) {
      if (step.skip) { deps.log(`[${clip.slug}] ${step.stage}: skip (${step.skip})`); if (step.stage === 'prepare') prepared = true; continue }
      try {
        if (step.block) throw new StageError(step.block)
        deps.log(`[${clip.slug}] ${step.stage}: ${renderStep(step).split('\n')[0]}`)
        if (step.stage === 'verify') {
          const r = await checkLicence(clip, deps.fetch)
          if (!r.ok) throw new StageError(r.message)
          deps.log(`[${clip.slug}] verify: ${r.message}`)
        } else if (step.stage === 'prepare') {
          try { await deps.prepare(step.input) } catch (e) {
            const msg = (e as Error).message
            if (msg.startsWith('quality gate:')) {
              const vtt = join(dir, `${clip.lang}.vtt`)
              throw new StageError(`${msg.split('\n')[0]}\nedit ${vtt}, copy it to content/cues/${clip.slug}.${clip.lang}.vtt, set "cues" in ${label}, re-run --only ${clip.slug}`, 'fail')
            }
            throw e
          }
          await deps.writeFile(step.marker, step.markerKey)
          prepared = true
        } else {
          let stdout = ''
          for (const c of step.cmds) stdout = (await deps.exec(c.cmd, c.args)).stdout
          if (step.probe) {
            const d = parseFloat(stdout.trim())
            const file = step.cmds.at(-1)!.args.at(-1)!
            if (!Number.isFinite(d)) throw new StageError(`ffprobe printed no duration for ${file}`)
            if (step.probe.atLeast !== undefined && d < step.probe.atLeast) throw new StageError(`${file} is ${d.toFixed(1)} s, shorter than the segment out-point ${step.probe.atLeast} s`)
            if (step.probe.expect !== undefined && Math.abs(d - step.probe.expect) > (step.probe.tolerance ?? 1)) throw new StageError(`${file} is ${d.toFixed(1)} s, expected ${step.probe.expect} s ± ${step.probe.tolerance ?? 1}`)
          }
          if (step.marker) await deps.writeFile(step.marker, deps.now().toISOString())
        }
      } catch (e) {
        row.status = 'failed'; row.failedStage = step.stage; row.error = (e as Error).message
        if (e instanceof StageError && e.gate) row.gate = 'fail'
        if ('output' in step && step.output && deps.exists(step.output)) await deps.rm(step.output) // no half output: the next run redoes this stage
        deps.log(`[${clip.slug}] ${step.stage} FAILED: ${row.error}`)
        break
      }
    }
    if (prepared || row.failedStage === 'prepare') await readOutputs(row, dir, deps)
    if (row.status === 'ok' && prepared && row.warnings.some((w) => w.startsWith('no highlights:'))) {
      row.status = 'failed'; row.failedStage = 'prepare'; row.error = 'no highlights: the clip teaches nothing above its level — swap for a reserve row (docs/content.md §3), then re-run --only <new-slug>'
    }
    row.seconds = Math.round((deps.now().getTime() - t0) / 100) / 10
    if (row.status === 'failed' && o.failFast) stop = true
  }
  const report: BatchReport = { phase: o.phase, at: deps.now().toISOString(), rows, estimate }
  const base = o.report ?? join(o.work, 'batch-report')
  await deps.writeFile(`${base}.json`, JSON.stringify(report, null, 2) + '\n')
  await deps.writeFile(`${base}.md`, renderReportMd(report, m))
  return report
}

/** Values from work/<slug>/clip.json and gate.json after prepare (§2.7). */
async function readOutputs(row: BatchRow, dir: string, deps: RunDeps): Promise<void> {
  const json = async <T>(f: string): Promise<T | undefined> => (deps.exists(join(dir, f)) ? (JSON.parse(await deps.readFile(join(dir, f))) as T) : undefined)
  const gate = await json<{ findings?: unknown[]; dropped?: unknown[] }>('gate.json')
  if (gate) { if (row.gate !== 'fail') row.gate = gate.findings?.length ? 'fail' : 'pass'; row.dropped = gate.dropped?.length ?? 0 }
  if (row.failedStage === 'prepare' && row.gate === 'fail') return // clip.json is from an earlier run, if any
  const clip = await json<{ level?: string; cues?: unknown[]; highlights?: unknown[]; quiz?: unknown[]; warnings?: string[]; cost?: { usd?: number } }>('clip.json')
  if (!clip) return
  row.level = clip.level; row.cues = clip.cues?.length; row.highlights = clip.highlights?.length; row.quiz = clip.quiz?.length
  row.warnings = clip.warnings ?? []
  if (typeof clip.cost?.usd === 'number') row.costUsd = clip.cost.usd
}

export function renderReportMd(r: BatchReport, m: BatchManifest): string {
  const cell = (v: unknown) => (v === undefined || v === null ? '—' : String(v)).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const out = [
    `# Batch report — phase ${r.phase}, ${r.at}`, '',
    `${r.rows.filter((x) => x.status === 'ok').length} ok · ${r.rows.filter((x) => x.status === 'failed').length} failed · ${r.rows.filter((x) => x.status === 'skipped').length} skipped`, '',
    '| slug | status | level | cues | highlights | quiz | warnings | review | gate | cost | seconds |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...r.rows.map((x) => `| ${x.slug} | ${x.status}${x.failedStage ? ` (${x.failedStage})` : ''} | ${cell(x.level)} | ${cell(x.cues)} | ${cell(x.highlights)} | ${cell(x.quiz)} | ${x.warnings.length} | ${reviewLines(x).length} | ${x.gate} | ${x.costUsd === undefined ? '—' : `$${x.costUsd.toFixed(4)}`} | ${x.seconds} |`),
    '', '## Needs a human', '',
  ]
  const needs: string[] = []
  for (const c of m.clips) if (!c.segment.confirmed && r.rows.some((x) => x.slug === c.slug)) needs.push(`- ${c.slug}: segment ${c.segment.in}–${c.segment.out} not confirmed — watch the first and last 10 s of the cut, then set segment.confirmed`)
  for (const x of r.rows) {
    if (x.status === 'failed') needs.push(`- ${x.slug}: ${x.failedStage} — ${cell(x.error)}`)
    for (const w of reviewLines(x)) needs.push(`- ${x.slug}: ${w}`)
  }
  out.push(...(needs.length ? needs : ['Nothing.']), '', '## Estimate', '', `Transcribe ${r.estimate.transcribe.minutes.toFixed(1)} min, total ≈ $${r.estimate.totalUsd.toFixed(2)} (${r.estimate.phases.join(' + ')}; unverified prices).`, '')
  return out.join('\n')
}
