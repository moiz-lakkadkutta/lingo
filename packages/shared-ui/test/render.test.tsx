import React from 'react'
import { Animated, type View } from 'react-native'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import type { HighlightDto } from '@lingo/contracts'
import { DualCue, type DualCueProps } from '../src/components/DualCue'
import { Explain, type ExplainProps } from '../src/screens/Explain'
import { alignHighlights } from '../src/screens/player/align'
import { strings } from '../src/strings'
import { tokens } from '../src/theme/tokens'
import { cue, hl } from './fixtures'

type Style = Record<string, unknown>
const is = (n: ReactTestInstance, host: string) => (n.type as unknown) === host
const flat = (s: unknown): Style => (Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s && typeof s === 'object' ? (s as Style) : {})
const render = (el: React.ReactElement): ReactTestRenderer => {
  let r: ReactTestRenderer | undefined
  act(() => { r = create(el, { createNodeMock: () => ({}) }) })
  return r!
}
const textOf = (n: ReactTestInstance): string => [n.props.children].flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join('')
const texts = (r: ReactTestRenderer) => r.root.findAll((n) => is(n, 'Text')).map(textOf)
const pressables = (r: ReactTestRenderer) => r.root.findAll((n) => is(n, 'Pressable'))
const byLabel = (r: ReactTestRenderer, label: string) => r.root.find((n) => is(n, 'Pressable') && n.props['aria-label'] === label)
const press = async (n: ReactTestInstance) => { await act(async () => { await n.props.onPress() }) }

const twoWords = cue(0, 1, 3, 'Ich habe zwei\nStunden gewartet.', [hl('h1', 'Stunden'), hl('h2', 'habe')])

describe('DualCue', () => {
  const props = (over: Partial<DualCueProps> = {}): DualCueProps => ({
    cue: twoWords, alignment: alignHighlights(twoWords.text, twoWords.highlights), nativeVisible: true, wordFocus: 'cue',
    focusedIdx: null, onFocusWord: vi.fn(), savedIds: new Set(['h2']), userScale: 1, hold: null, ...over,
  })

  it('renders one chip per word, labels highlighted words, and makes them focusable only in cue mode', () => {
    const chipRefs = { current: [] as Array<View | null> }
    const r = render(<DualCue {...props({ chipRefs })} />)
    const chips = pressables(r)
    expect(chips).toHaveLength(5)
    const focusable = chips.filter((c) => c.props.focusable)
    expect(focusable.map((c) => c.props['aria-label'])).toEqual([strings.explain.wordSavedLabel('habe'), strings.explain.wordLabel('Stunden')])
    expect(focusable.every((c) => c.props.pointerEvents === 'auto' && c.props.accessibilityRole === 'button')).toBe(true)
    const plain = chips.filter((c) => !c.props.focusable)
    expect(plain.every((c) => c.props.pointerEvents === 'none' && c.props['aria-label'] === undefined)).toBe(true)
    // marker only on the words to learn
    expect(chips.filter((c) => flat(c.props.style).backgroundColor === tokens.color.marker)).toHaveLength(2)
    // check slot reserved on both highlighted chips; visible only on the saved one
    const checks = r.root.findAll((n) => is(n, 'View') && n.props.testID === 'check')
    expect(checks.map((c) => flat(c.props.style).opacity)).toEqual([1, 0])
    expect(chipRefs.current[0]).toBeTruthy()
    expect(chipRefs.current[1]).toBeTruthy()

    const card = render(<DualCue {...props({ wordFocus: 'card' })} />)
    expect(pressables(card).some((c) => c.props.focusable)).toBe(false)
  })

  it('marks only the word core: punctuation renders plain beside the chip (QA #10)', () => {
    const c = cue(0, 1, 3, 'Wir wollen lernen.\n-„Genau“, sagt er', [hl('h1', 'lernen'), hl('h2', 'Genau')])
    const r = render(<DualCue {...props({ cue: c, alignment: alignHighlights(c.text, c.highlights), savedIds: new Set() })} />)
    const marked = pressables(r).filter((p) => flat(p.props.style).backgroundColor === tokens.color.marker)
    expect(marked.map((p) => textOf(p.findByType('Text' as never)))).toEqual(['lernen', 'Genau'])
    const all = texts(r)
    expect(all).toEqual(expect.arrayContaining(['.', '-„', '“,', 'Wir', 'wollen', 'sagt', 'er']))
    expect(all).not.toContain('lernen.')
  })

  it('punctuation beside a chip sits against the word: a negative margin equal to the marker padding (review L7)', () => {
    const c = cue(0, 1, 3, 'Wir wollen lernen.\n-„Genau“, sagt er', [hl('h1', 'lernen'), hl('h2', 'Genau')])
    for (const userScale of [1, 1.5]) {
      const r = render(<DualCue {...props({ cue: c, alignment: alignHighlights(c.text, c.highlights), savedIds: new Set(), userScale })} />)
      const pad = flat(pressables(r).find((p) => flat(p.props.style).backgroundColor === tokens.color.marker)!.props.style).paddingHorizontal as number
      expect(pad).toBeGreaterThan(0)
      const punct = (t: string) => flat(r.root.find((n) => is(n, 'Text') && textOf(n) === t).props.style)
      expect(punct('.')).toMatchObject({ marginLeft: -pad })
      expect(punct('“,')).toMatchObject({ marginLeft: -pad })
      expect(punct('-„')).toMatchObject({ marginRight: -pad })
    }
  })

  it('sizes target 44 and native 32 by userScale, follows nativeVisible, and shows the hold bar only while holding', () => {
    const words = (r: ReactTestRenderer) => pressables(r).map((p) => flat(p.findByType('Text' as never).props.style))
    const nativeText = (r: ReactTestRenderer) => r.root.findAll((n) => is(n, 'Text') && textOf(n) === twoWords.native)
    const r1 = render(<DualCue {...props()} />)
    expect(words(r1).every((s) => s.fontSize === 44)).toBe(true)
    expect(words(r1)[0]!.color).toBe(tokens.color.text)
    expect(flat(nativeText(r1)[0]!.props.style)).toMatchObject({ fontSize: 32, color: tokens.color.nativeCue })
    const r15 = render(<DualCue {...props({ userScale: 1.5 })} />)
    expect(words(r15).every((s) => s.fontSize === 66)).toBe(true)
    expect(flat(nativeText(r15)[0]!.props.style).fontSize).toBe(48)
    expect(nativeText(render(<DualCue {...props({ nativeVisible: false })} />))).toHaveLength(0)

    const holdBar = (r: ReactTestRenderer) => r.root.findAll((n) => is(n, 'View') && n.props.accessibilityLabel === strings.player.hold)
    expect(holdBar(r1)).toHaveLength(0)
    expect(holdBar(render(<DualCue {...props({ hold: new Animated.Value(0) })} />))).toHaveLength(1)
    expect(render(<DualCue {...props({ cue: null, alignment: null })} />).root.findAll((n) => is(n, 'Pressable'))).toHaveLength(0)
  })
})

describe('Explain', () => {
  const noAi: HighlightDto = { ...hl('h1', 'Stunden'), gloss: '', grammar: '', example: '' }
  const one = cue(0, 1, 3, 'Ich habe zwei\nStunden gewartet.', [noAi])
  const props = (over: Partial<ExplainProps> = {}): ExplainProps => ({
    cue: one, highlight: noAi, alignmentOk: true, wordFocus: 'cue', focusedIdx: 0, onFocusWord: vi.fn(),
    savedIds: new Set(), savedCount: 2, plus: false, caps: { rate: true, wordFocusIn: 'cue' }, rate: 1,
    onSave: vi.fn(async () => 'saved' as const), onReplay: vi.fn(), onSlower: vi.fn(), onPlus: vi.fn(),
    chipRefs: { current: [] }, saveRef: { current: null }, bottom: 300, ...over,
  })
  const actions = (r: ReactTestRenderer) => pressables(r).filter((p) => p.props.focusable === undefined) // Focusables; chips set focusable

  it('renders cleanly without AI fields, and shows the native line when the cue has no highlight', () => {
    const r = render(<Explain {...props()} />)
    const t = texts(r)
    expect(t).toContain('Stunden')
    expect(t).toContain('“Ich habe zwei Stunden gewartet.”')
    expect(t).toContain(strings.explain.rankChip(100, 'A2'))
    expect(t).not.toContain('')
    expect(t).toContain(strings.explain.continueHint)

    const bare = cue(1, 4, 6, 'Na gut.', [])
    const r2 = render(<Explain {...props({ cue: bare, highlight: null })} />)
    expect(texts(r2)).toContain(bare.native)
    expect(actions(r2).map((a) => a.props['aria-label'])).toEqual([strings.explain.replay, strings.explain.slowerPlus])
  })

  it('Save: saved shows the count and Saved without the marker; limit keeps the same button and calls onPlus; error keeps Save', async () => {
    const saveRef = { current: null as View | null }
    const r = render(<Explain {...props({ saveRef })} />)
    await press(byLabel(r, strings.explain.saveLabel('Stunden')))
    expect(texts(r)).toContain(strings.explain.saved(3))
    const saved = byLabel(r, strings.explain.savedLabel('Stunden'))
    expect(textOf(saved.findByType('Text' as never))).toBe(strings.explain.savedState)
    const fill = flat(saved.findByType('Animated.View' as never).props.style).backgroundColor
    expect(fill).toBe(tokens.color.interactive)
    expect(fill).not.toBe(tokens.color.marker)

    const onPlus = vi.fn()
    const onSave = vi.fn(async () => 'limit' as const)
    const ref2 = { current: null as View | null }
    const lim = render(<Explain {...props({ onSave, onPlus, saveRef: ref2 })} />)
    const before = ref2.current
    expect(before).toBeTruthy()
    await press(byLabel(lim, strings.explain.saveLabel('Stunden')))
    expect(ref2.current).toBe(before) // same Pressable instance: focus stays put
    expect(texts(lim)).toContain(strings.explain.limit)
    await press(byLabel(lim, strings.explain.plusCta))
    expect(onPlus).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(1)

    const err = render(<Explain {...props({ onSave: vi.fn(async () => 'error' as const) })} />)
    await press(byLabel(err, strings.explain.saveLabel('Stunden')))
    expect(texts(err)).toContain(strings.explain.saveError)
    expect(byLabel(err, strings.explain.saveLabel('Stunden'))).toBeTruthy()
  })

  it('sizes the card to its content: no minimum height and no pushed-down action row (QA #8)', () => {
    const r = render(<Explain {...props()} />)
    const cardOf = (x: ReactTestRenderer) => x.root.find((n) => is(n, 'View') && flat(n.props.style).backgroundColor === tokens.color.surface1)
    const wrapOf = (x: ReactTestRenderer) => x.root.find((n) => is(n, 'View') && n.props.accessibilityViewIsModal)
    const style = flat(cardOf(r).props.style)
    expect(style.minHeight).toBeUndefined()
    expect(style.height).toBeUndefined()
    expect(style.padding).toBe(tokens.layout.explainPad)
    expect(style.gap).toBe(tokens.layout.explainGap)
    // The action row follows the text after one extra gap instead of being pushed to the bottom of a fixed-height card.
    const rows = cardOf(r).findAll((n) => is(n, 'View') && flat(n.props.style).flexDirection === 'row' && n.findAll((m) => is(m, 'Pressable') && m.props['aria-label'] === strings.explain.replay).length > 0)
    const actionRow = rows[rows.length - 1]!
    expect(flat(actionRow.props.style).marginTop).toBe(tokens.layout.explainGap)
    expect(rows.every((n) => flat(n.props.style).marginTop !== 'auto')).toBe(true)
    expect(flat(wrapOf(r).props.style).opacity).toBe(1)

    // The card reports its height (the Player stacks the progress strip above it) and is not drawn until the cue block is measured.
    const onCardLayout = vi.fn()
    const m = render(<Explain {...props({ onCardLayout, ready: false })} />)
    act(() => { cardOf(m).props.onLayout({ nativeEvent: { layout: { height: 312 } } }) })
    expect(onCardLayout).toHaveBeenCalledWith(312)
    expect(flat(wrapOf(m).props.style).opacity).toBe(0)
  })

  it('a long gloss cannot push the card off the top: gloss 2 lines, grammar 3, text shrinks under maxHeight, title and actions stay (review M2, L6)', () => {
    const long = 'sehr lang '.repeat(40)
    const h: HighlightDto = { ...hl('h1', 'Stunden'), gloss: long, grammar: long }
    const c = cue(0, 1, 3, 'Ich habe zwei\nStunden gewartet.', [h])
    const r = render(<Explain {...props({ cue: c, highlight: h, maxHeight: 640 })} />)
    const textNode = (t: string) => r.root.find((n) => is(n, 'Text') && textOf(n) === t)
    const glossAndGrammar = r.root.findAll((n) => is(n, 'Text') && textOf(n) === long)
    expect(glossAndGrammar.map((n) => n.props.numberOfLines)).toEqual([2, 3]) // gloss, grammar
    const cardV = r.root.find((n) => is(n, 'View') && flat(n.props.style).backgroundColor === tokens.color.surface1)
    expect(flat(cardV.props.style)).toMatchObject({ maxHeight: 640, overflow: 'hidden', borderRadius: tokens.radius.lg })
    // Only the text block gives way under the cap; the word title row and the action row keep their height.
    const textBlock = cardV.find((n) => is(n, 'View') && n.props.testID === 'explain-text')
    expect(flat(textBlock.props.style)).toMatchObject({ flexShrink: 1, overflow: 'hidden' })
    expect(textBlock.findAll((n) => is(n, 'Text') && textOf(n) === 'Stunden')).toHaveLength(0)
    expect(textBlock.findAll((n) => is(n, 'Pressable'))).toHaveLength(0)
    expect(textOf(textNode('Stunden'))).toBe('Stunden')
    expect(byLabel(r, strings.explain.saveLabel('Stunden'))).toBeTruthy()
    expect(byLabel(r, strings.explain.replay)).toBeTruthy()
    // No cap given: none applied.
    expect(flat(render(<Explain {...props()} />).root.find((n) => is(n, 'View') && flat(n.props.style).backgroundColor === tokens.color.surface1).props.style).maxHeight).toBeUndefined()
  })

  it('has at most three actions, no Slower without caps.rate, and a one-line Plus upsell on the free tier', async () => {
    const r = render(<Explain {...props()} />)
    expect(actions(r).map((a) => a.props['aria-label'])).toEqual([strings.explain.saveLabel('Stunden'), strings.explain.replay, strings.explain.slowerPlus])
    const onSlower = vi.fn()
    const free = render(<Explain {...props({ onSlower })} />)
    await press(byLabel(free, strings.explain.slowerPlus))
    expect(onSlower).not.toHaveBeenCalled()
    expect(texts(free)).toContain(strings.explain.slowerUpsell)

    const plus = render(<Explain {...props({ plus: true, onSlower })} />)
    await press(byLabel(plus, strings.explain.slower))
    expect(onSlower).toHaveBeenCalledTimes(1)
    expect(actions(render(<Explain {...props({ plus: true, rate: 0.75 })} />))[2]!.props['aria-label']).toBe(strings.explain.normalSpeed)

    const vega = render(<Explain {...props({ caps: { rate: false, wordFocusIn: 'cue' } })} />)
    expect(actions(vega)).toHaveLength(2)
    expect(texts(vega).some((t) => t === strings.explain.slower || t === strings.explain.slowerPlus)).toBe(false)

    const two = cue(0, 1, 3, 'Ich habe zwei\nStunden gewartet.', [hl('h1', 'Stunden'), hl('h2', 'habe')])
    const card = render(<Explain {...props({ cue: two, highlight: two.highlights[0]!, wordFocus: 'card' })} />)
    expect(pressables(card).filter((p) => p.props.focusable)).toHaveLength(2) // card-mode word row
    expect(actions(card).length).toBeLessThanOrEqual(3)
  })
})
