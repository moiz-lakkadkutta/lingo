import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DATA_DIR, loadFreqList, rankFn } from '../src/freq'
import { loadNames } from '../src/names'
import { pythonLemmatizer } from '../src/lemmatize'
import { simplemmaAvailable } from './helpers/simplemma'
import { EXCLUDE, filterSeed, HAND, intlLabels, ISO_3166_1, M49_CONTINENTS, mergeNamesFile } from '../scripts/build-names'

describe('build-names (docs/decisions/0008 decision 8)', () => {
  it('embeds the 249 ISO 3166-1 codes and 7 M49 continents, all distinct', () => {
    expect(ISO_3166_1).toHaveLength(249)
    expect(new Set(ISO_3166_1).size).toBe(249)
    expect(M49_CONTINENTS).toHaveLength(7)
  })
  it('intlLabels keeps single-token region and continent names only: no language names, no demonyms, no excluded ordinary words', () => {
    const de = intlLabels('de'), en = intlLabels('en')
    for (const n of ['Brasilien', 'Deutschland', 'Afrika', 'Japan', 'Island', 'Georgien']) expect(de, n).toContain(n)
    for (const n of ['Brazil', 'Germany', 'Africa', 'Japan']) expect(en, n).toContain(n)
    for (const n of ['Englisch', 'Französisch', 'Deutsch', 'Spanisch', 'Jersey']) expect(de, n).not.toContain(n)
    for (const n of ['English', 'German', 'Spanish', 'Polish', 'Japanese', 'Afar', 'Lao', 'Jersey', 'Chad', 'Guinea', 'Turkey', 'China', 'Jordan', 'Georgia']) expect(en, n).not.toContain(n)
    expect(de).not.toContain('Vereinigte Staaten')
    expect(en).not.toContain('Costa Rica')
    for (const l of [...de, ...en]) expect(l).toMatch(/^[A-ZÄÖÜ][\p{L}'’-]*$/u)
  })
  it('EXCLUDE lists region labels that are ordinary words', () => {
    expect(EXCLUDE.en).toEqual(expect.arrayContaining(['Jersey', 'Chad', 'Guinea', 'Turkey', 'China', 'Jordan', 'Georgia', 'Afar', 'Lao']))
    expect(EXCLUDE.de).toContain('Jersey')
  })
  it('filterSeed drops a label only when simplemma knows it AND it ranks below 1000', () => {
    const known = (w: string) => ['deutsch', 'chad', 'turkey'].includes(w)
    const rank = (l: string) => ({ deutsch: 300, chad: 1500, turkey: 2800, brasilien: undefined })[l]
    expect(filterSeed(['Deutsch', 'Chad', 'Turkey', 'Brasilien'], known, rank)).toEqual(['Chad', 'Turkey', 'Brasilien'])
    expect(filterSeed(['Deutsch'], () => false, rank)).toEqual(['Deutsch']) // unknown to simplemma: a name whatever its rank
  })
  it('mergeNamesFile keeps the header, adds new names once, sorts by code point and is idempotent', () => {
    const before = '# header one\n# header two\nAnna\nZoe\n'
    const a = mergeNamesFile(before, ['Margot', 'Anna', 'Brasilien', 'Margot'])
    expect(a.added).toEqual(['Brasilien', 'Margot'])
    expect(a.text).toBe('# header one\n# header two\nAnna\nBrasilien\nMargot\nZoe\n')
    expect(mergeNamesFile(a.text, ['Margot', 'Brasilien'])).toEqual({ text: a.text, added: [] })
  })
})

describe('names data after build:names + build:freq', () => {
  it('has the hand additions and no rank for them', async () => {
    const deNames = await loadNames(resolve(DATA_DIR, 'names-de.txt')), enNames = await loadNames(resolve(DATA_DIR, 'names-en.txt'))
    const de = rankFn(await loadFreqList('de')), en = rankFn(await loadFreqList('en'))
    for (const n of HAND.de) { expect(deNames.has(n), n).toBe(true); expect(de(n.toLowerCase()), n).toBeUndefined() }
    for (const n of HAND.en) { expect(enNames.has(n), n).toBe(true); expect(en(n.toLowerCase()), n).toBeUndefined() }
    for (const n of ['Margot', 'Brasilien', 'Shanghai', 'Auschwitz']) expect(deNames.has(n), n).toBe(true)
    for (const n of ['Pete', 'Irving']) expect(enNames.has(n), n).toBe(true)
  })
  it('has the Intl region seed (Brasilien, Japan, Afrika / Brazil, Japan, Africa) and no language names or demonyms', async () => {
    const deNames = await loadNames(resolve(DATA_DIR, 'names-de.txt')), enNames = await loadNames(resolve(DATA_DIR, 'names-en.txt'))
    for (const n of ['Japan', 'Afrika', 'Ägypten']) expect(deNames.has(n), n).toBe(true)
    for (const n of ['Brazil', 'Japan', 'Africa']) expect(enNames.has(n), n).toBe(true)
    for (const n of ['Deutsch', 'Englisch', 'Französisch', 'Spanisch']) expect(deNames.has(n), n).toBe(false) // Jersey predates the seed in names-de (EXCLUDE only stops seeding)
    for (const n of ['English', 'German', 'Spanish', 'Polish', 'Japanese', 'Jersey', 'Chad', 'Guinea']) expect(enNames.has(n), n).toBe(false)
  })
  it('language names, demonyms and ordinary words keep their rank (stripping ignores case)', async () => {
    const de = rankFn(await loadFreqList('de')), en = rankFn(await loadFreqList('en'))
    for (const w of ['german', 'spanish', 'polish', 'japanese', 'english', 'jersey', 'french', 'chinese']) expect(en(w), w).toBeDefined()
    for (const w of ['deutsch', 'englisch', 'französisch', 'spanisch', 'russisch']) expect(de(w), w).toBeDefined()
  })
  it('the files are code-point sorted with a trailing LF', async () => {
    for (const lang of ['de', 'en']) {
      const text = await readFile(resolve(DATA_DIR, `names-${lang}.txt`), 'utf8')
      expect(text.endsWith('\n')).toBe(true)
      const names = text.split('\n').filter((l) => l && !l.startsWith('#'))
      expect(names).toEqual([...names].sort())
      expect(new Set(names).size).toBe(names.length)
    }
  })
})

describe.skipIf(!(await simplemmaAvailable()))('build:names is a no-op on the committed tree (simplemma)', () => {
  it('adds nothing when re-run', async () => {
    for (const lang of ['de', 'en'] as const) {
      const labels = intlLabels(lang)
      const res = await pythonLemmatizer().lemmatizeAll(labels.map((l) => ({ word: l.toLowerCase(), sentenceInitial: false })), lang)
      const known = new Map(labels.map((l, i) => [l.toLowerCase(), res[i]!.known]))
      const seed = filterSeed(labels, (w) => known.get(w) ?? false, rankFn(await loadFreqList(lang)))
      const text = await readFile(resolve(DATA_DIR, `names-${lang}.txt`), 'utf8')
      expect(mergeNamesFile(text, [...HAND[lang], ...seed]).added).toEqual([])
    }
  }, 30_000) // ~2 s alone; two Python lemmatizer runs exceed the 5 s default under a parallel `pnpm test`
})
