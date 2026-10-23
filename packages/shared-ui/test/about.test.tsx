import React from 'react'
import { About, revealOffset } from '../src/screens/About'
import { strings } from '../src/strings'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { focusBleed } from '../src/theme/bleed'
import { tokens } from '../src/theme/tokens'
import { blur, box, byLabel, flat, focus, is, labels, preferred, render, texts } from './helpers'

describe('About & attributions (device test 2026-10-23)', () => {
  it('shows a loading line under Clips while the credits load, never an empty page', () => {
    const r = render(<About credits={null} onBack={vi.fn()} />)
    expect(texts(r)).toEqual(expect.arrayContaining([strings.about.clips, strings.about.clipsLoading]))
    expect(labels(r)).toEqual([strings.about.backLabel])
  })
  it('says the credits cannot load when they failed and nothing is cached', () => {
    const r = render(<About credits={null} failed onBack={vi.fn()} />)
    expect(texts(r)).toContain(strings.about.clipsOffline)
  })
  it('lists every credit and skips clips without an attribution', () => {
    const r = render(<About credits={[{ slug: 'a', title: 'A', attribution: 'By a' }, { slug: 'b', title: 'B', attribution: '' }]} onBack={vi.fn()} />)
    const t = texts(r)
    expect(t).toEqual(expect.arrayContaining(['A', 'By a']))
    expect(t).not.toContain('B')
    expect(labels(r)).toEqual([strings.about.creditLabel('A', 'By a'), strings.about.backLabel])
    expect(t).not.toContain(strings.about.clipsLoading)
  })

  // Device test 2026-10-23: only Back was focusable, so a remote reached ~7 of the 12 credits; a touch swipe showed the rest.
  const twelve = Array.from({ length: 12 }, (_, i) => ({ slug: `c${i}`, title: `Clip ${i}`, attribution: `By person ${i}, CC BY 4.0` }))
  it('makes every credit a focusable row with a purpose label, Back stays the first focus', () => {
    const r = render(<About credits={twelve} onBack={vi.fn()} />)
    const credits = twelve.map((c) => strings.about.creditLabel(c.title, c.attribution))
    expect(labels(r)).toEqual([...credits, strings.about.backLabel])
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([strings.about.backLabel])
    for (const l of credits) {
      const row = byLabel(r, l)
      focus(row)
      const b = box(row)
      expect(b.borderColor).toBe(tokens.color.focus) // focus is the outline + scale, not colour alone
      blur(row)
    }
  })
  it('scrolls the focused credit fully into view, outline included, at both ends of the list', () => {
    const sv = { scrollTo: vi.fn(), scrollToEnd: vi.fn() }
    let r: ReactTestRenderer | undefined
    act(() => { r = create(<About credits={twelve} onBack={vi.fn()} />, { createNodeMock: (e) => ((e.type as unknown) === 'ScrollView' ? sv : {}) }) })
    const scroll = r!.root.find((n) => n.props.testID === 'about-scroll' && is(n, 'ScrollView'))
    const pad = flat(scroll.props.contentContainerStyle).paddingVertical as number
    expect(pad).toBeGreaterThanOrEqual(focusBleed(tokens.layout.rowH)) // room above the first and below the last row's focus
    expect(-(flat(scroll.props.style).marginLeft as number)).toBeGreaterThanOrEqual(focusBleed(tokens.layout.rowW))
    const row = (i: number) => byLabel(r!, strings.about.creditLabel(`Clip ${i}`, `By person ${i}, CC BY 4.0`))
    // before any layout: the first credit shows the page from the top, the last one scrolls to the end
    focus(row(0)); expect(sv.scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: true })
    focus(row(11)); expect(sv.scrollToEnd).toHaveBeenCalledTimes(1)
    // with layout: a 400 px view, the list at y 300, rows 100 apart and 88 tall
    const layout = (n: ReactTestInstance, y: number, height: number) => act(() => n.props.onLayout({ nativeEvent: { layout: { x: 0, y, width: 1000, height } } }))
    layout(scroll, 0, 400)
    const list = scroll.findAll((n) => is(n, 'View') && typeof n.props.onLayout === 'function')
    layout(list[0]!, 300, 1200)
    twelve.forEach((_, i) => layout(list[i + 1]!, 60 + i * 100, 88))
    sv.scrollTo.mockClear()
    focus(row(11)) // row 11 spans 1460..1548: it ends at the view's bottom edge plus the focus pad
    expect(sv.scrollTo).toHaveBeenLastCalledWith({ y: 1548 + pad - 400, animated: true })
    act(() => scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 1548 + pad - 400 } } }))
    focus(row(0)) // row 0 spans 360..448, now above the view: it starts at the top edge minus the pad
    expect(sv.scrollTo).toHaveBeenLastCalledWith({ y: 360 - pad, animated: true })
    sv.scrollTo.mockClear()
    focus(row(1)) // already in full view: no jump
    expect(sv.scrollTo).not.toHaveBeenCalled()
    act(() => r!.unmount())
  })
})

describe('revealOffset', () => {
  it('leaves a row that is already in full view', () => expect(revealOffset(100, 188, 0, 400, 10)).toBeNull())
  it('scrolls down so a row below the view ends at its bottom edge, with its pad', () => expect(revealOffset(500, 588, 0, 400, 10)).toBe(198))
  it('scrolls up so a row above the view starts at its top edge, with its pad', () => expect(revealOffset(100, 188, 300, 400, 10)).toBe(90))
  it('never scrolls above the top', () => expect(revealOffset(4, 92, 50, 400, 10)).toBe(0))
})
