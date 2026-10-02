import React from 'react'
import { AccessibilityInfo } from 'react-native'
import * as Speech from 'expo-speech'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import type { DueWord, ProgressStats, ReviewResult } from '@lingo/contracts'
import { TabBar } from '../src/components/TabBar'
import type { PhoneApi } from '../src/lib/api'
import { JoinScreen, type JoinScreenProps } from '../src/screens/JoinScreen'
import { LiveScreen, type LiveScreenProps } from '../src/screens/LiveScreen'
import { ProgressScreen } from '../src/screens/ProgressScreen'
import { QuizScreen, type QuizScreenProps } from '../src/screens/QuizScreen'
import { strings } from '../src/strings'
import { color, font, tap } from '../src/theme'
import { tokens } from '../../../packages/shared-ui/src/theme/tokens'
import { dueWord, fresh, saved, stats } from './fixtures'

type Style = Record<string, unknown>
const is = (n: ReactTestInstance, host: string) => (n.type as unknown) === host
const flat = (s: unknown): Style => (Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s && typeof s === 'object' ? (s as Style) : {})
const render = (el: React.ReactElement): ReactTestRenderer => {
  let r: ReactTestRenderer | undefined
  act(() => { r = create(el, { createNodeMock: () => ({}) }) })
  return r!
}
const textOf = (n: ReactTestInstance): string => [n.props.children].flat(Infinity).map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : c && typeof c === 'object' && 'props' in c ? textOf({ props: (c as { props: object }).props } as ReactTestInstance) : '')).join('')
const texts = (r: ReactTestRenderer) => r.root.findAll((n) => is(n, 'Text')).map(textOf)
const pressables = (r: ReactTestRenderer) => r.root.findAll((n) => is(n, 'Pressable'))
const byLabel = (r: ReactTestRenderer, label: string) => r.root.find((n) => (is(n, 'Pressable') || is(n, 'TextInput')) && n.props['aria-label'] === label)
const press = async (n: ReactTestInstance) => { await act(async () => { await n.props.onPress() }) }
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const focused = () => (globalThis as { __focused?: unknown }).__focused

const fakeApi = (o: Partial<PhoneApi> = {}): PhoneApi & { [K in keyof PhoneApi]: ReturnType<typeof vi.fn> } => ({
  me: vi.fn(async () => ({ learning: 'de' })), dueWords: vi.fn(async () => [] as DueWord[]),
  review: vi.fn(async (savedWordId: string) => ({ savedWordId, ease: 2.5, intervalD: 1, reps: 1, lapses: 0, due: '2026-10-02T08:00:00.000Z' })),
  stats: vi.fn(async () => stats()), ...o,
}) as never

const joinProps = (o: Partial<JoinScreenProps> = {}): JoinScreenProps => ({
  hint: null, joining: false, apiUrl: 'http://192.168.1.20:4000', onCode: vi.fn(), onScanned: vi.fn(), onReview: vi.fn(), onApiUrl: vi.fn(), onHint: vi.fn(), ...o,
})
const boxes = (r: ReactTestRenderer) => r.root.findAll((n) => is(n, 'TextInput') && /^Code character/.test(n.props['aria-label']))
const typeIn = (box: ReactTestInstance, t: string) => act(() => { box.props.onChangeText(t) })

describe('Join', () => {
  it('Join renders six code boxes labelled by position', () => {
    const r = render(<JoinScreen {...joinProps()} />)
    expect(boxes(r).map((b) => b.props['aria-label'])).toEqual([1, 2, 3, 4, 5, 6].map((i) => `Code character ${i} of 6`))
    for (const b of boxes(r)) expect(b.props).toMatchObject({ autoCapitalize: 'characters', autoCorrect: false, maxLength: 6 })
  })
  it('Join moves focus to the next box after a character and submits on the sixth', async () => {
    const onCode = vi.fn()
    const r = render(<JoinScreen {...joinProps({ onCode })} />)
    const join = () => byLabel(r, strings.join.join)
    expect(join().props['aria-disabled']).toBe(true)
    for (const [i, c] of 'ABC23'.split('').entries()) {
      await typeIn(boxes(r)[i]!, c)
      expect(focused()).toBe(strings.join.box(i + 1))
    }
    expect(boxes(r).map((b) => b.props.value)).toEqual(['A', 'B', 'C', '2', '3', ''])
    expect(onCode).not.toHaveBeenCalled()
    await typeIn(boxes(r)[5]!, '4')
    expect(onCode).toHaveBeenCalledWith('ABC234')
    expect(join().props['aria-disabled']).toBe(false)
    await act(() => { boxes(r)[5]!.props.onKeyPress({ nativeEvent: { key: 'Backspace' } }) })
    expect(boxes(r)[5]!.props.value).toBe('')
  })
  it('Join shows the hint as a polite alert in text colour, not marker', async () => {
    const onHint = vi.fn()
    const r = render(<JoinScreen {...joinProps({ hint: 'unknownCode', onHint })} />)
    const alert = r.root.find((n) => is(n, 'Text') && n.props.accessibilityRole === 'alert')
    expect(textOf(alert)).toBe(strings.hint.unknownCode)
    expect(alert.props.accessibilityLiveRegion).toBe('polite')
    expect(flat(alert.props.style).color).toBe(color.text)
    expect(flat(alert.props.style).color).not.toBe(color.marker)
    await typeIn(boxes(r)[0]!, 'O')
    expect(onHint).toHaveBeenCalledWith('invalidChar')
  })
  it('every Join control has an aria-label and is at least 56 high', async () => {
    const r = render(<JoinScreen {...joinProps()} />)
    await press(byLabel(r, `${strings.join.serverChange}: ${strings.join.serverLabel}`)) // open the server field too
    const controls = r.root.findAll((n) => is(n, 'Pressable') || is(n, 'TextInput'))
    expect(controls.length).toBeGreaterThanOrEqual(6 + 4)
    for (const c of controls) {
      expect(typeof c.props['aria-label']).toBe('string')
      expect(c.props['aria-label'].length).toBeGreaterThan(2)
      expect(flat(c.props.style).minHeight).toBeGreaterThanOrEqual(tap)
    }
    expect(r.root.findAll((n) => is(n, 'Pressable')).every((p) => p.props.accessibilityRole === 'button')).toBe(true)
  })
})

const liveProps = (o: Partial<LiveScreenProps> = {}): LiveScreenProps => ({
  link: 'joined', saved: [], open: null, learning: 'de', quizOffer: false, onToggle: vi.fn(), onQuiz: vi.fn(), onForget: vi.fn(), ...o,
})
const chips = (r: ReactTestRenderer) => pressables(r).filter((p) => flat(p.props.style).backgroundColor === color.marker)

describe('Live', () => {
  it('Live shows the latest clip title and one marker chip per saved word in arrival order', () => {
    const ws = [saved({ word: 'Zug', clipTitle: 'Erster' }), saved({ word: 'Bahnhof', clipTitle: 'Am Bahnhof' }), saved({ word: 'gleich', clipTitle: 'Am Bahnhof' })]
    const r = render(<LiveScreen {...liveProps({ saved: ws })} />)
    expect(texts(r)).toContain('Am Bahnhof')
    expect(texts(r)).toContain(strings.live.status.joined)
    expect(chips(r).map((c) => c.props['aria-label'])).toEqual(['Zug', 'Bahnhof', 'gleich'].map(strings.live.chipLabel))
  })
  it('tapping a chip shows gloss and example and speaks the word in the learning language', async () => {
    const w = saved({ word: 'Bahnhof', gloss: 'station', example: 'Am Bahnhof.' })
    const onToggle = vi.fn()
    const closed = render(<LiveScreen {...liveProps({ saved: [w], onToggle })} />)
    expect(texts(closed)).not.toContain('station')
    vi.mocked(Speech.speak).mockClear()
    await press(chips(closed)[0]!)
    expect(onToggle).toHaveBeenCalledWith(w.savedWordId)
    expect(Speech.speak).toHaveBeenCalledWith('Bahnhof', { language: 'de-DE', rate: 0.9 })
    const open = render(<LiveScreen {...liveProps({ saved: [w], open: w.savedWordId })} />)
    expect(texts(open)).toEqual(expect.arrayContaining(['station', 'Am Bahnhof.']))
    const example = open.root.find((n) => is(n, 'Text') && textOf(n) === 'Am Bahnhof.')
    expect(flat(example.props.style).fontStyle).toBe('italic')
    vi.mocked(Speech.speak).mockClear()
    await press(byLabel(open, strings.live.hearLabel('Bahnhof')))
    expect(Speech.speak).toHaveBeenCalledTimes(1)
    await press(chips(open)[0]!) // closing does not speak
    expect(Speech.speak).toHaveBeenCalledTimes(1)
  })
  it('Quiz me now is absent until a quiz is offered', () => {
    const before = render(<LiveScreen {...liveProps({ saved: [saved()] })} />)
    expect(pressables(before).some((p) => p.props['aria-label'] === strings.live.quizNow)).toBe(false)
    vi.mocked(AccessibilityInfo.announceForAccessibility).mockClear()
    const onQuiz = vi.fn()
    const after = render(<LiveScreen {...liveProps({ saved: [saved()], quizOffer: true, onQuiz })} />)
    const btn = byLabel(after, strings.live.quizNow)
    expect(flat(btn.props.style).backgroundColor).toBe(color.interactive)
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(strings.live.quizReady)
    btn.props.onPress()
    expect(onQuiz).toHaveBeenCalled()
  })
  it('Live shows the empty line when nothing is saved', () => {
    const r = render(<LiveScreen {...liveProps({ link: 'reconnecting' })} />)
    expect(texts(r)).toEqual(expect.arrayContaining([strings.live.empty, strings.live.noClip, strings.live.status.reconnecting]))
    expect(chips(r)).toHaveLength(0)
  })
})

const quizProps = (o: Partial<QuizScreenProps> = {}): QuizScreenProps => ({ api: fakeApi(), firstClip: null, learning: 'de', onResult: vi.fn(() => false), onProgress: vi.fn(), ...o })
const mount = async (el: React.ReactElement) => { const r = render(el); await flush(); return r }
const grades = (r: ReactTestRenderer) => pressables(r).filter((p) => /^(Again|Hard|Good|Easy): schedule/.test(p.props['aria-label']))
const card = (r: ReactTestRenderer) => r.root.find((n) => n.props.testID === 'card' && (is(n, 'Pressable') || is(n, 'View')))
const gradeAs = async (r: ReactTestRenderer, label: 'Again' | 'Hard' | 'Good' | 'Easy') => {
  await press(card(r)); await press(grades(r).find((g) => g.props['aria-label'].startsWith(label))!); await flush()
}

describe('Quiz', () => {
  it('Quiz shows "12 due · 3 new" for twelve reviewed and three new words', async () => {
    const words = [...Array.from({ length: 12 }, () => dueWord()), fresh(), fresh(), fresh()]
    const r = await mount(<QuizScreen {...quizProps({ api: fakeApi({ dueWords: vi.fn(async () => words) }) })} />)
    expect(texts(r)).toContain('12 due · 3 new')
    expect(texts(r)).toContain('1 of 15')
  })
  it('Quiz front shows only the word; tapping shows gloss, the cue with the word marked and the native line', async () => {
    const w = dueWord({ word: 'Bahnhof', gloss: 'station', cueText: 'Der Zug fährt vom Bahnhof, sofort.', cueNative: 'The train leaves the station.' })
    const r = await mount(<QuizScreen {...quizProps({ api: fakeApi({ dueWords: vi.fn(async () => [w]) }) })} />)
    expect(card(r).props['aria-label']).toBe(strings.quiz.frontLabel('Bahnhof'))
    const front = card(r).findAll((n) => is(n, 'Text')).map(textOf)
    expect(front).toEqual(['Bahnhof', strings.quiz.reveal])
    expect(texts(r)).not.toContain('station')
    expect(grades(r)).toHaveLength(0)
    await press(card(r))
    expect(card(r).props.accessible).toBeUndefined()
    expect(texts(r)).toEqual(expect.arrayContaining(['station', 'The train leaves the station.']))
    const mark = r.root.find((n) => n.props.testID === 'cue-mark')
    expect(textOf(mark)).toBe('Bahnhof')
    expect(flat(mark.props.style)).toMatchObject({ backgroundColor: color.marker, color: color.ground })
    expect(textOf(r.root.find((n) => is(n, 'Text') && n.props.testID === 'cue'))).toBe('Der Zug fährt vom Bahnhof, sofort.')
    const native = r.root.find((n) => is(n, 'Text') && textOf(n) === 'The train leaves the station.')
    expect(flat(native.props.style).color).toBe(color.nativeCue)
  })
  it('the four grade buttons appear only after reveal, in order Again Hard Good Easy, with equal flex and identical colours', async () => {
    const r = await mount(<QuizScreen {...quizProps({ api: fakeApi({ dueWords: vi.fn(async () => [dueWord({ word: 'Zug' })]) }) })} />)
    expect(grades(r)).toHaveLength(0)
    await press(card(r))
    const g = grades(r)
    expect(g.map((b) => b.props['aria-label'])).toEqual(['Again', 'Hard', 'Good', 'Easy'].map((x) => `${x}: schedule Zug`))
    expect(new Set(g.map((b) => flat(b.props.style).flex))).toEqual(new Set([1]))
    expect(new Set(g.map((b) => flat(b.props.style).backgroundColor)).size).toBe(1)
    expect(new Set(g.map((b) => flat(b.findByType('Text' as never).props.style).color)).size).toBe(1)
    for (const b of g) expect(flat(b.props.style).minHeight).toBeGreaterThanOrEqual(tap)
  })
  it('grading posts once, advances, and disables the buttons while posting', async () => {
    let release!: () => void
    const review = vi.fn(() => new Promise<ReviewResult>((res) => { release = () => res({ savedWordId: 'x', ease: 2.5, intervalD: 1, reps: 1, lapses: 0, due: '2026-10-02T08:00:00.000Z' }) }))
    const [a, b] = [dueWord({ word: 'Zug' }), dueWord({ word: 'Bahnhof' })]
    const r = await mount(<QuizScreen {...quizProps({ api: fakeApi({ dueWords: vi.fn(async () => [a, b]), review }) })} />)
    await press(card(r))
    act(() => { grades(r)[2]!.props.onPress() })
    expect(grades(r).every((g) => g.props['aria-disabled'] === true)).toBe(true)
    act(() => { grades(r)[2]!.props.onPress?.() }) // a second tap while posting does nothing
    expect(review).toHaveBeenCalledTimes(1)
    expect(review).toHaveBeenCalledWith(a.savedWordId, 'good', expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/))
    await act(async () => { release() })
    await flush()
    expect(card(r).props['aria-label']).toBe(strings.quiz.frontLabel('Bahnhof'))
    expect(texts(r)).toContain('2 of 2')
  })
  it('a failed post keeps the card and shows the retry line', async () => {
    const review = vi.fn(async () => { throw new Error('offline') })
    const r = await mount(<QuizScreen {...quizProps({ api: fakeApi({ dueWords: vi.fn(async () => [dueWord({ word: 'Zug', gloss: 'train' })]), review }) })} />)
    await press(card(r)); await press(grades(r)[2]!); await flush()
    expect(texts(r)).toContain(strings.quiz.retry)
    expect(texts(r)).toContain('train') // still the back of the same card
    expect(grades(r).every((g) => g.props['aria-disabled'] === false)).toBe(true)
  })
  it('again brings the word back at the end and the repeat does not post', async () => {
    const [a, b] = [dueWord({ word: 'Zug' }), dueWord({ word: 'Bahnhof' })]
    const api = fakeApi({ dueWords: vi.fn(async () => [a, b]) })
    const r = await mount(<QuizScreen {...quizProps({ api })} />)
    await gradeAs(r, 'Again')
    expect(card(r).props['aria-label']).toBe(strings.quiz.frontLabel('Bahnhof'))
    await gradeAs(r, 'Good')
    expect(card(r).props['aria-label']).toBe(strings.quiz.frontLabel('Zug'))
    await gradeAs(r, 'Good')
    expect(api.review.mock.calls.map((c) => c.slice(0, 2))).toEqual([[a.savedWordId, 'again'], [b.savedWordId, 'good']])
    expect(texts(r)).toContain(strings.quiz.doneTitle)
  })
  it('finishing calls onResult with first-pass correct and total and shows Sent to your TV when it returns true', async () => {
    const onResult = vi.fn(() => true)
    const r = await mount(<QuizScreen {...quizProps({ onResult, api: fakeApi({ dueWords: vi.fn(async () => [dueWord(), fresh(), dueWord()]) }) })} />)
    await gradeAs(r, 'Again'); await gradeAs(r, 'Good'); await gradeAs(r, 'Easy'); await gradeAs(r, 'Good')
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith(2, 3)
    expect(texts(r)).toEqual(expect.arrayContaining([strings.quiz.doneTitle, strings.quiz.doneBody(3), strings.quiz.sentToTv]))
  })
  it('finishing without a TV shows Done for today and no TV line', async () => {
    const onProgress = vi.fn()
    const r = await mount(<QuizScreen {...quizProps({ onResult: vi.fn(() => false), onProgress, api: fakeApi({ dueWords: vi.fn(async () => [dueWord()]) }) })} />)
    await gradeAs(r, 'Good')
    expect(texts(r)).toEqual(expect.arrayContaining([strings.quiz.doneTitle, '1 word reviewed. See you tomorrow.']))
    expect(texts(r)).not.toContain(strings.quiz.sentToTv)
    await press(byLabel(r, strings.quiz.seeProgress))
    expect(onProgress).toHaveBeenCalled()
  })
  it('an empty deck shows the empty copy', async () => {
    const onResult = vi.fn(() => true)
    const r = await mount(<QuizScreen {...quizProps({ onResult })} />)
    expect(texts(r)).toEqual([strings.quiz.emptyTitle, strings.quiz.emptyBody])
    expect(onResult).not.toHaveBeenCalled()
  })
})

describe('LING-006 review fixes', () => {
  it('M6: an open chip\'s label carries the gloss and the example', () => {
    const w = saved({ word: 'Bahnhof', gloss: 'station', example: 'Am Bahnhof.' })
    const closed = render(<LiveScreen {...liveProps({ saved: [w] })} />)
    expect(chips(closed)[0]!.props['aria-label']).toBe(strings.live.chipLabel('Bahnhof'))
    const open = render(<LiveScreen {...liveProps({ saved: [w], open: w.savedWordId })} />)
    const label = chips(open)[0]!.props['aria-label'] as string
    expect(label).toContain('station')
    expect(label).toContain('Am Bahnhof.')
  })
  it('M6: the quiz back card exposes the cue, the native line and Hear it as reachable elements', async () => {
    const w = dueWord({ word: 'Bahnhof', gloss: 'station', cueText: 'Der Zug fährt vom Bahnhof.', cueNative: 'The train leaves the station.' })
    const r = await mount(<QuizScreen {...quizProps({ api: fakeApi({ dueWords: vi.fn(async () => [w]) }) })} />)
    await press(card(r))
    // nothing above them groups the subtree into one element
    const grouped = r.root.findAll((n) => n.props.accessible === true && typeof n.type === 'string')
    for (const g of grouped) expect(g.findAll((n) => is(n, 'Pressable') || n.props.testID === 'cue')).toHaveLength(0)
    expect(r.root.findAll((n) => is(n, 'Text') && n.props.testID === 'cue')).toHaveLength(1)
    expect(texts(r)).toContain('The train leaves the station.')
    expect(byLabel(r, strings.live.hearLabel('Bahnhof'))).toBeTruthy()
  })
  it('M5: a retry of the same card resends the same reviewId', async () => {
    let fail = true
    const review = vi.fn(async (savedWordId: string) => { if (fail) throw new Error('offline'); return { savedWordId, ease: 2.5, intervalD: 1, reps: 1, lapses: 0, due: '2026-10-02T08:00:00.000Z' } })
    const [a, b] = [dueWord({ word: 'Zug' }), dueWord({ word: 'Bahnhof' })]
    const r = await mount(<QuizScreen {...quizProps({ api: fakeApi({ dueWords: vi.fn(async () => [a, b]), review }) })} />)
    await press(card(r)); await press(grades(r)[2]!); await flush()
    fail = false
    await press(grades(r)[0]!); await flush()
    await press(card(r)); await press(grades(r)[2]!); await flush()
    const ids = review.mock.calls.map((c) => (c as unknown as string[])[2])
    expect(ids[0]).toBe(ids[1])
    expect(ids[2]).not.toBe(ids[0])
  })
})

describe('Progress', () => {
  const progress = async (s: ProgressStats, onReview = vi.fn()) => mount(<ProgressScreen api={fakeApi({ stats: vi.fn(async () => s) })} onReview={onReview} />)
  it('Progress shows Day 6 in the display font and no fire', async () => {
    const r = await progress(stats({ streak: { day: 6, welcomeBack: false } }))
    const day = r.root.find((n) => is(n, 'Text') && textOf(n) === 'Day 6')
    expect(flat(day.props.style).fontFamily).toBe(font.display)
    const display = r.root.findAll((n) => is(n, 'Text') && flat(n.props.style).fontFamily === font.display)
    expect(display).toHaveLength(1)
    for (const t of texts(r)) expect(t).not.toMatch(/fire|\p{Extended_Pictographic}/iu)
    expect(r.root.findAll((n) => is(n, 'Image'))).toHaveLength(0)
  })
  it('Progress shows Welcome back after a missed day', async () => {
    const r = await progress(stats({ streak: { day: 0, welcomeBack: true } }))
    expect(texts(r)).toContain('Welcome back')
    expect(texts(r).some((t) => /^Day \d/.test(t))).toBe(false)
  })
  it('Progress renders four band bars with interactive fill on surface2 and the value as text', async () => {
    const r = await progress(stats())
    const tracks = r.root.findAll((n) => is(n, 'View') && n.props.testID === 'band-track')
    const fills = r.root.findAll((n) => is(n, 'View') && n.props.testID === 'band-fill')
    expect(tracks).toHaveLength(4)
    expect(tracks.every((t) => flat(t.props.style).backgroundColor === color.surface2)).toBe(true)
    expect(fills.every((f) => flat(f.props.style).backgroundColor === color.interactive)).toBe(true)
    expect(fills.map((f) => flat(f.props.style).width)).toEqual(['50%', '0%', '0%', '100%'])
    expect(texts(r)).toEqual(expect.arrayContaining(['2 of 4', '0 of 3', '0 of 0', '1 of 1', strings.progress.bandsTitle, '2 clips watched']))
    const rows = r.root.findAll((n) => is(n, 'View') && typeof n.props['aria-label'] === 'string' && n.props['aria-label'].startsWith('Level '))
    expect(rows.map((x) => x.props['aria-label'])[0]).toBe('Level A1, approximate: 2 of 4 saved words known')
  })
  it('Progress Review now calls onReview only when words are due', async () => {
    const onReview = vi.fn()
    const r = await progress(stats({ dueNow: 2, newNow: 1 }), onReview)
    expect(texts(r)).toContain('3 words to review now')
    await press(byLabel(r, strings.progress.reviewNow))
    expect(onReview).toHaveBeenCalledTimes(1)
    const none = await progress(stats({ dueNow: 0, newNow: 0, dueTomorrow: 4 }))
    expect(texts(none)).toContain('4 words to review tomorrow')
    expect(pressables(none).some((p) => p.props['aria-label'] === strings.progress.reviewNow)).toBe(false)
  })
})

describe('TabBar', () => {
  it('TabBar marks the current tab with aria-selected and weight, not colour alone', async () => {
    const onGo = vi.fn()
    const r = render(<TabBar screen="quiz" hasTv onGo={onGo} />)
    const tabs = pressables(r)
    expect(tabs.map((t) => t.props['aria-label'])).toEqual(['Live', 'Review', 'Progress'])
    expect(tabs.map((t) => t.props['aria-selected'])).toEqual([false, true, false])
    expect(tabs.every((t) => t.props.accessibilityRole === 'tab' && (flat(t.props.style).minHeight as number) >= tap && flat(t.props.style).flex === 1)).toBe(true)
    const label = (t: ReactTestInstance) => flat(t.findByType('Text' as never).props.style)
    expect(label(tabs[1]!).fontFamily).toBe(font.semibold)
    expect(label(tabs[0]!).fontFamily).toBe(font.regular)
    expect(flat(tabs[1]!.props.style)).toMatchObject({ borderTopWidth: 3, borderTopColor: color.interactive })
    await press(tabs[2]!)
    expect(onGo).toHaveBeenCalledWith('progress')
  })
})

describe('colours', () => {
  it('no screen uses a colour outside tokens.color', async () => {
    const allowed = new Set<unknown>(Object.values(tokens.color))
    const w = dueWord({ word: 'Zug', cueText: 'Der Zug.' })
    const trees: ReactTestRenderer[] = [
      render(<JoinScreen {...joinProps({ hint: 'unreachable', joining: true })} />),
      render(<LiveScreen {...liveProps({ saved: [saved(), saved()], open: null, quizOffer: true })} />),
      await mount(<QuizScreen {...quizProps({ api: fakeApi({ dueWords: vi.fn(async () => [w]) }) })} />),
      await mount(<ProgressScreen api={fakeApi()} onReview={vi.fn()} />),
      render(<TabBar screen="live" hasTv onGo={vi.fn()} />),
    ]
    const lr = render(<LiveScreen {...liveProps({ saved: [saved()], open: null })} />)
    await press(chips(lr)[0]!)
    trees.push(lr)
    await press(card(trees[2]!))
    const seen: unknown[] = []
    for (const t of trees) for (const n of t.root.findAll(() => true)) {
      const s = flat(n.props.style)
      for (const k of Object.keys(s)) if (/color$/i.test(k)) seen.push(s[k])
      for (const k of ['color', 'placeholderTextColor']) if (typeof n.props[k] === 'string') seen.push(n.props[k])
    }
    expect(seen.length).toBeGreaterThan(20)
    expect(seen.filter((c) => !allowed.has(c))).toEqual([])
  })
})
