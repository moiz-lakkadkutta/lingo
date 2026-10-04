import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GlossCard, PreparedQuizItem } from '@lingo/contracts'
import type { ClipGlossResult } from '../src/ai/glossClip'
import { GoldSet, type GoldItem } from '../src/eval/gold'
import { quizChecks, scoreItem, scoreSet } from '../src/eval/score'

const here = dirname(fileURLToPath(import.meta.url))
const gold = GoldSet.parse(JSON.parse(readFileSync(resolve(here, '..', 'eval', 'gold', 'en-de.what-to-do-on-a-date-1950.json'), 'utf8')))
const item = (id: string) => gold.items.find((i) => i.id === id)!
const set = { lang: gold.lang, native: gold.native }

const result = (g: GoldItem, card: Partial<GlossCard>, over: Partial<ClipGlossResult> = {}): ClipGlossResult => {
  const c: GlossCard = { sense: 's', pos: 'noun', gloss: ['x'], register: 'neutral', example: `I like the ${g.word} here.`, ...card }
  return { cueIndex: g.cueIndex, word: g.word, lemma: g.lemma, rank: 1000, cue: g.cue, nativeCue: g.nativeCue, status: 'ok', card: c, gloss: { gloss: c.gloss.join(', '), grammar: 'g', example: c.example }, issues: [], attempts: 1, cached: false, reasked: false, ...over } as ClipGlossResult
}

describe('eval scorer (LING-002-gate-c §9)', () => {
  it('GoldSet parses the committed English gold file and it has 19 scored items and one excluded item', () => {
    expect(gold.items).toHaveLength(20)
    expect(gold.items.filter((i) => 'excluded' in i.expect)).toHaveLength(1)
    expect(item('c42-sal').asr).toBe(0.158)
    const scored = gold.items.filter((i) => !('excluded' in i.expect))
    expect(scored).toHaveLength(19)
    expect(scored.filter((i) => 'ambiguous' in i.expect && i.expect.ambiguous).map((i) => i.id)).toEqual(['c12-scavenger', 'c66-old-timer'])
    for (const i of gold.items) expect(i.cue).toContain(i.word)
  })

  it('scoreItem passes a card whose gloss matches accept after normalisation (article and parentheses removed)', () => {
    const tacks = item('c81-tacks')
    const s = scoreItem(tacks, result(tacks, { gloss: ['die Reißzwecken'], plural: 'tacks', example: 'I need some tacks for the board.' }), set)
    expect(s.checks).toEqual({ 'S-SENSE': true, 'S-POS': true, 'S-FORMS': true, 'S-VALID': true, 'S-FIRST': true, 'S-LANG': true })
    expect(s.pass).toBe(true)
    const baseball = item('c98-baseball')
    expect(scoreItem(baseball, result(baseball, { gloss: ['Baseball (Sport)'], plural: 'none', example: 'We play baseball on Sundays.' }), set).pass).toBe(true)
  })

  it('scoreItem scores the displayed (first) gloss only: "Verkauf, Ausverkauf" passes S-SENSE, "Ausverkauf, Verkauf" fails it', () => {
    const sale = item('c12-sale')
    const ok = scoreItem(sale, result(sale, { gloss: ['Verkauf', 'Ausverkauf'], plural: 'sales', example: 'The sale starts on Friday.' }), set)
    expect(ok.checks['S-SENSE']).toBe(true)
    expect(ok.gloss).toBe('Verkauf')
    const bad = scoreItem(sale, result(sale, { gloss: ['Ausverkauf', 'Verkauf'], plural: 'sales', example: 'The sale starts on Friday.' }), set)
    expect(bad.checks['S-SENSE']).toBe(false)
    expect(bad.pass).toBe(false)
  })

  it('scoreItem fails S-FORMS for plural "refreshment" and S-POS for a verb card on a noun item', () => {
    const refr = item('c78-refreshments')
    expect(scoreItem(refr, result(refr, { gloss: ['Erfrischungen'], plural: 'refreshment', example: 'We had refreshments after the game.' }), set).checks['S-FORMS']).toBe(false)
    const roast = item('c93-roast')
    const s = scoreItem(roast, result(roast, { pos: 'verb', gloss: ['Grillfest'], past: 'roasted', participle: 'roasted', example: 'We roast sausages in the park.' }), set)
    expect(s.checks['S-POS']).toBe(false)
  })

  it('S-FIRST reports a retry or a sibling re-ask but is not part of the pass; a rejected item fails S-VALID', () => {
    const tacks = item('c81-tacks')
    const s = scoreItem(tacks, result(tacks, { gloss: ['Reißzwecken'], plural: 'tacks', example: 'I need some tacks for the board.' }, { attempts: 2 }), set)
    expect(s.checks['S-FIRST']).toBe(false)
    expect(s.pass).toBe(true)
    const rej = scoreItem(tacks, { ...result(tacks, {}), status: 'rejected', issues: ['G-LEN: x'] } as ClipGlossResult, set)
    expect(rej.pass).toBe(false)
    expect(scoreItem(tacks, undefined, set).pass).toBe(false)
  })

  it('an excluded item passes only when the word is not a highlight after the ASR filter', () => {
    const sal = item('c42-sal')
    expect(scoreItem(sal, undefined, set).pass).toBe(true)
    expect(scoreItem({ ...sal, asr: 0.9 }, undefined, set).pass).toBe(false)
    expect(scoreItem(sal, result(sal, { gloss: ['Sal'] }), set).pass).toBe(false)
  })

  it('scoreSet replays the 2026-10-02 Nova Lite v1 outputs (fixture) and scores at most 8 of 19', () => {
    const fx = JSON.parse(readFileSync(resolve(here, 'fixtures', 'eval', 'lite-v1-2026-10-02.en.json'), 'utf8')) as { results: ClipGlossResult[] }
    const r = scoreSet(gold, fx.results)
    expect(r.total).toBe(19)
    expect(r.passed).toBeLessThanOrEqual(8)
    expect(r.rejectHits).toBeGreaterThan(0)
    expect(r.excludedOk).toBe(false) // sal was a highlight in that run
  })

  it('quizChecks verifies the answer invariant, 4 distinct options, the distractor rules and that every option gloss is from a passing card', () => {
    const ids = ['c81-tacks', 'c87-activities', 'c95-expense', 'c111-loafer'] as const
    const cards: Record<string, Partial<GlossCard>> = {
      'c81-tacks': { gloss: ['Reißzwecken'], plural: 'tacks' }, 'c87-activities': { gloss: ['Aktivitäten'], plural: 'activities' },
      'c95-expense': { gloss: ['Kosten'], plural: 'expenses' }, 'c111-loafer': { gloss: ['Faulenzer'], plural: 'loafers' },
    }
    const results = ids.map((id) => result(item(id), { ...cards[id], example: `I see the ${item(id).word} there.` }))
    const scores = results.map((r, i) => scoreItem(item(ids[i]!), r, set))
    const good: PreparedQuizItem = { kind: 'meaning', prompt: 'tacks', options: ['Kosten', 'Reißzwecken', 'Aktivitäten', 'Faulenzer'], answer: 1, cueIndex: 81 }
    expect(Object.values(quizChecks([good], results, scores)).every(Boolean)).toBe(true)
    const wrongAnswer = { ...good, answer: 0 }
    expect(quizChecks([wrongAnswer], results, scores)['Q-ANSWER']).toBe(false)
    const dup = { ...good, options: ['Kosten', 'Reißzwecken', 'Kosten', 'Faulenzer'] }
    expect(quizChecks([dup], results, scores)['Q-DISTINCT']).toBe(false)
    const foreign = { ...good, options: ['Kosten', 'Reißzwecken', 'Aktivitäten', 'Baseball-Spiel'] }
    expect(quizChecks([foreign], results, scores)['Q-PASSING-GLOSSES']).toBe(false)
  })
})
