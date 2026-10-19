import type { Catalog, ClipCard, LibraryWord } from '@lingo/contracts'
import { dueLabel, filterWords, formatClock, formatMinutes, homeRows, isDueToday, nextClip, pickHero, progressBody, speakOptions, startPosition } from '../src/app/selectors'
import { SUPPORTED_NATIVES } from '../src/settings/natives'
import { strings } from '../src/strings'

const card = (slug: string, o: Partial<ClipCard> = {}): ClipCard => ({ slug, title: slug.toUpperCase(), level: 'A2', durationS: 120, posterUrl: null, resumeS: null, completed: false, attribution: '', ...o })
const cat = (o: Partial<Catalog> = {}): Catalog => ({ continue: [], justRight: [], harder: [], fresh: [], ...o })
const word = (id: string, due: Date, intervalD = 0): LibraryWord => ({
  savedWordId: id, word: id, lemma: id, gloss: 'g', due: due.toISOString(), intervalD, reps: 1, learned: intervalD >= 21,
  clip: { slug: 'c', title: 'C', manifestUrl: 'http://x/m.m3u8' }, cue: { index: 0, startS: 1, endS: 2, text: 't', native: 'n' },
})

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
  it('startPosition: a launch position in [0, duration) wins over server progress; past the end or not a number falls back to it (review-007 L8)', () => {
    expect(startPosition(60, 30, 120)).toBe(60) // the learner asked for 1:00 explicitly
    expect(startPosition(0, 30, 120)).toBe(0)
    expect(startPosition(-5, 30, 120)).toBe(0) // clamped to 0
    expect(startPosition(119.5, null, 120)).toBe(119.5)
    expect(startPosition(120, 30, 120)).toBe(30) // the end is not a start: resume logic decides
    expect(startPosition(999999999, null, 120)).toBe(0)
    expect(startPosition(Number.NaN, 30, 120)).toBe(30)
    expect(startPosition(Number.POSITIVE_INFINITY, 30, 120)).toBe(30)
    expect(startPosition(undefined, 30, 120)).toBe(30) // no launch position: server progress (Continue)
    expect(startPosition(undefined, null, 120)).toBe(0)
  })
  // Days are UTC calendar days, like GET /me/words?due=today and the phone (decision 0011 §5).
  const utc = (d: number, h = 0, m = 0) => new Date(Date.UTC(2026, 9, d, h, m))
  const utcNow = utc(1, 10)
  it('isDueToday counts overdue and later-today (UTC) as due and the next UTC day as not', () => {
    expect(isDueToday(new Date(Date.UTC(2026, 8, 20)).toISOString(), utcNow)).toBe(true)
    expect(isDueToday(utc(1, 23, 59).toISOString(), utcNow)).toBe(true)
    expect(isDueToday(utc(2, 0, 0).toISOString(), utcNow)).toBe(false) // next UTC midnight is tomorrow, as on the API
    expect(isDueToday(utc(2, 0, 1).toISOString(), utcNow)).toBe(false)
  })
  it('isDueToday and dueLabel ignore the device time zone (LING-005 follow-up)', () => {
    const tz = process.env.TZ
    try {
      for (const zone of ['Pacific/Auckland', 'America/Los_Angeles', 'UTC']) {
        process.env.TZ = zone
        const late = utc(1, 23, 30) // 23:30 UTC; local Auckland is already 2 Oct, Los Angeles still 1 Oct afternoon
        expect(isDueToday(utc(1, 23, 50).toISOString(), late)).toBe(true)
        expect(isDueToday(utc(2, 0, 10).toISOString(), late)).toBe(false)
        expect(dueLabel(utc(2, 0, 10).toISOString(), late)).toBe(strings.words.dueTomorrow)
        expect(dueLabel(utc(4, 0, 10).toISOString(), late)).toBe(strings.words.dueIn(3))
      }
    } finally { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz }
  })
  it('dueLabel says today, tomorrow or in N days', () => {
    expect(dueLabel(new Date(Date.UTC(2026, 8, 20)).toISOString(), utcNow)).toBe(strings.words.dueToday)
    expect(dueLabel(utc(1, 22).toISOString(), utcNow)).toBe(strings.words.dueToday)
    expect(dueLabel(utc(2, 8).toISOString(), utcNow)).toBe(strings.words.dueTomorrow)
    expect(dueLabel(utc(5, 1).toISOString(), utcNow)).toBe(strings.words.dueIn(4))
  })
  it('filterWords keeps due order and applies all, due and learned', () => {
    const ws = [word('a', new Date(Date.UTC(2026, 8, 30))), word('b', utc(1, 20), 25), word('c', utc(3)), word('d', utc(9), 30)]
    expect(filterWords(ws, 'all', utcNow).map((w) => w.lemma)).toEqual(['a', 'b', 'c', 'd'])
    expect(filterWords(ws, 'due', utcNow).map((w) => w.lemma)).toEqual(['a', 'b'])
    expect(filterWords(ws, 'learned', utcNow).map((w) => w.lemma)).toEqual(['b', 'd'])
  })
  it('speakOptions offers only supported natives and never the learning language (QA #15)', () => {
    expect(speakOptions('de')).toEqual([{ code: 'en', name: 'English' }])
    expect(speakOptions('en')).toEqual([{ code: 'de', name: 'Deutsch' }])
    for (const l of ['de', 'en'] as const) for (const o of speakOptions(l)) expect(SUPPORTED_NATIVES).toContain(o.code)
  })
})
