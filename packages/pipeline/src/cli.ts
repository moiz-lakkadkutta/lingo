import { Command } from 'commander'
import { prepare } from './prepare'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureDeps, fixtureSend } from './fixtureDeps'
import { createAi } from './ai/index'
import { DEFAULT_PER_CLIP, spotCheckCli } from './spotCheck'
import type { Lang } from './types'

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
  .action(async (o: { clip: string; source: string; lang: string; native: string; work: string; publish: boolean; ai: boolean; fixture?: boolean | string; cues?: string; reuse?: boolean; formality: string }) => {
    if (o.lang !== 'de' && o.lang !== 'en') throw new Error(`--lang must be de or en, got ${o.lang}`)
    if (o.formality !== 'FORMAL' && o.formality !== 'INFORMAL') throw new Error(`--formality must be FORMAL or INFORMAL, got ${o.formality}`)
    const lang = o.lang as Lang
    const deps = o.fixture ? { ...fixtureDeps(lang, { transcript: typeof o.fixture === 'string' ? o.fixture : '60s' }), log: (m: string) => console.log(m) } : undefined
    await prepare({ slug: o.clip, source: o.source, lang, natives: String(o.native).split(',').map((s) => s.trim()).filter(Boolean), workRoot: o.work, publish: o.publish, ai: o.ai, ...(o.cues ? { cues: o.cues } : {}), ...(o.reuse ? { reuse: true } : {}), formality: o.formality }, deps)
  })
program.command('spot-check')
  .description('LING-002 quality check: gloss every clip highlight (widening to --per-clip words) and build its quiz with Nova, then write a rubric sheet with blank score columns. Accepts a --no-ai clip.json.')
  .requiredOption('--clip-json <path>', 'clip.json written by prepare, e.g. work/demo-de/clip.json')
  .option('--per-clip <n>', 'minimum gloss rows for this clip (every clip highlight is always a row)', String(DEFAULT_PER_CLIP))
  .option('--out <md>', 'markdown rubric sheet (default work/spot-check.md; with --fixture work/spot-check.fixture.md)')
  .option('--append', 'append to --out instead of overwriting (second clip)')
  .option('--fixture', 'offline: stub Nova answers (fixtureSend) and a throwaway cache; writes spot-check.fixture.json, never spot-check.json; not a real spot check')
  .option('--no-echo', 'print only the summary line (no rows, no per-word log lines); for clips whose rows must not reach a terminal log')
  .addHelpText('after', `
Prints only the section it just wrote (with --append, earlier sections stay in the file but are not printed).
Examples:
  $ AWS_PROFILE=… pnpm --filter @lingo/pipeline cli spot-check --clip-json work/demo-en/clip.json --out work/spot-check.md
  $ AWS_PROFILE=… pnpm --filter @lingo/pipeline cli spot-check --clip-json work/demo-de/clip.json --out work/spot-check.md --append --no-echo
  $ pnpm --filter @lingo/pipeline cli spot-check --clip-json work/demo-de/clip.json --fixture`)
  .action(async (o: { clipJson: string; perClip: string; out?: string; append?: boolean; fixture?: boolean; echo: boolean }) => {
    const perClip = Number(o.perClip)
    if (!Number.isInteger(perClip) || perClip < 1) throw new Error(`--per-clip must be a positive integer, got ${o.perClip}`)
    const print = (m: string) => console.log(m)
    const ai = o.fixture ? createAi({ send: fixtureSend(), cacheDir: await mkdtemp(join(tmpdir(), 'lingo-spot-fixture-')), log: o.echo ? print : () => {} }) : undefined
    const out = o.out ?? (o.fixture ? 'work/spot-check.fixture.md' : 'work/spot-check.md')
    await spotCheckCli({ clipJson: o.clipJson, perClip, out, append: o.append, echo: o.echo, ai, jsonFile: o.fixture ? 'spot-check.fixture.json' : undefined }, print)
  })
await program.parseAsync()
