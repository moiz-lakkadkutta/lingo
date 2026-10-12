/**
 * Clip import (TASKS.md follow-up from LING-008, plan §14 open question 6): one Clip row per manifest row, from
 * content/clips.json (title, licence, attribution) + <work>/<slug>/clip.json (PreparedClip: level, cues, highlights, quiz, duration).
 * Stores S3 keys, never URLs: the routes build CloudFront URLs at request time with lib/cdn.ts (`cdn(posterKey)`, `manifestUrl(manifestKey)`).
 * Idempotent: rows are matched by natural keys (clip slug, cue index, highlight cueIndex+word+lemma) and written only when they differ,
 * so a re-run changes nothing and saved words keep pointing at the same Highlight ids.
 * Output never contains cue, gloss or quiz text: slug, language, level, counts and short reasons only.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { BANDS, PreparedClip, type Level } from '@lingo/contracts'
import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * The manifest fields the import reads. The full schema and its cross-field rules live in packages/pipeline/src/batch/manifest.ts
 * (BatchManifest), which validates the file before any clip is processed; the API does not depend on the pipeline package.
 */
const ManifestRow = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: z.string().min(1),
  lang: z.enum(['de', 'en']),
  license: z.string().min(1),
  attribution: z.string().min(1),
})
const Manifest = z.object({ version: z.literal(1), clips: z.array(z.unknown()) })

export const CLIP_STATUSES = ['draft', 'published'] as const
export type ClipStatus = (typeof CLIP_STATUSES)[number]

/** Frequency rank → approximate CEFR band (contracts BANDS); 4000 and above is B2. */
export function highlightLevel(rank: number): Level {
  for (const lvl of ['A1', 'A2', 'B1'] as const) if (rank < BANDS[lvl][1]) return lvl
  return 'B2'
}

export const posterKey = (slug: string) => `published/${slug}/poster.jpg`
export const manifestKey = (slug: string, manifest: string) => `published/${slug}/${manifest}`

export type Outcome = 'would import' | 'created' | 'updated' | 'unchanged' | 'skipped'
export interface ImportRow { slug: string; outcome: Outcome; reason?: string; lang?: string; level?: string; cues?: number; highlights?: number; quiz?: number; notes?: string[] }
export interface ImportResult { rows: ImportRow[]; imported: number }
export interface ImportOptions {
  manifest: string
  work: string
  dryRun?: boolean
  /** Overrides the status derived from clip.json (`published` when publishedBase is set, else `draft`). */
  status?: ClipStatus
  /** Not needed for a dry run. */
  db?: PrismaClient
  log: (line: string) => void
}

type Loaded = { ok: true; row: z.infer<typeof ManifestRow>; clip: PreparedClip } | { ok: false; slug: string; reason: string }

/** Zod issues as `path: message`, never the offending value. */
const issues = (e: z.ZodError) => e.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') + (e.issues.length > 3 ? `; +${e.issues.length - 3} more` : '')

async function loadRow(raw: unknown, i: number, work: string): Promise<Loaded> {
  const r = ManifestRow.safeParse(raw)
  const rawSlug = (raw as { slug?: unknown } | null)?.slug
  if (!r.success) return { ok: false, slug: typeof rawSlug === 'string' ? rawSlug : `row ${i + 1}`, reason: `manifest row: ${issues(r.error)}` }
  const row = r.data
  const path = join(work, row.slug, 'clip.json')
  if (!existsSync(path)) return { ok: false, slug: row.slug, reason: `no work clip.json at ${path} (run the pipeline for this clip first)` }
  let json: unknown
  try { json = JSON.parse(await readFile(path, 'utf8')) } catch (e) { return { ok: false, slug: row.slug, reason: `clip.json is not JSON (${(e as Error).name})` } }
  const c = PreparedClip.safeParse(json)
  if (!c.success) return { ok: false, slug: row.slug, reason: `clip.json does not match PreparedClip: ${issues(c.error)}` }
  const clip = c.data
  if (clip.slug !== row.slug) return { ok: false, slug: row.slug, reason: `clip.json slug is ${clip.slug}, the manifest row says ${row.slug}` }
  if (clip.sourceLang !== row.lang) return { ok: false, slug: row.slug, reason: `clip.json sourceLang is ${clip.sourceLang}, the manifest row says lang ${row.lang}` }
  const indexes = new Set(clip.cues.map((q) => q.index))
  if (indexes.size !== clip.cues.length) return { ok: false, slug: row.slug, reason: 'clip.json has duplicate cue indexes' }
  const dangling = [...clip.highlights.map((h) => h.cueIndex), ...(clip.quiz ?? []).flatMap((q) => (q.cueIndex === null ? [] : [q.cueIndex]))].filter((x) => !indexes.has(x))
  if (dangling.length) return { ok: false, slug: row.slug, reason: `clip.json refers to missing cue index(es) ${[...new Set(dangling)].join(', ')}` }
  return { ok: true, row, clip }
}

/** JSON equality that ignores object key order (jsonb does not keep it). */
const canon = (v: unknown): string =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`
    : Array.isArray(v) ? `[${v.map(canon).join(',')}]` : JSON.stringify(v)

type Tx = Prisma.TransactionClient

/** Upserts one clip and its children; returns whether anything was written and notes for the log. */
async function upsertClip(tx: Tx, row: z.infer<typeof ManifestRow>, clip: PreparedClip, status: ClipStatus): Promise<{ outcome: 'created' | 'updated' | 'unchanged'; notes: string[] }> {
  const notes: string[] = []
  let changed = false
  const fields = {
    title: row.title, sourceLang: clip.sourceLang, durationS: clip.durationS, level: clip.level, coverageRank: clip.coverageRank,
    license: row.license, attribution: row.attribution, posterKey: posterKey(clip.slug), manifestKey: manifestKey(clip.slug, clip.tracks.manifest), status,
  }
  const existing = await tx.clip.findUnique({ where: { slug: clip.slug } })
  const created = !existing
  const c = existing ?? (await tx.clip.create({ data: { slug: clip.slug, ...fields } }))
  if (existing && (Object.keys(fields) as Array<keyof typeof fields>).some((k) => existing[k] !== fields[k])) {
    await tx.clip.update({ where: { id: c.id }, data: fields })
    changed = true
  }

  // Cues by (clipId, index).
  const oldCues = new Map((await tx.cue.findMany({ where: { clipId: c.id } })).map((q) => [q.index, q]))
  const missing = clip.cues.filter((q) => !oldCues.has(q.index))
  if (missing.length) {
    await tx.cue.createMany({ data: missing.map((q) => ({ clipId: c.id, index: q.index, startMs: q.startMs, endMs: q.endMs, text: q.text, native: q.native })) })
    changed = true
  }
  for (const q of clip.cues) {
    const o = oldCues.get(q.index)
    if (o && (o.startMs !== q.startMs || o.endMs !== q.endMs || o.text !== q.text || canon(o.native) !== canon(q.native))) {
      await tx.cue.update({ where: { id: o.id }, data: { startMs: q.startMs, endMs: q.endMs, text: q.text, native: q.native } })
      changed = true
    }
  }
  const cues = await tx.cue.findMany({ where: { clipId: c.id }, include: { highlights: { include: { _count: { select: { saved: true } } } } } })
  const cueId = new Map(cues.map((q) => [q.index, q.id]))

  // Highlights by (cueIndex, word, lemma); a repeated key gets an occurrence number so both rows survive.
  const key = (cueIndex: number, word: string, lemma: string, n: number) => `${cueIndex}\u0000${word}\u0000${lemma}\u0000${n}`
  const oldH = new Map<string, (typeof cues)[number]['highlights'][number]>()
  for (const q of cues) {
    const seen = new Map<string, number>()
    for (const h of [...q.highlights].sort((a, b) => a.id.localeCompare(b.id))) {
      const base = key(q.index, h.word, h.lemma, 0)
      const n = seen.get(base) ?? 0
      seen.set(base, n + 1)
      oldH.set(key(q.index, h.word, h.lemma, n), h)
    }
  }
  const seenNew = new Map<string, number>()
  const keep = new Set<string>()
  for (const h of clip.highlights) {
    const base = key(h.cueIndex, h.word, h.lemma, 0)
    const n = seenNew.get(base) ?? 0
    seenNew.set(base, n + 1)
    const k = key(h.cueIndex, h.word, h.lemma, n)
    const data = { rank: h.rank, gloss: h.gloss ?? '', grammar: h.grammar ?? '', example: h.example ?? '', level: highlightLevel(h.rank) }
    const o = oldH.get(k)
    if (!o) {
      await tx.highlight.create({ data: { cueId: cueId.get(h.cueIndex)!, word: h.word, lemma: h.lemma, ...data } })
      changed = true
    } else {
      keep.add(o.id)
      if (o.rank !== data.rank || o.gloss !== data.gloss || o.grammar !== data.grammar || o.example !== data.example || o.level !== data.level) {
        await tx.highlight.update({ where: { id: o.id }, data })
        changed = true
      }
    }
  }
  const gone = [...oldH.values()].filter((h) => !keep.has(h.id))
  const removable = gone.filter((h) => h._count.saved === 0).map((h) => h.id)
  const keptSaved = gone.length - removable.length
  if (removable.length) {
    await tx.highlight.deleteMany({ where: { id: { in: removable } } })
    changed = true
  }
  if (keptSaved) notes.push(`kept ${keptSaved} saved highlight(s) no longer in clip.json`)

  // Cues no longer in clip.json: removed unless a kept (saved) highlight still hangs off them.
  const newIndexes = new Set(clip.cues.map((q) => q.index))
  const goneCues = cues.filter((q) => !newIndexes.has(q.index)).map((q) => q.id)
  if (goneCues.length) {
    const del = await tx.cue.deleteMany({ where: { id: { in: goneCues }, highlights: { none: {} } } })
    if (del.count) changed = true
    if (del.count < goneCues.length) notes.push(`kept ${goneCues.length - del.count} cue(s) no longer in clip.json for their saved highlights`)
  }

  // Quiz: no natural key and nothing references a QuizItem, so it is replaced only when the set differs.
  const want = (clip.quiz ?? []).map((q) => ({ kind: q.kind, prompt: q.prompt, options: q.options, answer: q.answer, cueId: q.cueIndex === null ? null : cueId.get(q.cueIndex)! }))
  const have = await tx.quizItem.findMany({ where: { clipId: c.id }, orderBy: { id: 'asc' } })
  const sig = (xs: Array<{ kind: string; prompt: string; options: string[]; answer: number; cueId: string | null }>) =>
    xs.map((q) => canon({ kind: q.kind, prompt: q.prompt, options: q.options, answer: q.answer, cueId: q.cueId })).sort().join('\n')
  if (sig(want) !== sig(have)) {
    await tx.quizItem.deleteMany({ where: { clipId: c.id } })
    if (want.length) await tx.quizItem.createMany({ data: want.map((q) => ({ clipId: c.id, ...q })) })
    changed = true
  }
  return { outcome: created ? 'created' : changed ? 'updated' : 'unchanged', notes }
}

const pad = (s: string | number | undefined, n: number) => String(s ?? '').padEnd(n)

export async function importClips(o: ImportOptions): Promise<ImportResult> {
  let raw: unknown
  try { raw = JSON.parse(await readFile(o.manifest, 'utf8')) } catch (e) { throw new Error(`${o.manifest}: ${(e as Error).message}`) }
  const m = Manifest.safeParse(raw)
  if (!m.success) throw new Error(`${o.manifest}: not a clip manifest (${issues(m.error)})`)
  const rows: ImportRow[] = []
  const w = Math.max(4, ...m.data.clips.map((c) => String((c as { slug?: unknown })?.slug ?? '').length))
  o.log(`${pad('slug', w)}  lang  level  cues  highlights  quiz  ${o.dryRun ? '' : 'result'}`.trimEnd())
  for (const [i, entry] of m.data.clips.entries()) {
    const l = await loadRow(entry, i, o.work)
    if (!l.ok) {
      rows.push({ slug: l.slug, outcome: 'skipped', reason: l.reason })
      o.log(`${pad(l.slug, w)}  skipped: ${l.reason}`)
      continue
    }
    const { row, clip } = l
    const counts = { lang: clip.sourceLang, level: clip.level, cues: clip.cues.length, highlights: clip.highlights.length, quiz: clip.quiz?.length ?? 0 }
    const cols = `${pad(row.slug, w)}  ${pad(counts.lang, 4)}  ${pad(counts.level, 5)}  ${pad(counts.cues, 4)}  ${pad(counts.highlights, 10)}  ${pad(counts.quiz, 4)}`
    if (o.dryRun) {
      rows.push({ slug: row.slug, outcome: 'would import', ...counts })
      o.log(cols.trimEnd())
      continue
    }
    if (!o.db) throw new Error('importClips needs a database client unless dryRun is set')
    const status = o.status ?? (clip.publishedBase ? 'published' : 'draft')
    const r = await o.db.$transaction((tx) => upsertClip(tx, row, clip, status), { timeout: 60_000, maxWait: 10_000 })
    rows.push({ slug: row.slug, outcome: r.outcome, ...counts, notes: r.notes })
    o.log(`${cols}  ${r.outcome} (${status})${r.notes.length ? ` — ${r.notes.join('; ')}` : ''}`)
  }
  const imported = rows.filter((r) => r.outcome !== 'skipped').length
  const skipped = rows.length - imported
  o.log(`${o.dryRun ? 'would import' : 'imported'} ${imported} of ${rows.length} clip(s)${skipped ? `, skipped ${skipped}` : ''}${imported ? '' : ' — nothing to import'}`)
  return { rows, imported }
}

/** Repo root from this file (apps/api/src/lib → ../../../..). */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

/**
 * `pnpm --filter @lingo/api clips:import [--manifest content/clips.json] [--work packages/pipeline/work] [--dry-run] [--status draft|published]`.
 * Relative paths resolve from INIT_CWD (where the command was typed), like `pnpm pipeline`. Returns the exit code: 1 when nothing was imported.
 */
export async function runImportCli(argv: string[], o: { db?: PrismaClient; log?: (line: string) => void } = {}): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { manifest: { type: 'string' }, work: { type: 'string' }, 'dry-run': { type: 'boolean', default: false }, status: { type: 'string' } },
    allowPositionals: false,
  })
  if (values.status !== undefined && !(CLIP_STATUSES as readonly string[]).includes(values.status)) throw new Error(`--status must be one of ${CLIP_STATUSES.join(', ')} (got ${values.status})`)
  const base = process.env.INIT_CWD ?? process.cwd()
  const abs = (p: string | undefined, fallback: string) => (p === undefined ? fallback : isAbsolute(p) ? p : resolve(base, p))
  const log = o.log ?? ((l: string) => console.log(l))
  const db = o.db ?? (values['dry-run'] ? undefined : (await import('./db')).db)
  const r = await importClips({
    manifest: abs(values.manifest, join(repoRoot, 'content', 'clips.json')),
    work: abs(values.work, join(repoRoot, 'packages', 'pipeline', 'work')),
    dryRun: values['dry-run'],
    status: values.status as ClipStatus | undefined,
    db,
    log,
  })
  return r.imported > 0 ? 0 : 1
}
