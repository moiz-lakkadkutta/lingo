/**
 * `pnpm pipeline batch <manifest.json>` (docs/plans/LING-008.md §2.5). Returns the exit code; the CLI wrapper sets process.exitCode.
 * --dry-run validates, shows the resume state of every stage, prints every command and the cost estimate — no network, AWS or ffmpeg.
 */
import { existsSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { estimateBatch, renderEstimate } from './estimate'
import { loadManifest, ManifestError, type BatchManifest, type ManifestProblem } from './manifest'
import { GateCPendingError, planBatch, renderStep, STAGES, type BatchStep, type PlanOpts, type Stage } from './plan'
import { runBatch, transcribeLine, type RunDeps } from './run'

export interface BatchCliOpts {
  phase: string; dryRun?: boolean; only?: string; stages?: string; work: string
  allowUnconfirmed?: boolean; forceAi?: boolean; publish?: boolean; failFast?: boolean; report?: string
}

/** pnpm runs the CLI inside packages/pipeline; a relative manifest path is taken from where the human typed it (INIT_CWD) first. */
export function resolveManifestPath(arg: string, env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  if (isAbsolute(arg)) return arg
  const candidates = [env.INIT_CWD, cwd].filter((d): d is string => !!d).map((d) => resolve(d, arg))
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!
}

const list = (s?: string) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined)

export async function batchCommand(manifestArg: string, o: BatchCliOpts, deps: RunDeps, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const log = deps.log
  if (o.phase !== 'draft' && o.phase !== 'final') { log(`--phase must be draft or final, got ${o.phase}`); return 2 }
  const stages = list(o.stages)
  const badStages = (stages ?? []).filter((s) => !(STAGES as readonly string[]).includes(s))
  if (badStages.length) { log(`--stages: unknown ${badStages.join(', ')} (known: ${STAGES.join(', ')})`); return 2 }
  if (o.publish && !o.forceAi) log('--publish only matters with --force-ai (the final phase publishes by default); ignored')
  const path = resolveManifestPath(manifestArg, env)
  let loaded: Awaited<ReturnType<typeof loadManifest>>
  try { loaded = await loadManifest(path, { exists: deps.exists }) } catch (e) { log(e instanceof ManifestError ? e.message : `cannot read the manifest: ${(e as Error).message}`); return 1 }
  const { manifest, problems, dir } = loaded
  const label = relative(env.INIT_CWD ?? process.cwd(), path) || path
  const opts: PlanOpts & { failFast?: boolean; report?: string; manifestLabel: string } = {
    phase: o.phase, work: resolve(o.work), manifestDir: dir, problems, manifestLabel: label,
    ...(stages ? { stages: stages as Stage[] } : {}), ...(list(o.only) ? { only: list(o.only) } : {}),
    ...(o.allowUnconfirmed ? { allowUnconfirmed: true } : {}), ...(o.forceAi ? { forceAi: true } : {}), ...(o.forceAi && o.publish ? { publish: true } : {}),
    ...(env.S3_BUCKET_MEDIA ? { bucket: env.S3_BUCKET_MEDIA } : {}), ...(env.CLOUDFRONT_DOMAIN ? { cloudfrontDomain: env.CLOUDFRONT_DOMAIN } : {}),
    region: env.AWS_REGION ?? 'eu-central-1',
    ...(o.failFast ? { failFast: true } : {}), ...(o.report ? { report: resolve(o.report).replace(/\.(json|md)$/, '') } : {}),
  }
  if (problems.length) log(renderProblems(problems))
  let steps: BatchStep[]
  try { steps = planBatch(manifest, opts, { exists: deps.exists, read: deps.read }, label) } catch (e) {
    log(e instanceof GateCPendingError ? e.message : `cannot plan: ${(e as Error).message}`); return 1
  }
  if (o.dryRun) { log(renderDryRun(manifest, steps, opts, label, deps)); return 0 }
  const fatal = problems.filter((p) => p.slug === null)
  if (fatal.length) { log('refusing to run: the manifest has problems that are not tied to one clip (above)'); return 1 }
  let report: Awaited<ReturnType<typeof runBatch>>
  try { report = await runBatch(manifest, opts, deps) } catch (e) { log(`cannot run: ${(e as Error).message}`); return 1 }
  log('')
  log((await deps.readFile(`${opts.report ?? resolve(opts.work, 'batch-report')}.md`)).trimEnd())
  return report.rows.some((r) => r.status === 'failed') ? 1 : 0
}

function renderProblems(problems: ManifestProblem[]): string {
  return [`Manifest problems (${problems.length}; a clip with a problem is blocked, the others run):`, ...problems.map((p) => `  ${p.slug ?? '(manifest)'} ${p.field}: ${p.message}`)].join('\n')
}

function renderDryRun(m: BatchManifest, steps: BatchStep[], o: PlanOpts, label: string, deps: Pick<RunDeps, 'exists'>): string {
  const slugs = [...new Set(steps.map((s) => s.slug))]
  const out = [`Dry run — ${label}: ${slugs.length} clips, phase ${o.phase}, gateC ${m.gateC}, work ${o.work}${o.bucket ? '' : ', S3_BUCKET_MEDIA unset (shown as $S3_BUCKET_MEDIA)'}`, '']
  if (o.phase === 'final' && o.forceAi) out.push(o.publish ? '--force-ai --publish: glosses and quiz items are written AND published to the CDN.' : '--force-ai: glosses and quiz items are written locally; nothing is published (add --publish to publish).', '')
  for (const slug of slugs) {
    const c = m.clips.find((x) => x.slug === slug)!
    out.push(`## ${slug} — ${c.lang} → ${c.natives.join(',')}, ${c.license}, ${c.segment.in}–${c.segment.out} (${c.expectedDurationS} s)${c.segment.confirmed ? '' : ', segment NOT confirmed'}`)
    for (const s of steps.filter((x) => x.slug === slug)) {
      const state = s.block ? `BLOCKED: ${s.block}` : s.skip ? `skip: ${s.skip}` : s.stage === 'prepare' && s.transcribe ? 'run (calls Amazon Transcribe)' : 'run'
      out.push(`  [${s.stage}] ${state}`, ...renderStep(s).split('\n').map((l) => `    ${l}`))
    }
    out.push('')
  }
  out.push(transcribeLine(steps, m))
  out.push(renderEstimate(estimateBatch(m, deps, { work: o.work, phases: o.phase === 'draft' ? ['draft', 'final'] : ['final'], ...(o.only ? { only: o.only } : {}) })))
  return out.join('\n')
}
