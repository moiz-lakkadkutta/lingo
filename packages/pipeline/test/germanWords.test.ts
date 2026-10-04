import { isGermanWord } from '@lingo/contracts'
import { pythonHasSimplemma } from '../src/lemmatize'
import { simplemmaGermanLexicon } from '../src/ai/germanWords'

const hasSimplemma = await pythonHasSimplemma()

describe.skipIf(!hasSimplemma)('G-NONWORD with the real word list (freq-de.txt + simplemma de)', () => {
  const lexiconFor = simplemmaGermanLexicon({ log: () => {} })
  const check = async (words: string[]) => { const lex = (await lexiconFor(words))!; return Object.fromEntries(words.map((w) => [w, isGermanWord(w, lex)])) }

  it('catches the invented words of the 2026-10-03 eval runs and accepts real words and compounds', async () => {
    const r = await check(['Bratfest', 'tollerisch', 'Faulenzerr', 'Faulling', 'Wurstchen', 'Bratparty', 'Tennisschläger', 'Würstchen', 'Heftzwecke', 'Ausflug', 'Flohmarkt', 'Reißzwecken', 'Grillfest', 'Altwarensammler', 'Faulenzer', 'Erfrischungen'])
    expect(Object.entries(r).filter(([, ok]) => !ok).map(([w]) => w)).toEqual(['Bratfest', 'tollerisch', 'Faulenzerr', 'Faulling', 'Wurstchen', 'Bratparty'])
  })

  it('cannot catch "Faulenz": simplemma knows it as a form of faulenzen (a real word, wrong as a noun gloss)', async () => {
    expect((await check(['Faulenz'])).Faulenz).toBe(true)
  })

  it('looks every string up once (results are kept between cards)', async () => {
    const calls: number[] = []
    const lemmatizer = { name: 'spy', lemmatize: async () => '', lemmatizeAll: async (ws: Array<{ word: string }>) => { calls.push(ws.length); return ws.map((w) => ({ lemma: w.word, known: false })) } }
    const f = simplemmaGermanLexicon({ lemmatizer, freq: ['fest'], log: () => {} })
    await f(['Bratfest'])
    await f(['Bratfest'])
    expect(calls).toHaveLength(1)
  })

  it('a failing bridge skips the rule with one WARNING instead of failing the gloss', async () => {
    const logs: string[] = []
    const lemmatizer = { name: 'broken', lemmatize: async () => '', lemmatizeAll: async () => { throw new Error('no python') } }
    const f = simplemmaGermanLexicon({ lemmatizer, freq: [], log: (m) => logs.push(m) })
    expect(await f(['Bratfest'])).toBeUndefined()
    expect(await f(['Grillfest'])).toBeUndefined()
    expect(logs.filter((l) => l.startsWith('WARNING'))).toHaveLength(1)
  })
})
