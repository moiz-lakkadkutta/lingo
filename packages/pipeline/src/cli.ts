import { Command } from 'commander'
import { prepare } from './prepare'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureDeps, fixtureSend } from './fixtureDeps'
import { createAi } from './ai/index'
import { DEFAULT_PER_CLIP, runSpotCheck } from './spotCheck'
import type { Lang } from './types'
import { batchCommand } from './batch/command'
import { nodeRunDeps } from './batch/run'

/**
 * lingo-pipeline prepare --clip <slug> --source <s3uri> --lang <de|en> [--native en] [--work work] [--no-publish] [--no-ai] [--fixture [name]] [--cues <file.vtt>] [--reuse] [--formality <FORMAL|INFORMAL>]
 * Examples (LING-001 clips: one native each — see docs/decisions/0004 and PLAN §6):
 *   pnpm --filter @lingo/pipeline cli prepare --clip demo-de --source s3://unused --lang de --native en --fixture --no-publish
 *   pnpm --filter @lingo/pipeline cli prepare --clip demo-en --source s3://unused --lang en --native de --fixture --no-publish
 *   pnpm --filter @lingo/pipeline cli prepare --clip overlap-de --source s3://unused --lang de --native en --fixture overlap --no-publish
 *   pnpm --filter @lingo/pipeline cli prepare --clip overlap-de --source s3://unused --lang de --native en --fixture overlap --no-publish --cues work/overlap-de/de.vtt
 *   pnpm --filter @lingo/pipeline cli prepare --clip friedlaender --source s3://unused --lang de --native en --fixture real/friedlaender --no-publish --no-ai
 *   pnpm --filter @lingo/pipeline cli prepare --clip terra-x-friedlaender --source s3://unused --lang de --native en --reuse --no-publish --no-ai
 * --fixture runs the whole pipeline on a committed Transcribe fixture with recorded doubles (no AWS, ffmpeg, packager or Python) so a human can eyeball work/<slug>/.
 * --cues is the manual-correction path (docs/decisions/0007): when the quality gate fails, prepare has already written work/<slug>/<lang>.vtt,
 * dropped.vtt and gate.json; fix the VTT in any subtitle editor and re-run with --cues work/<slug>/<lang>.vtt.
 */
const program = new Command().name('lingo-pipeline')
program.command('prepare')
  .requiredOption('--clip <slug>', 'clip slug, e.g. demo-de')
  .requiredOption('--source <s3uri>', 's3:// URI of the source video (Transcribe reads it directly)')
  .requiredOption('--lang <de|en>', 'language spoken in the clip')
  .option('--native <codes>', 'comma-separated native languages (example: --native en for a German clip, --native de for an English clip)', 'en,de,tr,ar,uk')
  .option('--work <dir>', 'work directory root', 'work')
  .option('--no-publish', 'skip the S3 upload (no S3_BUCKET_MEDIA / CLOUDFRONT_DOMAIN needed)')
  .option('--no-ai', 'skip the Bedrock gloss and quiz calls (highlights without glosses, no quiz; clip.json generated.ai = false)')
  .option('--fixture [name]', 'use the committed Transcribe fixture <name> (default 60s; also overlap, real/friedlaender, real/voa01) and recorded doubles instead of AWS / ffmpeg / packager / Python')
  .option('--cues <file.vtt>', 'skip Transcribe and segmentation; take the target cues from this WebVTT (the manual-correction path, docs/decisions/0007)')
  .option('--reuse', 'reuse work/<slug>/mezz.mp4 and transcript.json when present (no download, ffmpeg or Transcribe); Translate and Bedrock still run')
  .option('--formality <FORMAL|INFORMAL>', 'register of the native tracks where Amazon Translate supports it (de, fr, es, …); FORMAL for lectures/news that address the viewer', 'INFORMAL')
  .option('--vtt-note <text>', 'BY-SA clips: one-line licence + attribution written as a NOTE at the top of every published VTT (docs/content.md §5)')
  .addHelpText('after', `
Examples (LING-001: one native per clip — en for the German clip, de for the English clip):
  $ pnpm --filter @lingo/pipeline cli prepare --clip demo-de --source s3://unused --lang de --native en --fixture --no-publish
  $ pnpm --filter @lingo/pipeline cli prepare --clip demo-en --source s3://unused --lang en --native de --fixture --no-publish
  $ pnpm --filter @lingo/pipeline cli prepare --clip overlap-de --source s3://unused --lang de --native en --fixture overlap --no-publish
  $ pnpm --filter @lingo/pipeline cli prepare --clip overlap-de --source s3://unused --lang de --native en --fixture overlap --no-publish --cues work/overlap-de/de.vtt
  $ pnpm --filter @lingo/pipeline cli prepare --clip friedlaender --source s3://unused --lang de --native en --fixture real/friedlaender --no-publish --no-ai
  $ pnpm --filter @lingo/pipeline cli prepare --clip voa01 --source s3://unused --lang en --native de --fixture real/voa01 --no-publish --no-ai
  $ AWS_REGION=eu-central-1 pnpm --filter @lingo/pipeline cli prepare --clip terra-x-friedlaender --source s3://unused --lang de --native en --reuse --no-publish --no-ai
  $ AWS_REGION=eu-central-1 pnpm --filter @lingo/pipeline cli prepare --clip openhpi-<slug> --source s3://<bucket>/<key>.mp4 --lang de --native en --formality FORMAL --no-publish
  $ AWS_REGION=eu-central-1 pnpm --filter @lingo/pipeline cli prepare --clip terra-x-friedlaender --source s3://<bucket>/clips/<file>.webm --lang de --native en --no-publish --no-ai
  $ S3_BUCKET_MEDIA=… CLOUDFRONT_DOMAIN=… pnpm --filter @lingo/pipeline cli prepare --clip <slug> --source s3://<bucket>/<key>.mp4 --lang de --native en
When the quality gate fails, fix work/<slug>/<lang>.vtt and re-run the same command with --cues work/<slug>/<lang>.vtt (docs/decisions/0007).`)
  .action(async (o: { clip: string; source: string; lang: string; native: string; work: string; publish: boolean; ai: boolean; fixture?: boolean | string; cues?: string; reuse?: boolean; formality: string; vttNote?: string }) => {
    if (o.lang !== 'de' && o.lang !== 'en') throw new Error(`--lang must be de or en, got ${o.lang}`)
    if (o.formality !== 'FORMAL' && o.formality !== 'INFORMAL') throw new Error(`--formality must be FORMAL or INFORMAL, got ${o.formality}`)
    const lang = o.lang as Lang
    const deps = o.fixture ? { ...fixtureDeps(lang, { transcript: typeof o.fixture === 'string' ? o.fixture : '60s' }), log: (m: string) => console.log(m) } : undefined
    await prepare({ slug: o.clip, source: o.source, lang, natives: String(o.native).split(',').map((s) => s.trim()).filter(Boolean), workRoot: o.work, publish: o.publish, ai: o.ai, ...(o.cues ? { cues: o.cues } : {}), ...(o.reuse ? { reuse: true } : {}), ...(o.vttNote ? { vttNote: o.vttNote } : {}), formality: o.formality }, deps)
  })
program.command('spot-check')
  .description('LING-002 quality check: gloss the clip highlights (widening to --per-clip words) and build its quiz with Nova Lite, then write a rubric sheet with blank score columns. Accepts a --no-ai clip.json.')
  .requiredOption('--clip-json <path>', 'clip.json written by prepare, e.g. work/demo-de/clip.json')
  .option('--per-clip <n>', 'gloss rows for this clip', String(DEFAULT_PER_CLIP))
  .option('--out <md>', 'markdown rubric sheet (default work/spot-check.md; with --fixture work/spot-check.fixture.md)')
  .option('--append', 'append to --out instead of overwriting (second clip)')
  .option('--fixture', 'offline: stub Nova answers (fixtureSend) and a throwaway cache; writes spot-check.fixture.json, never spot-check.json; not a real spot check')
  .addHelpText('after', `
Examples:
  $ AWS_PROFILE=… pnpm --filter @lingo/pipeline cli spot-check --clip-json work/demo-de/clip.json --out work/spot-check.md
  $ AWS_PROFILE=… pnpm --filter @lingo/pipeline cli spot-check --clip-json work/demo-en/clip.json --out work/spot-check.md --append
  $ pnpm --filter @lingo/pipeline cli spot-check --clip-json work/demo-de/clip.json --fixture`)
  .action(async (o: { clipJson: string; perClip: string; out?: string; append?: boolean; fixture?: boolean }) => {
    const perClip = Number(o.perClip)
    if (!Number.isInteger(perClip) || perClip < 1) throw new Error(`--per-clip must be a positive integer, got ${o.perClip}`)
    const log = (m: string) => console.log(m)
    const ai = o.fixture ? createAi({ send: fixtureSend(), cacheDir: await mkdtemp(join(tmpdir(), 'lingo-spot-fixture-')), log }) : undefined
    const out = o.out ?? (o.fixture ? 'work/spot-check.fixture.md' : 'work/spot-check.md')
    const r = await runSpotCheck({ clipJson: o.clipJson, perClip, out, append: o.append, ai, log, jsonFile: o.fixture ? 'spot-check.fixture.json' : undefined })
    console.log(`\n${await readFile(r.files.markdown, 'utf8')}`)
  })
program.command('batch')
  .description('LING-008 clip batch: licence re-check, download, cut, upload, prepare and poster for every row of the manifest, resuming where it stopped (docs/plans/LING-008.md §2)')
  .argument('<manifest>', 'batch manifest, e.g. content/clips.json (relative paths are taken from where pnpm was run)')
  .option('--phase <draft|final>', 'draft: prepare --no-ai --no-publish (Transcribe + Translate only); final: glosses + quiz + publish + poster upload, refused while the manifest says "gateC": "pending"', 'draft')
  .option('--dry-run', 'validate, show the resume state of every stage, print every command and the cost estimate; no network, AWS or ffmpeg')
  .option('--only <slugs>', 'comma-separated subset of slugs (also how a reserve row is processed after a swap)')
  .option('--stages <list>', 'comma-separated stages (default verify,fetch,cut,upload,prepare,poster,publish-extra)')
  .option('--work <dir>', 'work directory root (the same as prepare --work)', 'work')
  .option('--allow-unconfirmed', 'cut rows whose segment.confirmed is false (to listen to them)')
  .option('--force-ai', 'run the final phase although gateC is pending (deliberate test runs only)')
  .option('--fail-fast', 'stop at the first failed clip (default: continue, exit 1 at the end if any failed)')
  .option('--report <path>', 'report path; .json and .md are written (default <work>/batch-report)')
  .addHelpText('after', `
The human runbook (docs/plans/LING-008.md §2.9; run from the repo root, AWS credentials and S3_BUCKET_MEDIA / CLOUDFRONT_DOMAIN exported):
  $ pnpm pipeline batch content/clips.json --dry-run
  $ pnpm pipeline batch content/clips.json --stages verify,fetch,cut --allow-unconfirmed
  $ pnpm pipeline batch content/clips.json --phase draft
  $ pnpm pipeline batch content/clips.json --phase final        # after "gateC": "passed"
A gate failure prints the --cues hint: fix work/<slug>/<lang>.vtt, copy it to content/cues/, set "cues", re-run with --only <slug>.`)
  .action(async (manifest: string, o: { phase: string; dryRun?: boolean; only?: string; stages?: string; work: string; allowUnconfirmed?: boolean; forceAi?: boolean; failFast?: boolean; report?: string }) => {
    process.exitCode = await batchCommand(manifest, o, nodeRunDeps())
  })
await program.parseAsync()
