import type { Catalog, ClipCard, LibraryWord } from '@lingo/contracts'
import { dueLabel, filterWords, formatClock, formatMinutes, homeRows, isDueToday, nextClip, pickHero, progressBody, speakOptions } from '../src/app/selectors'
import { strings } from '../src/strings'

const card = (slug: string, o: Partial<ClipCard> = {}): ClipCard => ({ slug, title: slug.toUpperCase(), level: 'A2', durationS: 120, posterUrl: null, resumeS: null, completed: false, attribution: '', ...o })
const cat = (o: Partial<Catalog> = {}): Catalog => ({ continue: [], justRight: [], harder: [], fresh: [], ...o })
const word = (id: string, due: Date, intervalD = 0): LibraryWord => ({
  savedWordId: id, word: id, lemma: id, gloss: 'g', due: due.toISOString(), intervalD, reps: 1, learned: intervalD >= 21,
  clip: { slug: 'c', title: 'C', manifestUrl: 'http://x/m.m3u8' }, cue: { index: 0, startS: 1, endS: 2, text: 't', native: 'n' },
})
const now = new Date(2026, 9, 1, 10, 0, 0) // local 1 Oct 10:00

describe('selectors', () => {
  it('pickHero prefers an unstarted just-right clip, then any unfinished one, then harder, then fresh', () => {
    const started = card('s', { resumeS: 30 }), fresh = card('n'), done = card('d', { completed: true })
    expect(pickHero(cat({ justRight: [done, started, fresh] }))?.slug).toBe('n')
    expect(pickHero(cat({ justRight: [done, started] }))?.slug).toBe('s')
    expect(pickHero(cat({ justRight: [done], harder: [card('h1', { completed: true }), card('h2')] }))?.slug).toBe('h2')
    expect(pickHero(cat({ justRight: [done], fresh: [card('f')] }))?.slug).toBe('f')
    expect(pickHero(cat())).toBeNull()
  })
  it('homeRows drops empty rows, so an empty Continue is hidden', () => {
    const rows = homeRows(cat({ justRight: [card('a')], fresh: [card('b')] }), 'A2')
    expect(rows.map((r) => r.key)).toEqual(['justRight', 'fresh'])
    expect(homeRows(cat({ continue: [card('c')], justRight: [card('a')], harder: [card('h')], fresh: [card('b')] }), 'A2').map((r) => r.key)).toEqual(['continue', 'justRight', 'harder', 'fresh'])
  })
  it('homeRows titles say about and name the next band for harder', () => {
    const rows = homeRows(cat({ justRight: [card('a')], harder: [card('h')] }), 'A2')
    expect(rows[0]!.title).toBe(strings.home.justRight('A2'))
    expect(rows[0]!.title).toContain('about A2')
    expect(rows[1]!.title).toBe(strings.home.harder('B1'))
    expect(rows[1]!.title).toContain('about B1')
  })
  it('nextClip walks just-right after the current clip and skips completed ones', () => {
    const c = cat({ justRight: [card('a'), card('b', { completed: true }), card('c'), card('d')] })
    expect(nextClip(c, 'a')?.slug).toBe('c')
    expect(nextClip(c, 'c')?.slug).toBe('d')
    expect(nextClip(c, 'd')?.slug).toBe('a') // falls back to pickHero excluding the current clip
    expect(nextClip(cat({ justRight: [card('a')] }), 'a')).toBeNull()
    expect(nextClip(null, 'a')).toBeNull()
  })
  it('formatMinutes rounds and never shows 0 min; formatClock pads seconds', () => {
    expect(formatMinutes(10)).toBe(strings.time.minutes(1))
    expect(formatMinutes(150)).toBe('3 min')
    expect(formatMinutes(89)).toBe('1 min')
    expect(formatClock(65.9)).toBe('1:05')
    expect(formatClock(5)).toBe('0:05')
    expect(formatClock(600)).toBe('10:00')
  })
  it('progressBody marks the last ten seconds or 97 % as completed', () => {
    expect(progressBody('x', 30, 120)).toEqual({ clipSlug: 'x', positionS: 30, completed: false })
    expect(progressBody('x', 110, 120).completed).toBe(true)
    expect(progressBody('x', 109, 120).completed).toBe(false)
    expect(progressBody('x', 970, 1000).completed).toBe(true)
    expect(progressBody('x', 960, 1000).completed).toBe(false)
  })
  it('isDueToday counts overdue and later-today as due and tomorrow as not', () => {
    expect(isDueToday(new Date(2026, 8, 20).toISOString(), now)).toBe(true)
    expect(isDueToday(new Date(2026, 9, 1, 23, 59).toISOString(), now)).toBe(true)
    expect(isDueToday(new Date(2026, 9, 2, 0, 1).toISOString(), now)).toBe(false)
  })
  it('dueLabel says today, tomorrow or in N days', () => {
    expect(dueLabel(new Date(2026, 8, 20).toISOString(), now)).toBe(strings.words.dueToday)
    expect(dueLabel(new Date(2026, 9, 1, 22).toISOString(), now)).toBe(strings.words.dueToday)
    expect(dueLabel(new Date(2026, 9, 2, 8).toISOString(), now)).toBe(strings.words.dueTomorrow)
    expect(dueLabel(new Date(2026, 9, 5, 1).toISOString(), now)).toBe(strings.words.dueIn(4))
  })
  it('filterWords keeps due order and applies all, due and learned', () => {
    const ws = [word('a', new Date(2026, 8, 30)), word('b', new Date(2026, 9, 1, 20), 25), word('c', new Date(2026, 9, 3)), word('d', new Date(2026, 9, 9), 30)]
    expect(filterWords(ws, 'all', now).map((w) => w.lemma)).toEqual(['a', 'b', 'c', 'd'])
    expect(filterWords(ws, 'due', now).map((w) => w.lemma)).toEqual(['a', 'b'])
    expect(filterWords(ws, 'learned', now).map((w) => w.lemma)).toEqual(['b', 'd'])
  })
  it('speakOptions shows eight languages and never the learning language', () => {
    const de = speakOptions('de')
    expect(de).toHaveLength(8)
    expect(de.map((o) => o.code)).not.toContain('de')
    expect(de[0]).toEqual({ code: 'en', name: 'English' })
    const en = speakOptions('en')
    expect(en).toHaveLength(8)
    expect(en.map((o) => o.code)).not.toContain('en')
    expect(en[0]!.code).toBe('de')
  })
})
