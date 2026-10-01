import { Command } from 'commander'
import { prepare } from './prepare'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureDeps, fixtureSend } from './fixtureDeps'
import { createAi } from './ai/index'
import { DEFAULT_PER_CLIP, runSpotCheck } from './spotCheck'
import type { Lang } from './types'

/**
 * lingo-pipeline prepare --clip <slug> --source <s3uri> --lang <de|en> [--native en] [--work work] [--no-publish] [--no-ai] [--fixture]
 * Examples (LING-001 clips: one native each — see docs/decisions/0004 and PLAN §6):
 *   pnpm --filter @lingo/pipeline cli prepare --clip demo-de --source s3://unused --lang de --native en --fixture --no-publish
 *   pnpm --filter @lingo/pipeline cli prepare --clip demo-en --source s3://unused --lang en --native de --fixture --no-publish
 * --fixture runs the whole pipeline on the committed Transcribe fixture with recorded doubles (no AWS, ffmpeg, packager or Python) so a human can eyeball work/<slug>/.
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
  .option('--fixture', 'use the committed Transcribe fixture and recorded doubles instead of AWS / ffmpeg / packager / Python')
  .addHelpText('after', `
Examples (LING-001: one native per clip — en for the German clip, de for the English clip):
  $ pnpm --filter @lingo/pipeline cli prepare --clip demo-de --source s3://unused --lang de --native en --fixture --no-publish
  $ pnpm --filter @lingo/pipeline cli prepare --clip demo-en --source s3://unused --lang en --native de --fixture --no-publish
  $ AWS_REGION=eu-central-1 pnpm --filter @lingo/pipeline cli prepare --clip terra-x-friedlaender --source s3://<bucket>/clips/<file>.webm --lang de --native en --no-publish --no-ai
  $ S3_BUCKET_MEDIA=… CLOUDFRONT_DOMAIN=… pnpm --filter @lingo/pipeline cli prepare --clip <slug> --source s3://<bucket>/<key>.mp4 --lang de --native en`)
  .action(async (o: { clip: string; source: string; lang: string; native: string; work: string; publish: boolean; ai: boolean; fixture?: boolean }) => {
    if (o.lang !== 'de' && o.lang !== 'en') throw new Error(`--lang must be de or en, got ${o.lang}`)
    const lang = o.lang as Lang
    const deps = o.fixture ? { ...fixtureDeps(lang), log: (m: string) => console.log(m) } : undefined
    await prepare({ slug: o.clip, source: o.source, lang, natives: String(o.native).split(',').map((s) => s.trim()).filter(Boolean), workRoot: o.work, publish: o.publish, ai: o.ai }, deps)
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
await program.parseAsync()
