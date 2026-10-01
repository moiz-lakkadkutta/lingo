import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defaultPython, lemmaKey, pythonHasSimplemma, REPO_VENV_PYTHON, pythonLemmatizer, tableLemmatizer, type LemmaResult } from '../src/lemmatize'
import { tokenizeCues, tokenizeWords } from '../src/tokenize'
import { segmentWithReport, wrap2 } from '../src/segment'
import { wordsFromTranscribe } from '../src/steps/transcribe'
import { TranscribeJson } from '../src/types'
import { FIXTURES, fixtureVocabulary, lemmaTable } from '../scripts/gen-fixtures'

const readJson = async <T>(f: string) => JSON.parse(await readFile(resolve(FIXTURES, f), 'utf8')) as T
const table = (lang: 'de' | 'en') => readJson<Record<string, LemmaResult>>(`lemmas-${lang}.json`)
const fixture = (lang: 'de' | 'en') => readJson<unknown>(`transcribe-60s-${lang}.json`).then((j) => TranscribeJson.parse(j))
const overlapFixture = () => readJson<unknown>('transcribe-overlap-de.json').then((j) => TranscribeJson.parse(j))

describe('tableLemmatizer', () => {
  const t = { Warte: { lemma: 'Warte', known: true }, 'Warte|si': { lemma: 'warten', known: true }, Stunden: { lemma: 'Stunde', known: true } }
  it('returns lemma and known from the table, keyed by word and sentence-initial flag', async () => {
    const lm = tableLemmatizer(t)
    expect(lm.name).toBe('table')
    expect(await lm.lemmatize('Warte', 'de', true)).toBe('warten')
    expect(await lm.lemmatize('Warte', 'de')).toBe('Warte')
    expect(await lm.lemmatizeAll([{ word: 'Stunden', sentenceInitial: false }, { word: 'Warte', sentenceInitial: true }], 'de')).toEqual([{ lemma: 'Stunde', known: true }, { lemma: 'warten', known: true }])
    expect(lemmaKey('Warte', true)).toBe('Warte|si'); expect(lemmaKey('Warte', false)).toBe('Warte')
  })
  it('throws on a miss in strict mode and echoes the word otherwise', async () => {
    await expect(tableLemmatizer(t).lemmatize('Zwiebelkuchen', 'de')).rejects.toThrow(/Zwiebelkuchen/)
    expect(await tableLemmatizer(t, { strict: false }).lemmatizeAll([{ word: 'Zwiebelkuchen', sentenceInitial: false }], 'de')).toEqual([{ lemma: 'Zwiebelkuchen', known: false }])
  })
})

describe('lemma fixtures', () => {
  it('cover every (word, sentenceInitial) pair of both Transcribe fixtures', async () => {
    for (const lang of ['de', 'en'] as const) {
      const tbl = await table(lang)
      const toks = tokenizeWords(wordsFromTranscribe(await fixture(lang)))
      expect(toks.length).toBeGreaterThan(100)
      const missing = toks.map((t) => lemmaKey(t.word, t.sentenceInitial)).filter((k) => !(k in tbl))
      expect(missing).toEqual([])
    }
  })
  it('cover every (word, sentenceInitial) pair of the overlap fixture', async () => {
    const tbl = { ...(await table('de')), ...(await readJson<Record<string, LemmaResult>>('lemmas-overlap-de.json')) }
    const cues = segmentWithReport(wordsFromTranscribe(await overlapFixture())).cues.map((s) => ({ ...s, text: wrap2(s.text) }))
    const toks = tokenizeCues(cues)
    expect(toks.length).toBeGreaterThan(80)
    expect(toks.map((t) => lemmaKey(t.word, t.sentenceInitial)).filter((k) => !(k in tbl))).toEqual([])
    expect(toks.find((t) => t.word === 'Aber')!.sentenceInitial).toBe(true) // the second line of a two-speaker cue
  })
  it('contain the expected entries the highlight path relies on', async () => {
    const de = await table('de'), en = await table('en')
    expect(de['Warte|si']!.lemma).toBe('warten'); expect(de['Stunden']!.lemma).toBe('Stunde'); expect(de['angerufen']!.lemma).toBe('anrufen')
    expect(de['abgenommen']!.lemma).toBe('abnehmen'); expect(de['ausgefallen']!.lemma).toBe('ausfallen'); expect(de['verspätet']!.lemma).toBe('verspäten')
    expect(de['geschafft']!.lemma).toBe('schaffen'); expect(de['Berlin']!.lemma).toBe('Berlin'); expect(de['Anna']!.lemma).toBe('Anna')
    expect(en['waiting']!.lemma).toBe('wait'); expect(en['hours']!.lemma).toBe('hour'); expect(en['answered']!.lemma).toBe('answer')
    expect(en['cancelled']!.lemma).toBe('cancell') // simplemma 2.0.0 quirk, kept on purpose (docs/decisions/0004)
    expect(en['managed']!.lemma).toBe('manage'); expect(en['London']!.lemma).toBe('London'); expect(en['Wait|si']!.lemma).toBe('wait'); expect(en['No|si']!.lemma).toBe('no')
  })
})

const hasSimplemma = await pythonHasSimplemma()
describe.skipIf(!hasSimplemma)('pythonLemmatizer (skipIf no simplemma)', () => {
  it('matches the committed lemma table for the German fixture', async () => {
    const vocab = fixtureVocabulary(await fixture('de'), 'de')
    expect(await lemmaTable(vocab, 'de')).toEqual(await table('de'))
  }, 30000)
  it('matches the committed lemma table for the overlap fixture', async () => {
    const vocab = fixtureVocabulary(await overlapFixture(), 'de', [])
    expect(await lemmaTable(vocab, 'de')).toEqual(await readJson<Record<string, LemmaResult>>('lemmas-overlap-de.json'))
  }, 30000)
  it('reports the pinned version', async () => {
    const lm = pythonLemmatizer()
    await lm.lemmatize('Haus', 'de')
    expect(lm.name).toBe('simplemma@2.0.0')
  }, 30000)
  it('resolves the sentence-initial cases', async () => {
    const res = await pythonLemmatizer().lemmatizeAll([{ word: 'Warte', sentenceInitial: true }, { word: 'Stunden', sentenceInitial: true }, { word: 'Nein', sentenceInitial: true }, { word: 'Berlin', sentenceInitial: true }], 'de')
    expect(res.map((r) => r.lemma)).toEqual(['warten', 'Stunde', 'nein', 'Berlin'])
  }, 30000)
  it('handles an empty token without aborting the batch', async () => {
    const res = await pythonLemmatizer().lemmatizeAll([{ word: 'Haus', sentenceInitial: false }, { word: '', sentenceInitial: false }, { word: 'Stunden', sentenceInitial: false }], 'de')
    expect(res).toEqual([{ lemma: 'Haus', known: true }, { lemma: '', known: false }, { lemma: 'Stunde', known: true }])
  }, 30000)
  it('survives PYTHONIOENCODING=ascii', async () => {
    const prev = process.env.PYTHONIOENCODING
    process.env.PYTHONIOENCODING = 'ascii'
    try {
      const res = await pythonLemmatizer().lemmatizeAll([{ word: 'Straßen', sentenceInitial: false }, { word: 'schön', sentenceInitial: false }], 'de')
      expect(res.map((r) => r.lemma)).toEqual(['Straße', 'schön'])
    } finally { if (prev === undefined) delete process.env.PYTHONIOENCODING; else process.env.PYTHONIOENCODING = prev }
  }, 30000)
  it('throws with stderr when the bridge fails', async () => {
    await expect(pythonLemmatizer({ script: '/nonexistent/bridge.py' }).lemmatize('Haus', 'de')).rejects.toThrow(/exited/)
  }, 30000)
})

describe('defaultPython', () => {
  it('prefers LINGO_PYTHON, then <repo>/.venv-lemma/bin/python when it exists, then python3', () => {
    expect(defaultPython({ LINGO_PYTHON: '/opt/py' }, () => true)).toBe('/opt/py')
    expect(defaultPython({}, (p) => p === REPO_VENV_PYTHON)).toBe(REPO_VENV_PYTHON)
    expect(defaultPython({}, () => false)).toBe('python3')
    expect(REPO_VENV_PYTHON).toMatch(/\/\.venv-lemma\/bin\/python$/)
    expect(REPO_VENV_PYTHON).not.toMatch(/packages/)
  })
})
