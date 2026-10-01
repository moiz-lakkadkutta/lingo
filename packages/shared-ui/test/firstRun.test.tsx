import React from 'react'
import { initialSession } from '../src/session/types'
import { FirstRun, type FirstRunProps } from '../src/screens/FirstRun'
import { strings } from '../src/strings'
import { tokens } from '../src/theme/tokens'
import { learner } from './fixtures'
import { byLabel, flat, is, labels, mountId, preferred, press, pressBack, pressables, render, rerender, texts } from './helpers'

const F = strings.firstRun
const props = (over: Partial<FirstRunProps> = {}): FirstRunProps => ({ learner: learner({ firstRunDone: false }), session: { ...initialSession, code: 'ABC234', joinUrl: 'lingo://join/ABC234' }, onProfile: vi.fn(), onLevel: vi.fn(), onDone: vi.fn(), ...over })
const toPlacement = async (r: ReturnType<typeof render>) => {
  await press(byLabel(r, F.learningLabel('Deutsch')))
  await press(byLabel(r, F.speakLabel('English')))
}

describe('FirstRun', () => {
  it('learning panel shows Deutsch and English with the current one focused', () => {
    const r = render(<FirstRun {...props({ learner: learner({ learning: 'en', native: 'de' }) })} />)
    expect(texts(r)).toContain(F.learning)
    expect(labels(r)).toEqual([F.learningLabel('Deutsch'), F.learningLabel('English')])
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([F.learningLabel('English')])
    expect(pressBack()).toBe(false) // Back on the first panel leaves the app
  })
  it('speak panel shows eight native names, never the learning language', async () => {
    const onProfile = vi.fn()
    const r = render(<FirstRun {...props({ onProfile, learner: learner({ native: 'tr' }) })} />)
    await press(byLabel(r, F.learningLabel('English')))
    expect(texts(r)).toContain(F.speak)
    expect(labels(r)).toHaveLength(8)
    expect(labels(r)).not.toContain(F.speakLabel('English'))
    expect(labels(r)[0]).toBe(F.speakLabel('Deutsch'))
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([F.speakLabel('Türkçe')])
    expect(pressBack()).toBe(true)
    expect(texts(r)).toContain(F.learning)
    await press(byLabel(r, F.learningLabel('Deutsch')))
    await press(byLabel(r, F.speakLabel('Polski')))
    expect(onProfile).toHaveBeenCalledWith({ learning: 'de', native: 'pl' })
  })
  it('placement shows one line at a time in a cue box with Yes focused and a Skip button', async () => {
    const onLevel = vi.fn()
    const r = render(<FirstRun {...props({ onLevel })} />)
    await toPlacement(r)
    expect(texts(r)).toContain(F.item(1, 6))
    const line = r.root.find((n) => is(n, 'Text') && n.props.children === 'Ich trinke morgens gern Kaffee.')
    expect(flat(line.props.style).fontSize).toBe(44)
    const boxView = r.root.find((n) => n.props.testID === 'placement-cue')
    expect(flat(boxView.props.style).backgroundColor).toBe(tokens.color.cueBox)
    expect(labels(r)).toEqual([F.yesLabel, F.mostlyLabel, F.noLabel, F.skipLabel])
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([F.yesLabel])
    await press(byLabel(r, F.yesLabel))
    expect(texts(r)).toContain(F.item(2, 6))
    expect(texts(r)).toContain('Kannst du mir sagen,\nwann der Zug fährt?')
    expect(texts(r).join(' ')).not.toContain('native')
    await press(byLabel(r, F.skipLabel))
    expect(onLevel).toHaveBeenCalledWith('A2')
  })
  it('pair panel shows the code and turns Later into Start watching when a phone connects, keeping one focusable', async () => {
    const onDone = vi.fn()
    const p = props({ onDone })
    const r = render(<FirstRun {...p} />)
    await toPlacement(r)
    await press(byLabel(r, F.skipLabel))
    expect(texts(r)).toContain('ABC234')
    expect(labels(r)).toEqual([strings.pair.later])
    const before = mountId(pressables(r)[0]!)
    rerender(r, <FirstRun {...p} session={{ ...p.session, phone: 'Pixel 8' }} />)
    expect(labels(r)).toEqual([F.done])
    expect(mountId(pressables(r)[0]!)).toBe(before)
    expect(texts(r)).toContain(strings.pair.connected('Pixel 8'))
    await press(byLabel(r, F.done))
    expect(onDone).toHaveBeenCalled()
  })
})
