import React from 'react'
import { AccessibilityInfo } from 'react-native'
import { Button, Card, Rail, SkeletonBlock, SkeletonCard, SkeletonRow, StateMessage } from '../src/components'
import { shouldStop } from '../src/components/MiniPlayer'
import { strings } from '../src/strings'
import { tokens } from '../src/theme/tokens'
import { blur, box, flat, focus, is, labels, preferred, pressables, render, texts } from './helpers'

const railItems = [
  { key: 'home' as const, label: strings.rail.watchLabel, text: strings.rail.watch },
  { key: 'review' as const, label: strings.rail.reviewLabel, text: strings.rail.review },
  { key: 'words' as const, label: strings.rail.wordsLabel, text: strings.rail.words },
  { key: 'plus' as const, label: strings.rail.plusLabel, text: strings.rail.plus },
  { key: 'settings' as const, label: strings.rail.settingsLabel, text: strings.rail.settings },
]

describe('components', () => {
  it('Card puts the level chip on surface2 with text colour, never the marker', () => {
    const r = render(<Card title="Der Zug" level="A2" durationS={150} label="Open Der Zug" onPress={() => {}} />)
    const chip = r.root.find((n) => is(n, 'View') && n.props.testID === 'level-chip')
    expect(flat(chip.props.style).backgroundColor).toBe(tokens.color.surface2)
    expect(flat(chip.findByType('Text' as never).props.style).color).toBe(tokens.color.text)
    expect(texts(chip)).toEqual(['A2'])
    const all = r.root.findAll((n) => is(n, 'View')).map((v) => flat(v.props.style).backgroundColor)
    expect(all).not.toContain(tokens.color.marker)
    expect(all).not.toContain(tokens.color.badge)
  })
  it('Card shows duration bottom-right and a resume bar only with progress', () => {
    const r = render(<Card title="T" level="B1" durationS={150} label="Open T" onPress={() => {}} />)
    const dur = r.root.find((n) => is(n, 'View') && n.props.testID === 'duration')
    expect(flat(dur.props.style)).toMatchObject({ position: 'absolute', right: 12, bottom: 12, backgroundColor: tokens.color.cueBox })
    expect(texts(dur)).toEqual(['3 min'])
    expect(r.root.findAll((n) => is(n, 'View') && n.props.testID === 'resume-bar')).toHaveLength(0)
    const p = render(<Card title="T" level="B1" durationS={150} progress={0.5} label="Open T" onPress={() => {}} />)
    const bar = p.root.find((n) => is(n, 'View') && n.props.testID === 'resume-bar')
    expect(flat(bar.props.style)).toMatchObject({ width: '50%', backgroundColor: tokens.color.interactive })
  })
  it('StateMessage gives the first action preferred focus and announces on mount when asked', () => {
    const spy = vi.mocked(AccessibilityInfo.announceForAccessibility); spy.mockClear()
    const r = render(<StateMessage title={strings.offline} body="b" announceOnMount actions={[{ label: strings.common.retry, text: strings.common.retry, onPress: () => {} }, { label: strings.common.back, text: strings.common.back, onPress: () => {} }]} />)
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([strings.common.retry])
    expect(spy).toHaveBeenCalledWith(`${strings.offline} b`)
    const title = r.root.find((n) => is(n, 'Text') && n.props.accessibilityLiveRegion === 'polite')
    expect(texts(title)).toEqual([strings.offline])
    spy.mockClear()
    render(<StateMessage title="x" actions={[]} />)
    expect(spy).not.toHaveBeenCalled()
  })
  it('Skeleton pieces are hidden from accessibility and not focusable', () => {
    for (const el of [<SkeletonBlock w={100} h={20} />, <SkeletonCard />, <SkeletonRow count={3} />]) {
      const r = render(el)
      expect(pressables(r)).toHaveLength(0)
      const top = r.root.findAll((n) => is(n, 'View'))[0]!
      expect(top.props.accessibilityElementsHidden).toBe(true)
      expect(top.props.importantForAccessibility).toBe('no-hide-descendants')
    }
    const card = render(<SkeletonCard />).root.findAll((n) => is(n, 'View')).map((v) => flat(v.props.style))
    expect(card.some((s) => s.width === tokens.layout.cardW && s.height === tokens.layout.cardH && s.backgroundColor === tokens.color.surface2)).toBe(true)
    expect(render(<SkeletonRow />).root.findAll((n) => is(n, 'View') && flat(n.props.style).height === tokens.layout.cardH)).toHaveLength(4)
  })
  it('Rail labels every item with its purpose and marks the current one with a ring and a bar', () => {
    const onSelect = vi.fn()
    const r = render(<Rail items={railItems} current="home" onSelect={onSelect} />)
    expect(labels(r)).toEqual(railItems.map((i) => strings.rail.label(i.label)))
    const items = pressables(r)
    expect(items[0]!.props['aria-selected']).toBe(true)
    expect(box(items[0]!)).toMatchObject({ borderColor: tokens.color.interactive, borderWidth: 3 })
    expect(r.root.findAll((n) => is(n, 'View') && n.props.testID === 'rail-current-bar')).toHaveLength(1)
    expect(flat(r.root.find((n) => n.props.testID === 'rail-current-bar').props.style)).toMatchObject({ width: 4, backgroundColor: tokens.color.interactive })
    // collapsed: first letter; focused: full labels in a 336 px overlay, the slot stays 96 px
    expect(texts(r)).toEqual(['W', 'R', 'W', 'P', 'S'])
    focus(items[1]!)
    expect(texts(r)).toEqual(railItems.map((i) => i.text))
    const overlay = r.root.find((n) => n.props.testID === 'rail-panel')
    expect(flat(overlay.props.style)).toMatchObject({ position: 'absolute', width: tokens.layout.railExpanded, backgroundColor: tokens.color.surface1 })
    expect(flat(r.root.find((n) => n.props.testID === 'rail').props.style).width).toBe(tokens.layout.rail)
    blur(items[1]!)
    expect(texts(r)).toEqual(['W', 'R', 'W', 'P', 'S'])
  })
  it('Button primary uses the interactive fill with ground text', () => {
    const r = render(<Button label="Watch Der Zug" text="Watch" primary onPress={() => {}} />)
    const p = pressables(r)[0]!
    expect(box(p).backgroundColor).toBe(tokens.color.interactive)
    expect(flat(p.findByType('Text' as never).props.style).color).toBe(tokens.color.ground)
    const s = render(<Button label="Back" text="Back" onPress={() => {}} />)
    expect(box(pressables(s)[0]!).backgroundColor).toBe(tokens.color.surface2)
    const d = render(<Button label="In Continue" text="In Continue" disabled onPress={() => {}} />)
    expect(pressables(d)[0]!.props['aria-disabled']).toBe(true)
    expect(pressables(d)[0]!.props.onPress).toBeUndefined()
  })
  it('focused primary Button: focus fill with ground text and an offset outline, no colour-only change; blur restores', () => {
    const r = render(<Button label="Watch Der Zug" text="Watch" primary onPress={() => {}} />)
    const p = pressables(r)[0]!
    const fg = () => flat(p.findByType('Text' as never).props.style).color
    const ring = () => p.findAll((n) => is(n, 'View') && n.props.testID === 'focus-ring')
    focus(p)
    expect(box(p).backgroundColor).toBe(tokens.button.primary.focused.fill)
    expect(fg()).toBe(tokens.button.primary.focused.text)
    expect(ring()).toHaveLength(1)
    expect(flat(ring()[0]!.props.style)).toMatchObject({ borderColor: tokens.color.focus, borderWidth: tokens.focus.width, top: -(tokens.focus.offset + tokens.focus.width) })
    expect(box(p).transform).toBeDefined() // the 1.04 scale (Animated value) is still applied
    blur(p)
    expect(box(p).backgroundColor).toBe(tokens.button.primary.rest.fill)
    expect(fg()).toBe(tokens.button.primary.rest.text)
    expect(ring()).toHaveLength(0)
  })
  it('focused secondary Button keeps its fill and text and draws the focus border', () => {
    const r = render(<Button label="Back" text="Back" onPress={() => {}} />)
    const p = pressables(r)[0]!
    focus(p)
    expect(box(p)).toMatchObject({ backgroundColor: tokens.button.secondary.focused.fill, borderColor: tokens.color.focus, borderWidth: tokens.focus.width })
    expect(flat(p.findByType('Text' as never).props.style).color).toBe(tokens.button.secondary.focused.text)
  })
  it('shouldStop is true from 50 ms before the cue end', () => {
    expect(shouldStop(9.9, 10)).toBe(false)
    expect(shouldStop(9.95, 10)).toBe(true)
    expect(shouldStop(10.2, 10)).toBe(true)
  })
})
