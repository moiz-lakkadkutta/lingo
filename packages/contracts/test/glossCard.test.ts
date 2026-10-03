import { contentWords, englishComparatives, englishPlurals, englishVerbForms, GlossCard, glossCardIssues, isSoftCardIssue, pruneCard, stopwordScore, type CardContext } from '../src/index'

/** LING-002-gate-c §4: one `it` per validator row plus the passing case. */
const en = (word: string, lemma: string, cue: string, nativeCue?: string): CardContext => ({ word, lemma, cue, lang: 'en', native: 'de', ...(nativeCue ? { nativeCue } : {}) })
const card = (over: Partial<GlossCard>): GlossCard => GlossCard.parse({ sense: 'a thing', pos: 'noun', gloss: ['Ding'], register: 'neutral', example: 'This is a thing.', ...over })
const ids = (issues: string[]) => issues.map((i) => i.slice(0, i.indexOf(':')))

const tacksCtx = en('tacks', 'tack', 'Got any more tacks?', 'Hast du mehr Tipps?')
const tacksCard = (gloss: string[]) => card({ gloss, plural: 'tacks', example: 'I need some tacks for the board.' })

describe('glossCardIssues (validators v3)', () => {
  it('accepts a clean card: no issues', () => {
    expect(glossCardIssues(tacksCard(['Reißzwecken']), tacksCtx)).toEqual([])
  })

  it('G-COPY rejects a gloss equal to the word unless it has a clarifier', () => {
    const ctx = en('tennis', 'tennis', "I'll get my tennis racket.")
    expect(ids(glossCardIssues(card({ gloss: ['Tennis'], plural: 'none', example: 'We play tennis on Sundays.' }), ctx))).toContain('G-COPY')
    expect(glossCardIssues(card({ gloss: ['Tennis (Sport)'], plural: 'none', example: 'We play tennis on Sundays.' }), ctx)).toEqual([])
  })

  it('G-LEN rejects "jemand der Müll sammelt" for a single-word target and accepts "Altwarensammler" and "sich kennenlernen"', () => {
    const ctx = en('scavenger', 'scavenger', 'to fix up that scavenger sale?')
    const c = (gloss: string[]) => card({ gloss, plural: 'scavengers', example: 'The scavenger found an old lamp.' })
    expect(ids(glossCardIssues(c(['jemand der Müll sammelt']), ctx))).toContain('G-LEN')
    expect(glossCardIssues(c(['Altwarensammler']), ctx)).toEqual([])
    const acq = en('acquainted', 'acquaint', 'with a group, to get acquainted.')
    expect(glossCardIssues(card({ pos: 'verb', gloss: ['sich kennenlernen'], past: 'acquainted', participle: 'acquainted', example: 'We got acquainted at school.' }), acq)).toEqual([])
  })

  it('G-LEN rejects more than 6 words or 60 characters over all glosses', () => {
    const ctx = en('swell', 'swell', "Well, Kay's a swell girl.")
    const c = card({ pos: 'adjective', gloss: ['toll toll toll', 'prima prima prima prima'], comparative: 'sweller', example: 'That was a swell party.' })
    expect(ids(glossCardIssues(c, ctx))).toContain('G-LEN')
  })

  it('G-NEIGHBOUR rejects "mehr Heftklammern" when the native line is "Hast du mehr Tipps?" and accepts "Reißzwecken"', () => {
    expect(ids(glossCardIssues(tacksCard(['mehr Heftklammern']), tacksCtx))).toContain('G-NEIGHBOUR')
    expect(glossCardIssues(tacksCard(['Reißzwecken']), tacksCtx)).toEqual([])
  })

  it('G-NEIGHBOUR rejects "kommende Aktivitäten" against "Liste kommender Aktivitäten." and accepts "Aktivitäten"', () => {
    const ctx = en('activities', 'activity', 'A list of coming activities.', 'Liste kommender Aktivitäten.')
    const c = (gloss: string[]) => card({ gloss, plural: 'activities', example: 'The club has many activities.' })
    expect(ids(glossCardIssues(c(['kommende Aktivitäten']), ctx))).toContain('G-NEIGHBOUR')
    expect(glossCardIssues(c(['Aktivitäten']), ctx)).toEqual([])
  })

  it('G-NEIGHBOUR also rejects a neighbour phrase copied verbatim from the native line ("nicht viel")', () => {
    const ctx = en('expense', 'expense', 'Not much arranging needed, not much expense,', 'Nicht viel Arrangement, nicht viel Geld')
    const c = card({ gloss: ['Kosten', 'nicht viel'], plural: 'expenses', example: 'The trip was a big expense.' })
    expect(ids(glossCardIssues(c, ctx))).toContain('G-NEIGHBOUR')
  })

  it('G-NEIGHBOUR is skipped when no native line is given', () => {
    expect(ids(glossCardIssues(tacksCard(['mehr Heftklammern']), { ...tacksCtx, nativeCue: undefined }))).not.toContain('G-NEIGHBOUR')
  })

  it('G-SOURCE rejects a gloss that repeats another word of the cue', () => {
    const ctx = en('racket', 'racket', "Just a minute, Jeff. I'll get my tennis racket.")
    const c = (gloss: string[]) => card({ gloss, plural: 'rackets', example: 'My racket is new.' })
    expect(ids(glossCardIssues(c(['Tennis Schläger']), ctx))).toContain('G-SOURCE')
    expect(glossCardIssues(c(['Schläger']), ctx)).toEqual([])
  })

  it('X-LANG rejects a German example for an English target and accepts "I need my racket for tennis."', () => {
    const ctx = en('tennis', 'tennis', "I'll get my tennis racket.")
    const c = (example: string) => card({ gloss: ['Tennis (Sport)'], plural: 'none', example })
    expect(ids(glossCardIssues(c('Ich spiele Tennis mit meinem Freund.'), ctx))).toContain('X-LANG')
    expect(glossCardIssues(c('I need my racket for tennis.'), ctx)).toEqual([])
    expect(stopwordScore('Ich spiele Tennis mit meinem Freund.', 'de')).toBe(3)
    expect(stopwordScore('Ich spiele Tennis mit meinem Freund.', 'en')).toBe(0)
  })

  it('X-CUE rejects the cue itself as the example; X-USES is a soft issue', () => {
    const ctx = en('tacks', 'tack', 'Got any more tacks?')
    expect(ids(glossCardIssues(card({ gloss: ['Reißzwecken'], plural: 'tacks', example: 'Got any more tacks?' }), ctx))).toContain('X-CUE')
    const noUse = glossCardIssues(card({ gloss: ['Reißzwecken'], plural: 'tacks', example: 'Pin the paper to the board.' }), ctx)
    expect(ids(noUse)).toEqual(['X-USES'])
    expect(isSoftCardIssue(noUse[0]!)).toBe(true)
  })

  it('F-PLURAL-en rejects "refreshment" for refreshments, "weenie roasts" for roast, and accepts "tacks", "activities", "old-timers", "none" for tennis', () => {
    const refr = en('refreshments', 'refreshment', 'helping with refreshments for the game?')
    expect(ids(glossCardIssues(card({ gloss: ['Erfrischungen'], plural: 'refreshment', example: 'We had refreshments after the game.' }), refr))).toContain('F-PLURAL-en')
    const roast = en('roast', 'roast', 'Or a weenie roast.')
    expect(ids(glossCardIssues(card({ gloss: ['Grillfest'], plural: 'weenie roasts', example: 'We had a roast in the park.' }), roast))).toContain('F-PLURAL-en')
    expect(ids(glossCardIssues(card({ gloss: ['Tennisschläger'], plural: 'tennisschläger', example: 'We play tennis.' }), en('tennis', 'tennis', 'my tennis racket')))).toContain('F-PLURAL-en')
    expect(glossCardIssues(tacksCard(['Reißzwecken']), tacksCtx)).toEqual([])
    const act = en('activities', 'activity', 'A list of coming activities.')
    expect(glossCardIssues(card({ gloss: ['Aktivitäten'], plural: 'activities', example: 'The club has many activities.' }), act)).toEqual([])
    const old = en('old-timer', 'old-timer', 'Boy, that is an old-timer.')
    expect(glossCardIssues(card({ gloss: ['altes Ding'], plural: 'old-timers', example: 'This car is a real old-timer.' }), old)).toEqual([])
    expect(glossCardIssues(card({ gloss: ['Tennis (Sport)'], plural: 'none', example: 'We play tennis.' }), en('tennis', 'tennis', 'my tennis racket'))).toEqual([])
    expect(englishPlurals('child')).toContain('children')
    expect(englishPlurals('knife')).toContain('knives')
    expect(englishPlurals('sheep')).toContain('sheep')
    expect(englishPlurals('tack')).not.toContain('tack')
  })

  it('F-COMP-en rejects "besser" for swell and accepts "sweller", "more swell", "better" for good', () => {
    const ctx = en('swell', 'swell', "Well, Kay's a swell girl.")
    const c = (lemma: string, comparative: string) => glossCardIssues(card({ pos: 'adjective', gloss: ['toll'], comparative, example: `That was a ${lemma} party.` }), { ...ctx, word: lemma, lemma })
    expect(ids(c('swell', 'besser'))).toContain('F-COMP-en')
    expect(c('swell', 'sweller')).toEqual([])
    expect(c('swell', 'more swell')).toEqual([])
    expect(c('swell', 'none')).toEqual([])
    expect(c('good', 'better')).toEqual([])
    expect(englishComparatives('big')).toContain('bigger')
    expect(englishComparatives('happy')).toContain('happier')
  })

  it('F-VERB-en accepts supervised/supervised and went/gone and rejects "superviste"', () => {
    const v = (lemma: string, past: string, participle: string) => glossCardIssues(card({ pos: 'verb', gloss: ['x'], past, participle, example: `We ${lemma} every day.` }), en(lemma, lemma, `to ${lemma} it`))
    expect(v('supervise', 'supervised', 'supervised')).toEqual([])
    expect(v('go', 'went', 'gone')).toEqual([])
    expect(ids(v('supervise', 'superviste', 'supervised'))).toContain('F-VERB-en')
    expect(v('tidy', 'tidied up', 'tidied up')).toEqual([])
    expect(englishVerbForms('stop').past).toContain('stopped')
    expect(englishVerbForms('bring').participle).toContain('brought')
  })

  it('German form rules are soft issues', () => {
    const ctx: CardContext = { word: 'Regenschirm', lemma: 'Regenschirm', cue: 'Ich hole meinen Regenschirm.', lang: 'de', native: 'en' }
    const issues = glossCardIssues(card({ gloss: ['umbrella'], plural: 'Umbrellas', example: 'Hast du einen Regenschirm dabei?' }), ctx)
    expect(ids(issues).sort()).toEqual(['F-ART-de', 'F-PLURAL-de'])
    expect(issues.every(isSoftCardIssue)).toBe(true)
    expect(glossCardIssues(card({ gloss: ['umbrella'], article: 'der', plural: 'Regenschirme', example: 'Hast du einen Regenschirm dabei?' }), ctx)).toEqual([])
    const vctx: CardContext = { word: 'wartet', lemma: 'warten', cue: 'Er wartet hier.', lang: 'de', native: 'en' }
    const verb = (participle: string) => glossCardIssues(card({ pos: 'verb', gloss: ['to wait'], past: 'wartete', participle, example: 'Wir warten auf den Bus.' }), vctx)
    expect(verb('hat gewartet')).toEqual([])
    expect(ids(verb('waited'))).toEqual(['F-VERB-de'])
    const actx: CardContext = { word: 'gut', lemma: 'gut', cue: 'Das ist gut.', lang: 'de', native: 'en' }
    const adj = (comparative: string) => glossCardIssues(card({ pos: 'adjective', gloss: ['good'], comparative, example: 'Das Essen ist gut.' }), actx)
    expect(adj('besser')).toEqual([])
    expect(ids(adj('more good'))).toEqual(['F-COMP-de'])
  })

  it('pruneCard removes a comparative from a noun card before validation', () => {
    const c = card({ gloss: ['Reißzwecken'], plural: 'tacks', comparative: 'besser', example: 'I need some tacks for the board.' })
    expect(pruneCard(c, 'en').comparative).toBeUndefined()
    expect(glossCardIssues(c, tacksCtx)).toEqual([])
  })

  it('contentWords drops function words and parenthesised clarifiers', () => {
    expect(contentWords('jemand der Müll sammelt', 'de')).toEqual(['müll', 'sammelt'])
    expect(contentWords('Tennis (Sport)', 'de')).toEqual(['tennis'])
    expect(contentWords('to call', 'en')).toEqual(['call'])
  })
})
