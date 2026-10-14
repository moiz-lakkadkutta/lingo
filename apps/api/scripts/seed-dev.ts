/**
 * Publishes a fixture clip to the local DB so the TV app has something to play without the pipeline or S3 (S1 follow-up).
 *   pnpm --filter @lingo/api seed:dev [--clip-json <clip.json>] [--slug <slug>] [--title <title>] [--manifest-key <key>]
 * Default input: scripts/fixtures/demo-de.clip.json, the `demo-de` pipeline fixture (23 cues, 7 highlights with test glosses), written by
 *   pnpm --filter @lingo/pipeline cli prepare --clip demo-de --source s3://unused --lang de --native en --fixture --no-publish
 * with per-cue tokens dropped. Safe to re-run: it updates in place (see src/lib/seedClip.ts).
 * The manifest resolves to MEDIA_BASE_URL/<manifest-key> (default `<slug>/master.m3u8`); serve a local HLS directory with `pnpm media:dev`.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PreparedClip } from '@lingo/contracts'
import { db } from '../src/lib/db'
import { manifestUrlFor } from '../src/lib/media'
import { seedClip } from '../src/lib/seedClip'

const here = dirname(fileURLToPath(import.meta.url))
const arg = (name: string): string | undefined => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined }

async function main() {
  const file = arg('clip-json') ?? join(here, 'fixtures', 'demo-de.clip.json')
  const prepared = PreparedClip.parse(JSON.parse(readFileSync(file, 'utf8')))
  const slug = arg('slug') ?? prepared.slug
  const manifestKey = arg('manifest-key') ?? `${slug}/master.m3u8`
  const r = await seedClip(db, prepared, {
    slug,
    title: arg('title') ?? `${slug} (dev seed)`,
    manifestKey,
    license: 'Test fixture',
    attribution: 'Lingo test fixture (synthetic dialogue)',
  })
  console.log(`${r.created ? 'created' : 'updated'} ${r.slug}: ${r.cues} cues, ${r.highlights} highlights, ${r.quiz} quiz items, published`)
  console.log(`manifest, for an API started with this env: ${manifestUrlFor(manifestKey, process.env)}`)
  console.log(`open on the TV: adb shell am start -a android.intent.action.VIEW -d "lingo://clip/${r.slug}"`)
}
main()
  .then(() => db.$disconnect())
  .catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1) })
