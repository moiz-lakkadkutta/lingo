import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadFreqList, rankFn } from '../src/freq'
import { pickHighlights, wordListSkipLine, type SkipReason, type Token } from '../src/highlights'
import { fixtureDeps } from '../src/fixtureDeps'
import { prepare } from '../src/prepare'

/**
 * LING-001 follow-up (docs/decisions/0009 decision 1): a highlight must be a word of the clip's language. The word list is the frequency
 * list the pipeline already loads (data/freq-{lang}.txt, 20 000 lemmas, decision 0004); `sal` is in it (the name Sal, rank 4972), so the
 * Transcribe confidence floor (0.4) is the rule that removes it. These tests use the real lists.
 */
describe('highlights are checked against the language word list', async () => {
  const en = rankFn(await loadFreqList('en'))
  const de = rankFn(await loadFreqList('de'))
  const cue = (index: number, tokens: Token[]) => ({ index, tokens })

  it('(a) ASR non-word "sal" (confidence 0.158) is not a highlight; the real "sale" next to it is', () => {
    const skipped: Array<[number, string, SkipReason]> = []
    const hl = pickHighlights([cue(0, [{ word: 'scavenger', lemma: 'scavenger', asr: 0.97 }, { word: 'sal', lemma: 'sal', asr: 0.158 }]), cue(1, [{ word: 'sale', lemma: 'sale', asr: 0.99 }])], en, 'A2', 1, undefined, (i, t, why) => skipped.push([i, t.word, why]))
    expect(hl.map((h) => h.word)).not.toContain('sal')
    expect(hl.map((h) => h.word)).toContain('sale')
    expect(skipped).toContainEqual([0, 'sal', 'asr'])
  })
  it('(b) a rare word that is in the en list stays (old-timer, rank 14058, confidence 0.519)', () => {
    const hl = pickHighlights([cue(66, [{ word: 'old-timer', lemma: 'old-timer', asr: 0.519 }])], en, 'A2', 1)
    expect(hl).toEqual([{ cueIndex: 66, word: 'old-timer', lemma: 'old-timer', rank: 14058 }])
  })
  it('(c) German inflected and compound-genitive forms stay when their lemma is in the de list (registrierte → registrieren, Konsulats → Konsulat)', () => {
    const skipped: string[] = []
    const hl = pickHighlights([cue(0, [{ word: 'registrierte', lemma: 'registrieren', asr: 0.99 }]), cue(1, [{ word: 'Konsulats', lemma: 'Konsulat', asr: 0.99 }]), cue(2, [{ word: 'durchzusetzen', lemma: 'durchsetzen', asr: 0.9 }])], de, 'A2', 1, undefined, (_i, t) => skipped.push(t.word))
    expect(hl.map((h) => h.lemma)).toEqual(['registrieren', 'Konsulat', 'durchsetzen'])
    expect(skipped).toEqual([])
  })
  it('(d) a token whose lemma is not in the list is reported as skipped with reason "not-in-word-list", once per lemma, even in cues past the 40 % budget', () => {
    const skipped: Array<[number, string, SkipReason]> = []
    const cues = [cue(0, [{ word: 'Faulenzerr', lemma: 'Faulenzerr' }, { word: 'Konsulat', lemma: 'Konsulat' }]), cue(1, [{ word: 'Faulenzerr', lemma: 'Faulenzerr' }]), cue(2, [{ word: 'tollerisch', lemma: 'tollerisch' }])]
    const hl = pickHighlights(cues, de, 'A2', 0.4, undefined, (i, t, why) => skipped.push([i, t.word, why]))
    expect(hl.map((h) => h.word)).toEqual(['Konsulat'])
    expect(skipped).toEqual([[0, 'Faulenzerr', 'not-in-word-list'], [2, 'tollerisch', 'not-in-word-list']])
    // names, numbers and words of ≤ 2 letters are never candidates, so they are not reported either
    const none: string[] = []
    pickHighlights([cue(0, [{ word: 'Xyzabc', lemma: 'Xyzabc', name: true }, { word: 'zweiundvierzigste', lemma: 'zweiundvierzigste' }, { word: 'qz', lemma: 'qz' }])], de, 'A2', 1, undefined, (_i, t) => none.push(t.word))
    expect(none).toEqual([])
    // a contraction simplemma does not know is a known word by its surface form (I'm → i, rankOf): not reported, and not a highlight
    const contr: string[] = []
    expect(pickHighlights([cue(0, [{ word: "I'm", lemma: "I'm" }, { word: "you've", lemma: "you've" }])], en, 'A1', 1, undefined, (_i, t) => contr.push(t.word))).toEqual([])
    expect(contr).toEqual([])
  })
  it('(d) wordListSkipLine lists the skipped words with their cue, or nothing when there are none', () => {
    expect(wordListSkipLine('de', [])).toBeUndefined()
    expect(wordListSkipLine('de', [{ cueIndex: 0, word: 'Faulenzerr' }, { cueIndex: 2, word: 'tollerisch' }])).toBe('highlights: 2 candidates not in the de word list (data/freq-de.txt), never highlighted: Faulenzerr (cue 0), tollerisch (cue 2)')
  })
  it('(d) prepare logs the candidates it skipped because they are not in the word list', async () => {
    const workRoot = await mkdtemp(join(tmpdir(), 'lingo-dict-'))
    try {
      const first = await prepare({ slug: 'dict-a', source: 's3://unused', lang: 'de', natives: ['en'], workRoot, publish: false }, fixtureDeps('de'))
      const gone = first.clip.highlights[0]!
      const d = fixtureDeps('de')
      d.freqList = async (l) => (await loadFreqList(l)).filter((x) => x.toLowerCase() !== gone.lemma.toLowerCase())
      const lines: string[] = []
      d.log = (m) => lines.push(m)
      const r = await prepare({ slug: 'dict-b', source: 's3://unused', lang: 'de', natives: ['en'], workRoot, publish: false }, d)
      expect(r.clip.highlights.map((h) => h.lemma)).not.toContain(gone.lemma)
      const line = lines.find((m) => m.startsWith('highlights: ') && m.includes('not in the de word list'))
      expect(line).toBeDefined()
      expect(line).toContain(`${gone.word} (cue ${gone.cueIndex})`)
    } finally { await rm(workRoot, { recursive: true, force: true }) }
  })
})
