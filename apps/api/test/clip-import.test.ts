import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import request from 'supertest'
import type { PreparedClip } from '@lingo/contracts'
import { createApp } from '../src/app'
import { db } from '../src/lib/db'
import { highlightLevel, importClips, runImportCli } from '../src/lib/clipImport'

/** Synthetic clips only (invented sentences). Slugs `test-imp-<rnd>-…`, removed in afterAll. */
const run = `test-imp-${randomBytes(4).toString('hex')}`
const slug = (s: string) => `${run}-${s}`
const dirs: string[] = []
const deviceIds: string[] = []

afterAll(async () => {
  await db.learner.deleteMany({ where: { deviceId: { in: deviceIds } } })
  await db.clip.deleteMany({ where: { slug: { startsWith: run } } })
  await db.$disconnect()
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}, 30_000)

function row(s: string, lang: 'de' | 'en' = 'de') {
  return {
    slug: s, title: `Title of ${s}`, lang, natives: [lang === 'de' ? 'en' : 'de'], license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: `"${s}" by Example Studio, CC BY 4.0`, sourceUrl: 'https://example.org/clip', downloadUrl: 'https://example.org/clip.mp4',
    segment: { in: '00:00', out: '04:00', confirmed: true }, expectedDurationS: 240, licenceCheck: { kind: 'ia', id: 'example' },
  }
}

function clipJson(s: string, o: Partial<PreparedClip> = {}): PreparedClip {
  return {
    version: 1, slug: s, sourceLang: 'de', natives: ['en'], level: 'A2', coverageRank: 1800, durationS: 241.5,
    cues: [
      { index: 0, startMs: 0, endMs: 2500, text: 'Der Hund schläft im Garten.', native: { en: 'The dog sleeps in the garden.' }, tokens: [] },
      { index: 1, startMs: 3000, endMs: 5200, text: 'Morgen regnet es wieder.', native: { en: 'Tomorrow it rains again.' }, tokens: [] },
      { index: 2, startMs: 6000, endMs: 8000, text: 'Wir kaufen frisches Brot.', native: { en: 'We buy fresh bread.' }, tokens: [] },
    ],
    highlights: [
      { cueIndex: 0, word: 'Garten', lemma: 'Garten', rank: 1500, gloss: 'garden', grammar: 'noun, masculine', example: 'Der Garten ist groß.' },
      { cueIndex: 1, word: 'regnet', lemma: 'regnen', rank: 2500, gloss: 'to rain', grammar: 'verb', example: 'Es regnet oft.' },
      { cueIndex: 2, word: 'frisches', lemma: 'frisch', rank: 9000 },
    ],
    quiz: [
      { kind: 'meaning', prompt: 'What does "Garten" mean?', options: ['garden', 'house', 'street', 'tree'], answer: 0, cueIndex: 0 },
      { kind: 'cloze', prompt: 'Wir kaufen frisches ___.', options: ['Brot', 'Hund', 'Regen', 'Garten'], answer: 0, cueIndex: null },
    ],
    tracks: { manifest: 'master.m3u8', vtt: { de: 'vtt/de.vtt', en: 'vtt/en.vtt' } },
    publishedBase: `https://cdn.example.org/published/${s}`,
    source: { uri: 's3://bucket/cut.mp4', transcribeJob: null },
    generated: { at: '2026-10-01T10:00:00.000Z', pipeline: 'lingo-pipeline@0.1.0', lemmatizer: 'table', ai: true },
    warnings: [],
    ...o,
  }
}

/** A temp tree: <root>/content/clips.json and <root>/work/<slug>/clip.json for each given clip. */
function tree(rows: ReturnType<typeof row>[], clips: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), 'lingo-import-'))
  dirs.push(root)
  mkdirSync(join(root, 'content'))
  writeFileSync(join(root, 'content', 'clips.json'), JSON.stringify({ version: 1, gateC: 'passed', bucketEnv: 'S3_BUCKET_MEDIA', clips: rows }))
  for (const [s, c] of Object.entries(clips)) {
    mkdirSync(join(root, 'work', s), { recursive: true })
    writeFileSync(join(root, 'work', s, 'clip.json'), typeof c === 'string' ? c : JSON.stringify(c))
  }
  return { manifest: join(root, 'content', 'clips.json'), work: join(root, 'work'), root }
}
const writeClip = (t: { work: string }, s: string, c: unknown) => writeFileSync(join(t.work, s, 'clip.json'), JSON.stringify(c))
const writeManifest = (t: { manifest: string }, rows: ReturnType<typeof row>[]) =>
  writeFileSync(t.manifest, JSON.stringify({ version: 1, gateC: 'passed', bucketEnv: 'S3_BUCKET_MEDIA', clips: rows }))

const load = (s: string) =>
  db.clip.findUniqueOrThrow({ where: { slug: s }, include: { cues: { orderBy: { index: 'asc' }, include: { highlights: { orderBy: { word: 'asc' } } } }, quiz: { orderBy: { prompt: 'asc' } } } })

describe('highlightLevel', () => {
  it('maps a frequency rank to its band, B2 at and above 4000', () => {
    expect(highlightLevel(1)).toBe('A1')
    expect(highlightLevel(999)).toBe('A1')
    expect(highlightLevel(1000)).toBe('A2')
    expect(highlightLevel(2500)).toBe('B1')
    expect(highlightLevel(4000)).toBe('B2')
    expect(highlightLevel(20000)).toBe('B2')
  })
})

describe('importClips --dry-run', () => {
  it('prints slug, language, level and counts only, and writes nothing', async () => {
    const a = slug('dry')
    const t = tree([row(a)], { [a]: clipJson(a) })
    const lines: string[] = []
    const r = await importClips({ manifest: t.manifest, work: t.work, dryRun: true, db, log: (l) => lines.push(l) })
    expect(r.imported).toBe(1)
    expect(r.rows).toEqual([expect.objectContaining({ slug: a, outcome: 'would import', lang: 'de', level: 'A2', cues: 3, highlights: 3, quiz: 2 })])
    const out = lines.join('\n')
    expect(out).toContain(a)
    expect(out).toMatch(new RegExp(`${a}\\s+de\\s+A2\\s+3\\s+3\\s+2`))
    for (const text of ['Hund', 'Garten', 'garden', 'Brot', 'regnet', 'Title of']) expect(out).not.toContain(text)
    expect(await db.clip.findUnique({ where: { slug: a } })).toBeNull()
  })
})

describe('importClips', () => {
  it('creates the Clip with cues, highlights and quiz; keys, not URLs', async () => {
    const a = slug('create')
    const t = tree([row(a)], { [a]: clipJson(a) })
    const r = await importClips({ manifest: t.manifest, work: t.work, db, log: () => {} })
    expect(r.imported).toBe(1)
    expect(r.rows[0]).toMatchObject({ slug: a, outcome: 'created' })
    const c = await load(a)
    expect(c).toMatchObject({
      title: `Title of ${a}`, license: 'CC BY 4.0', attribution: `"${a}" by Example Studio, CC BY 4.0`, sourceLang: 'de', level: 'A2',
      durationS: 241.5, coverageRank: 1800, posterKey: `published/${a}/poster.jpg`, manifestKey: `published/${a}/master.m3u8`, status: 'published',
    })
    expect(c.cues.map((q) => [q.index, q.startMs, q.endMs, q.text, q.native])).toEqual([
      [0, 0, 2500, 'Der Hund schläft im Garten.', { en: 'The dog sleeps in the garden.' }],
      [1, 3000, 5200, 'Morgen regnet es wieder.', { en: 'Tomorrow it rains again.' }],
      [2, 6000, 8000, 'Wir kaufen frisches Brot.', { en: 'We buy fresh bread.' }],
    ])
    expect(c.cues[0]!.highlights).toMatchObject([{ word: 'Garten', lemma: 'Garten', rank: 1500, gloss: 'garden', grammar: 'noun, masculine', example: 'Der Garten ist groß.', level: 'A2' }])
    expect(c.cues[1]!.highlights).toMatchObject([{ lemma: 'regnen', level: 'B1' }])
    expect(c.cues[2]!.highlights).toMatchObject([{ lemma: 'frisch', rank: 9000, gloss: '', grammar: '', example: '', level: 'B2' }])
    expect(c.quiz).toHaveLength(2)
    expect(c.quiz.find((q) => q.kind === 'meaning')).toMatchObject({ options: ['garden', 'house', 'street', 'tree'], answer: 0, cueId: c.cues[0]!.id })
    expect(c.quiz.find((q) => q.kind === 'cloze')).toMatchObject({ cueId: null })
  })

  it('is idempotent: a second run reports unchanged and keeps every id', async () => {
    const a = slug('idem')
    const t = tree([row(a)], { [a]: clipJson(a) })
    await importClips({ manifest: t.manifest, work: t.work, db, log: () => {} })
    const before = await load(a)
    const r = await importClips({ manifest: t.manifest, work: t.work, db, log: () => {} })
    expect(r.rows[0]).toMatchObject({ slug: a, outcome: 'unchanged' })
    expect(r.imported).toBe(1)
    expect(await load(a)).toEqual(before)
  })

  it('updates changed fields in place, keeping cue and highlight ids', async () => {
    const a = slug('update')
    const t = tree([row(a)], { [a]: clipJson(a) })
    await importClips({ manifest: t.manifest, work: t.work, db, log: () => {} })
    const before = await load(a)
    writeManifest(t, [{ ...row(a), title: 'A new title' }])
    const c = clipJson(a)
    c.cues[1]!.native = { en: 'Tomorrow it will rain again.' }
    c.highlights[0]!.gloss = 'garden, yard'
    c.quiz = [c.quiz![0]!]
    writeClip(t, a, c)
    const r = await importClips({ manifest: t.manifest, work: t.work, db, log: () => {} })
    expect(r.rows[0]).toMatchObject({ outcome: 'updated' })
    const after = await load(a)
    expect(after.title).toBe('A new title')
    expect(after.id).toBe(before.id)
    expect(after.cues.map((q) => q.id)).toEqual(before.cues.map((q) => q.id))
    expect(after.cues[1]!.native).toEqual({ en: 'Tomorrow it will rain again.' })
    expect(after.cues[0]!.highlights[0]).toMatchObject({ id: before.cues[0]!.highlights[0]!.id, gloss: 'garden, yard' })
    expect(after.quiz.map((q) => q.kind)).toEqual(['meaning'])
  })

  it('removes highlights and cues that are gone, but keeps a highlight a learner saved', async () => {
    const a = slug('saved')
    const t = tree([row(a)], { [a]: clipJson(a) })
    await importClips({ manifest: t.manifest, work: t.work, db, log: () => {} })
    const before = await load(a)
    const deviceId = `${run}-learner`
    deviceIds.push(deviceId)
    const learner = await db.learner.create({ data: { deviceId } })
    const saved = before.cues[2]!.highlights[0]!
    await db.savedWord.create({ data: { learnerId: learner.id, highlightId: saved.id } })
    const c = clipJson(a)
    c.cues = c.cues.slice(0, 1)
    c.highlights = c.highlights.slice(0, 1)
    c.quiz = []
    writeClip(t, a, c)
    const lines: string[] = []
    const r = await importClips({ manifest: t.manifest, work: t.work, db, log: (l) => lines.push(l) })
    expect(r.rows[0]).toMatchObject({ outcome: 'updated' })
    const after = await load(a)
    expect(after.cues.map((q) => q.index)).toEqual([0, 2]) // cue 2 stays: its highlight is saved
    expect(after.cues[1]!.highlights.map((h) => h.id)).toEqual([saved.id])
    expect(lines.join('\n')).toMatch(/kept 1 saved highlight/)
  })

  it('skips a row without work clip.json and imports the others', async () => {
    const a = slug('present'), b = slug('missing')
    const t = tree([row(a), row(b)], { [a]: clipJson(a) })
    const lines: string[] = []
    const r = await importClips({ manifest: t.manifest, work: t.work, db, log: (l) => lines.push(l) })
    expect(r.imported).toBe(1)
    expect(r.rows.find((x) => x.slug === b)).toMatchObject({ outcome: 'skipped' })
    expect(lines.join('\n')).toMatch(new RegExp(`${b}.*no .*clip\\.json`))
    expect(await db.clip.findUnique({ where: { slug: b } })).toBeNull()
  })

  it('skips a clip.json that fails the PreparedClip contract or does not match its row', async () => {
    const bad = slug('bad'), other = slug('other'), lang = slug('lang')
    const t = tree([row(bad), row(other), row(lang, 'en')], {
      [bad]: { ...clipJson(bad), cues: [] },
      [other]: clipJson(slug('elsewhere')),
      [lang]: clipJson(lang),
    })
    const lines: string[] = []
    const r = await importClips({ manifest: t.manifest, work: t.work, db, log: (l) => lines.push(l) })
    expect(r.imported).toBe(0)
    expect(r.rows.map((x) => x.outcome)).toEqual(['skipped', 'skipped', 'skipped'])
    const out = lines.join('\n')
    expect(out).toMatch(new RegExp(`${bad}.*cues`))
    expect(out).toMatch(new RegExp(`${other}.*slug`))
    expect(out).toMatch(new RegExp(`${lang}.*sourceLang`))
    expect(out).not.toContain('Hund')
  })

  it('stores status draft when the clip is not published, unless --status overrides it', async () => {
    const a = slug('draft'), b = slug('forced')
    const t = tree([row(a)], { [a]: clipJson(a, { publishedBase: null }) })
    await importClips({ manifest: t.manifest, work: t.work, db, log: () => {} })
    expect((await load(a)).status).toBe('draft')
    const u = tree([row(b)], { [b]: clipJson(b, { publishedBase: null }) })
    await importClips({ manifest: u.manifest, work: u.work, db, status: 'published', log: () => {} })
    expect((await load(b)).status).toBe('published')
  })

  it('serves the imported clip from GET /clips/:slug', async () => {
    const a = slug('served')
    const t = tree([row(a)], { [a]: clipJson(a) })
    await importClips({ manifest: t.manifest, work: t.work, db, log: () => {} })
    const deviceId = `${run}-viewer`
    deviceIds.push(deviceId)
    const r = await request(createApp()).get(`/clips/${a}`).set('x-device-id', deviceId).set('x-native', 'en')
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({ slug: a, status: 'ready', level: 'A2', attribution: `"${a}" by Example Studio, CC BY 4.0` })
    expect(r.body.data.cues).toHaveLength(3)
    expect(r.body.data.quiz).toHaveLength(2)
  })
})

describe('runImportCli', () => {
  it('exits 1 when nothing is imported and 0 otherwise', async () => {
    const a = slug('cli-none')
    const t = tree([row(a)], {})
    const log: string[] = []
    expect(await runImportCli(['--manifest', t.manifest, '--work', t.work, '--dry-run'], { db, log: (l) => log.push(l) })).toBe(1)
    expect(log.join('\n')).toMatch(/nothing to import/i)
    const b = slug('cli-one')
    const u = tree([row(b)], { [b]: clipJson(b) })
    expect(await runImportCli(['--manifest', u.manifest, '--work', u.work, '--dry-run'], { db, log: () => {} })).toBe(0)
  })

  it('resolves relative paths against INIT_CWD and rejects an unknown --status', async () => {
    const a = slug('cli-rel')
    const t = tree([row(a)], { [a]: clipJson(a) })
    const prev = process.env.INIT_CWD
    process.env.INIT_CWD = t.root
    try {
      expect(await runImportCli(['--manifest', 'content/clips.json', '--work', 'work', '--dry-run'], { db, log: () => {} })).toBe(0)
      await expect(runImportCli(['--manifest', 'content/clips.json', '--work', 'work', '--status', 'live'], { db, log: () => {} })).rejects.toThrow(/status/)
    } finally {
      if (prev === undefined) delete process.env.INIT_CWD
      else process.env.INIT_CWD = prev
    }
  })
})
