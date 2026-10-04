import { appReducer, initialApp, type AppEvent, type AppState } from '../src/state/app'
import { saved } from './fixtures'

const run = (...es: AppEvent[]) => es.reduce(appReducer, initialApp)

describe('app state', () => {
  it('boot with a remembered TV opens Live and starts joining', () => {
    expect(run({ type: 'boot', tv: 'ABC234' })).toMatchObject({ screen: 'live', tv: 'ABC234', link: 'joining' })
  })
  it('boot without a TV opens Join', () => {
    expect(run({ type: 'boot', tv: null })).toMatchObject({ screen: 'join', tv: null, link: 'none' })
  })
  it('submit then joined remembers the pending code and opens Live', () => {
    const a = run({ type: 'boot', tv: null }, { type: 'hint', hint: 'badCode' }, { type: 'submit', code: 'XYZ789' })
    expect(a).toMatchObject({ pending: 'XYZ789', link: 'joining', hint: null, screen: 'join', tv: null })
    expect(appReducer(a, { type: 'joined' })).toMatchObject({ tv: 'XYZ789', pending: null, link: 'joined', screen: 'live' })
  })
  it('refused clears the TV and shows the unknown-code hint on Join', () => {
    expect(run({ type: 'boot', tv: 'ABC234' }, { type: 'refused' })).toMatchObject({ tv: null, pending: null, link: 'none', screen: 'join', hint: 'unknownCode' })
  })
  it('a dropped transport while joined shows reconnecting; coming back rejoins', () => {
    const j = run({ type: 'boot', tv: 'ABC234' }, { type: 'joined' })
    const down = appReducer(j, { type: 'transport', up: false })
    expect(down.link).toBe('reconnecting')
    const up = appReducer(down, { type: 'transport', up: true })
    expect(up.link).toBe('joining')
    expect(appReducer(up, { type: 'joined' }).link).toBe('joined')
    expect(appReducer(run({ type: 'boot', tv: null }), { type: 'transport', up: false }).link).toBe('none')
  })
  it('wordSaved appends in order and ignores duplicates', () => {
    const a = saved(), b = saved()
    const s = run({ type: 'wordSaved', w: a }, { type: 'wordSaved', w: b }, { type: 'wordSaved', w: { ...a } })
    expect(s.saved).toEqual([a, b])
  })
  it('quizStart offers the quiz without leaving the current screen', () => {
    const s = run({ type: 'boot', tv: 'ABC234' }, { type: 'quizStart', clipSlug: 'am-bahnhof' })
    expect(s).toMatchObject({ screen: 'live', quizOffer: { clipSlug: 'am-bahnhof' } })
  })
  it('go quiz takes the offered clip for the deck and clears the offer', () => {
    const s = run({ type: 'boot', tv: 'ABC234' }, { type: 'quizStart', clipSlug: 'am-bahnhof' }, { type: 'go', screen: 'quiz' })
    expect(s).toMatchObject({ screen: 'quiz', deckClip: 'am-bahnhof', quizOffer: null })
    expect(appReducer(s, { type: 'go', screen: 'quiz' }).deckClip).toBeNull() // from the tab, no offer → no clip first
  })
  it('go live without a TV lands on Join', () => {
    expect(run({ type: 'boot', tv: null }, { type: 'go', screen: 'quiz' }, { type: 'go', screen: 'live' }).screen).toBe('join')
  })
  it('forgetTv clears the TV, the saved words and the offer', () => {
    const s: AppState = run({ type: 'boot', tv: 'ABC234' }, { type: 'joined' }, { type: 'wordSaved', w: saved() }, { type: 'toggleWord', id: 'x' }, { type: 'quizStart', clipSlug: null }, { type: 'forgetTv' })
    expect(s).toMatchObject({ tv: null, pending: null, link: 'none', saved: [], open: null, quizOffer: null, screen: 'join' })
  })
})
