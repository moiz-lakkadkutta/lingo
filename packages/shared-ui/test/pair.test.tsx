import React from 'react'
import { Pair } from '../src/screens/Pair'
import { strings } from '../src/strings'
import { is, labels, mountId, preferred, pressables, render, rerender, texts } from './helpers'

describe('Pair', () => {
  it('shows a check and the phone name when connected, never a check glyph', () => {
    const r = render(<Pair code="ABC234" joinUrl="lingo://join/ABC234" connected="Pixel 8" onLater={() => {}} />)
    expect(texts(r)).toContain(strings.pair.connected('Pixel 8'))
    expect(r.root.findAll((n) => is(n, 'View') && n.props.testID === 'check')).toHaveLength(1)
    expect(texts(r).join(' ')).not.toMatch(/[✓✔]/)
    expect(labels(r)).toEqual([strings.pair.continue])
  })
  it('always renders exactly one focusable with preferred focus', () => {
    const onLater = vi.fn()
    const r = render(<Pair code="ABC234" joinUrl="lingo://join/ABC234" connected={null} onLater={onLater} />)
    expect(pressables(r)).toHaveLength(1)
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([strings.pair.later])
    const before = mountId(pressables(r)[0]!)
    rerender(r, <Pair code="ABC234" joinUrl="lingo://join/ABC234" connected="Pixel 8" onLater={onLater} embedded />)
    expect(pressables(r)).toHaveLength(1)
    expect(labels(r)).toEqual([strings.firstRun.done])
    expect(mountId(pressables(r)[0]!)).toBe(before) // same element: focus stays put
    pressables(r)[0]!.props.onPress()
    expect(onLater).toHaveBeenCalled()
    expect(pressables(render(<Pair code={null} joinUrl={null} connected={null} onLater={() => {}} />))).toHaveLength(1)
  })
})
