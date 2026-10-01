import React from 'react'
import { act } from 'react-test-renderer'
import { AccessibilityInfo } from 'react-native'
import { createRemoteBus } from '../src/remote/types'
import { Settings, type SettingsProps } from '../src/screens/Settings'
import { strings } from '../src/strings'
import { learner } from './fixtures'
import { byLabel, focus, is, labels, preferred, press, render, texts } from './helpers'

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
    expect(live(render(<Settings {...props({ status: strings.common.saveError })} />))).toEqual([strings.common.saveError])
  })
})
