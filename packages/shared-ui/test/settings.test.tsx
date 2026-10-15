import React from 'react'
import { act } from 'react-test-renderer'
import { AccessibilityInfo } from 'react-native'
import { createRemoteBus } from '../src/remote/types'
import { Settings, type SettingsProps } from '../src/screens/Settings'
import { strings } from '../src/strings'
import { tokens } from '../src/theme/tokens'
import { learner } from './fixtures'
import { box, byLabel, flat, focus, is, labels, preferred, press, render, texts } from './helpers'

const S = strings.settings
const props = (over: Partial<SettingsProps> = {}): SettingsProps => ({ learner: learner(), phoneName: null, remote: createRemoteBus(), status: null, onAction: vi.fn(), onFocusId: vi.fn(), ...over })

describe('Settings', () => {
  it('focus starts on the remembered row, else Learning language', () => {
    const r = render(<Settings {...props()} />)
    expect(labels(r)).toHaveLength(9)
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([S.rowLabel(S.learning, 'Deutsch')])
    const m = render(<Settings {...props({ initialFocus: 'row:cueSize' })} />)
    expect(preferred(m).map((p) => p.props['aria-label'])).toEqual([S.rowLabel(S.cueSize, '100 %')])
    expect(texts(r)).toContain(S.title)
  })
  it('left and right on the focused row call onAction and announce', async () => {
    const remote = createRemoteBus(); const onAction = vi.fn(); const onFocusId = vi.fn()
    const spy = vi.mocked(AccessibilityInfo.announceForAccessibility); spy.mockClear()
    const r = render(<Settings {...props({ remote, onAction, onFocusId })} />)
    focus(byLabel(r, S.rowLabel(S.level, 'about A2')))
    expect(onFocusId).toHaveBeenLastCalledWith('row:level')
    act(() => remote.emit({ eventType: 'right' }))
    expect(onAction).toHaveBeenLastCalledWith({ kind: 'level', level: 'B1', announce: S.rowLabel(S.level, 'about B1') })
    expect(spy).toHaveBeenLastCalledWith(S.rowLabel(S.level, 'about B1'))
    focus(byLabel(r, S.rowLabel(S.nativeLine, 'Always')))
    act(() => remote.emit({ eventType: 'left' }))
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'patch', patch: { nativeLine: 'never' } }))
    onAction.mockClear()
    focus(byLabel(r, S.linkLabel(S.about, S.open)))
    act(() => remote.emit({ eventType: 'right' }))
    expect(onAction).not.toHaveBeenCalled()
    await press(byLabel(r, S.linkLabel(S.about, S.open)))
    expect(onAction).toHaveBeenLastCalledWith({ kind: 'open', route: 'about' })
  })
  it('shows the status line when a save did not go through', () => {
    const hint = render(<Settings {...props()} />)
    const live = (r: ReturnType<typeof render>) => texts(r.root.find((n) => is(n, 'Text') && n.props.accessibilityLiveRegion === 'polite'))
    expect(live(hint)).toEqual([S.hint])
    // Select on a cycle row steps the value, so the hint says so (review L5)
    expect(S.hint).toBe('\u2039 \u203A change a value · Select opens or changes · Back goes home')
    expect(hint.root.find((n) => is(n, 'Text') && n.props.accessibilityLiveRegion === 'polite').props['aria-label']).toBe('Left and right change a value. Select opens or changes. Back goes home.')
    expect(live(render(<Settings {...props({ status: strings.common.saveError })} />))).toEqual([strings.common.saveError])
  })
  it('a row with one option shows the plain value without the arrows (review L4)', () => {
    const r = render(<Settings {...props({ learner: learner({ learning: 'de', native: 'en' }) })} />)
    expect(labels(r)).toContain(S.valueLabel(S.native, 'English'))
    expect(texts(r)).toContain('English')
    expect(texts(r)).not.toContain(S.cycleValue('English'))
    expect(texts(r)).toContain(S.cycleValue('Deutsch')) // Learning language still cycles
  })
  it('QA #1: rows share token height, padding and radius; values sit in one right-aligned column; link rows end in a chevron, not "Open"', () => {
    const r = render(<Settings {...props()} />)
    const L = tokens.layout
    for (const l of labels(r)) {
      expect(box(byLabel(r, l))).toMatchObject({ width: L.rowW, minHeight: L.rowH, paddingHorizontal: L.rowPadX, paddingVertical: L.rowPadY, borderRadius: tokens.radius.md })
    }
    const col = (k: string) => r.root.find((n) => n.props.testID === `value-${k}`)
    for (const k of ['learning', 'native', 'pair', 'about']) expect(flat(col(k).props.style)).toMatchObject({ width: L.rowValueW, justifyContent: 'flex-end' })
    expect(texts(r)).not.toContain(S.open)
    expect(r.root.findAll((n) => is(n, 'Text') && n.props.testID === 'chevron').map((n) => n.props.children)).toEqual([strings.keys.right, strings.keys.right, strings.keys.right])
    expect(texts(col('pair'))).toEqual([S.pairValue(null), strings.keys.right])
    expect(texts(col('about'))).toEqual([strings.keys.right])
    expect(labels(r)).toContain(S.linkLabel(S.about, S.open)) // the label still says what Select does
  })
})
