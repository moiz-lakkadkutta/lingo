import React from 'react'
import { Row } from '../src/components/Row'
import { createRemoteBus } from '../src/remote/types'
import { Home } from '../src/screens/Home'
import { Settings } from '../src/screens/Settings'
import { focusBleed } from '../src/theme/bleed'
import { tokens } from '../src/theme/tokens'
import { card, catalog, learner } from './fixtures'
import { flat, render } from './helpers'

// Device test 2026-10-23 (shots 64, 70, 74): the scaled focus was cut at the left edge of the Home, Row and Settings scroll views.
const overhang = (w: number) => (w * (tokens.motion.focusScale - 1)) / 2 + tokens.focus.width + tokens.focus.offset
const scroll = (r: ReturnType<typeof render>, id: string) => r.root.findAll((n) => n.props.testID === id)[0]!
const reachesAndPadsBack = (r: ReturnType<typeof render>, id: string, w: number) => {
  const s = scroll(r, id)
  const reach = -(flat(s.props.style).marginLeft as number)
  expect(reach).toBeGreaterThanOrEqual(overhang(w))
  expect(flat(s.props.contentContainerStyle).paddingLeft).toBe(reach) // content stays where it was
  return s
}

describe('focus bleed: a focused item at a scroll view edge is drawn in full', () => {
  it('covers the scale growth and the outline at its offset', () => {
    expect(focusBleed(tokens.layout.cardW)).toBeGreaterThanOrEqual(overhang(tokens.layout.cardW))
    expect(focusBleed(tokens.layout.cardW)).toBeLessThan(tokens.layout.safeX) // stays inside the safe area
  })
  it('Home and its rows', () => {
    const r = render(<Home catalog={{ state: 'ready', data: catalog({ justRight: [card('zug'), card('bus')] }) }} learner={learner()} onReload={vi.fn()} onWatch={vi.fn()} onOpen={vi.fn()} onRail={vi.fn()} onSettings={vi.fn()} onFocusId={vi.fn()} />)
    reachesAndPadsBack(r, 'home-scroll', tokens.layout.cardW)
    reachesAndPadsBack(r, 'row-scroll', tokens.layout.cardW)
  })
  it('Row on its own', () => {
    reachesAndPadsBack(render(<Row label="x">{null}</Row>), 'row-scroll', tokens.layout.cardW)
  })
  it('Settings, including room above the first and below the last row', () => {
    const r = render(<Settings learner={learner()} phoneName={null} remote={createRemoteBus()} status={null} onAction={vi.fn()} onFocusId={vi.fn()} />)
    const s = reachesAndPadsBack(r, 'settings-scroll', tokens.layout.rowW)
    expect(flat(s.props.contentContainerStyle).paddingVertical).toBeGreaterThanOrEqual(overhang(tokens.layout.rowH))
  })
})
