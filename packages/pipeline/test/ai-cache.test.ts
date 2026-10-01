import { mkdtemp, readdir, readFile, rm, writeFile, mkdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Gloss } from '@lingo/contracts'
import { AiCache, cacheKey, normalizeCue, type CacheEntry } from '../src/ai/cache'

const identity = { kind: 'gloss', v: 1, model: 'us.amazon.nova-lite-v1:0', lang: 'de', native: 'en', level: 'A2', lemma: 'warten', cue: normalizeCue('Ich warte seit zwei Stunden\nauf dich.') }
const entry: CacheEntry<Gloss> = {
  v: 1, kind: 'gloss', identity, model: identity.model,
  output: { gloss: 'wait', grammar: 'verb, warten, wartete, hat gewartet', example: 'Wir warten auf den Bus.' },
  usage: { inputTokens: 287, outputTokens: 61 }, at: '2026-10-01T12:00:00.000Z',
}

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'lingo-ai-cache-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('AiCache', () => {
  it('cacheKey is stable across key order and whitespace in the cue (normalizeCue) and changes with lemma, level, native, model and prompt version', () => {
    expect(normalizeCue('  Ich warte\nseit   zwei\tStunden  ')).toBe('Ich warte seit zwei Stunden')
    const k = cacheKey(identity)
    expect(k).toMatch(/^[0-9a-f]{32}$/)
    const reordered = Object.fromEntries(Object.entries(identity).reverse())
    expect(cacheKey(reordered)).toBe(k)
    expect(cacheKey({ ...identity, cue: normalizeCue('Ich  warte seit zwei Stunden auf\ndich.') })).toBe(k)
    expect(cacheKey({ nested: { b: 1, a: [1, { y: 2, x: 1 }] } })).toBe(cacheKey({ nested: { a: [1, { x: 1, y: 2 }], b: 1 } }))
    for (const change of [{ lemma: 'wartet' }, { level: 'B1' }, { native: 'tr' }, { model: 'us.amazon.nova-2-lite-v1:0' }, { v: 2 }]) {
      expect(cacheKey({ ...identity, ...change })).not.toBe(k)
    }
  })

  it('get returns null for a missing key, deletes and returns null for an unparsable or schema-failing file, and returns the entry after set', async () => {
    const cache = new AiCache(dir)
    const key = cacheKey(identity)
    expect(cache.path('gloss', key)).toBe(join(dir, 'gloss', `${key}.json`))
    expect(await cache.get('gloss', key, Gloss)).toBeNull()

    await mkdir(join(dir, 'gloss'), { recursive: true })
    await writeFile(cache.path('gloss', key), '{not json')
    expect(await cache.get('gloss', key, Gloss)).toBeNull()
    await expect(access(cache.path('gloss', key))).rejects.toThrow()

    await writeFile(cache.path('gloss', key), JSON.stringify({ ...entry, output: { gloss: 'wait' } }))
    expect(await cache.get('gloss', key, Gloss)).toBeNull()
    await expect(access(cache.path('gloss', key))).rejects.toThrow()

    await writeFile(cache.path('gloss', key), JSON.stringify({ ...entry, kind: 'quiz' }))
    expect(await cache.get('gloss', key, Gloss)).toBeNull()

    await cache.set('gloss', key, entry)
    expect(await cache.get('gloss', key, Gloss)).toEqual(entry)
    expect(await cache.get('quiz', key, Gloss)).toBeNull()
  })

  it('set writes atomically (no .tmp left behind) and creates the kind directory', async () => {
    const cache = new AiCache(join(dir, 'nested', 'ai'))
    const key = cacheKey(identity)
    await cache.set('gloss', key, entry)
    const files = await readdir(join(dir, 'nested', 'ai', 'gloss'))
    expect(files).toEqual([`${key}.json`])
    expect(JSON.parse(await readFile(cache.path('gloss', key), 'utf8'))).toEqual(entry)
  })
})
