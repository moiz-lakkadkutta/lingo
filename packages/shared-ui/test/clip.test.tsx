import React from 'react'
import { act } from 'react-test-renderer'
import type { ClipResponse } from '@lingo/contracts'
import type { Resource } from '../src/data/resource'
import { Clip, ClipGone, type ClipProps } from '../src/screens/Clip'
import { strings } from '../src/strings'
import { tokens } from '../src/theme/tokens'
import { card, clipReady, hl, learner } from './fixtures'
import { byLabel, flat, is, labels, preferred, press, render, texts } from './helpers'

const props = (clip: Resource<ClipResponse>, over: Partial<ClipProps> = {}): ClipProps => ({
  clip, learner: learner(), inContinue: false, onReload: vi.fn(), onWatch: vi.fn(), onPlus: vi.fn(), onAddToContinue: vi.fn(async () => true), onBack: vi.fn(), onFocusId: vi.fn(), ...over,
})
const ten = Array.from({ length: 10 }, (_, i) => hl(`w${i}`, `Wort${i}`))

describe('Clip', () => {
  it('ready: focus on Watch, up to eight marker chips, attribution shown', () => {
    const c = clipReady({ wordsYoullMeet: ten })
    const r = render(<Clip {...props({ state: 'ready', data: c })} />)
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([strings.home.watchLabel(c.title)])
    const chips = r.root.findAll((n) => is(n, 'View') && n.props.testID === 'meet-chip')
    expect(chips).toHaveLength(8)
    expect(chips.every((ch) => flat(ch.props.style).backgroundColor === tokens.color.marker)).toBe(true)
    const row = r.root.find((n) => n.props.testID === 'meet-row')
    expect(row.props['aria-label']).toBe(strings.clip.meetLabel(ten.slice(0, 8).map((h) => h.word).join(', ')))
    expect(texts(r)).toContain(c.attribution)
    expect(texts(r)).toContain(c.title)
    expect(texts(render(<Clip {...props({ state: 'ready', data: clipReady({ wordsYoullMeet: [] }) })} />))).toContain(strings.clip.noWords)
  })
  it('free learner sees Challenge mode · Plus and pressing it opens Plus', async () => {
    const onPlus = vi.fn(); const onWatch = vi.fn()
    const r = render(<Clip {...props({ state: 'ready', data: clipReady() }, { onPlus, onWatch })} />)
    expect(texts(r)).toContain(strings.clip.challengePlus)
    await press(byLabel(r, strings.clip.challengePlusLabel))
    expect(onPlus).toHaveBeenCalled()
    expect(onWatch).not.toHaveBeenCalled()
  })
  it('Plus learner starts Challenge mode', async () => {
    const onWatch = vi.fn()
    const r = render(<Clip {...props({ state: 'ready', data: clipReady() }, { learner: learner({ plus: true }), onWatch })} />)
    await press(byLabel(r, strings.clip.challengeLabel))
    expect(onWatch).toHaveBeenCalledWith(true)
    await press(byLabel(r, strings.home.watchLabel('Title zug')))
    expect(onWatch).toHaveBeenLastCalledWith(false)
  })
  it('Add to Continue turns into In Continue after success and is hidden for started clips', async () => {
    const r = render(<Clip {...props({ state: 'ready', data: clipReady() })} />)
    await press(byLabel(r, strings.clip.addContinue))
    const done = byLabel(r, strings.clip.inContinue)
    expect(done.props['aria-disabled']).toBe(true)
    expect(texts(r)).toContain(strings.clip.added)
    const fail = render(<Clip {...props({ state: 'ready', data: clipReady() }, { onAddToContinue: vi.fn(async () => false) })} />)
    await press(byLabel(fail, strings.clip.addContinue))
    expect(texts(fail)).toContain(strings.common.saveError)
    expect(labels(render(<Clip {...props({ state: 'ready', data: clipReady({ resumeS: 40 }) })} />))).not.toContain(strings.clip.addContinue)
    expect(labels(render(<Clip {...props({ state: 'ready', data: clipReady() }, { inContinue: true })} />))).not.toContain(strings.clip.addContinue)
    expect(texts(render(<Clip {...props({ state: 'ready', data: clipReady({ resumeS: 40 }) })} />))).toContain(strings.home.resume('0:40'))
  })
  it('L10: a completed clip offers no Add to Continue, so it cannot PUT completed:false over the finish', () => {
    const onAddToContinue = vi.fn(async () => true)
    const r = render(<Clip {...props({ state: 'ready', data: clipReady({ completed: true }) }, { onAddToContinue })} />)
    expect(labels(r)).not.toContain(strings.clip.addContinue)
    expect(texts(r)).not.toContain(strings.clip.addContinue)
    expect(onAddToContinue).not.toHaveBeenCalled()
  })
  it('L10: a clip missing from the client cache says so and offers Back, not a server error', async () => {
    const onBack = vi.fn()
    const r = render(<ClipGone onBack={onBack} />)
    expect(texts(r)).toContain(strings.clip.gone)
    expect(texts(r)).not.toContain(strings.common.error)
    expect(strings.clip.gone).not.toMatch(/our side/)
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([strings.common.backLabel])
    await press(byLabel(r, strings.common.backLabel))
    expect(onBack).toHaveBeenCalled()
  })
  it('preparing shows the three-minute message with Back focused', () => {
    vi.useFakeTimers()
    try {
      const onReload = vi.fn()
      const r = render(<Clip {...props({ state: 'ready', data: { ...card('p'), status: 'preparing', etaMin: 3 } }, { onReload })} />)
      expect(texts(r)).toContain(strings.clip.preparing(3))
      expect(texts(r)).toContain(strings.clip.preparingBody)
      expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([strings.common.backLabel])
      vi.advanceTimersByTime(30_000)
      expect(onReload).toHaveBeenCalledTimes(1)
      act(() => r.unmount())
      vi.advanceTimersByTime(60_000)
      expect(onReload).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
  it('not found shows the message and Back; server error adds Retry', () => {
    const nf = render(<Clip {...props({ state: 'error', error: 'notFound' })} />)
    expect(texts(nf)).toContain(strings.clip.notFound)
    expect(labels(nf)).toEqual([strings.common.backLabel])
    const se = render(<Clip {...props({ state: 'error', error: 'server' })} />)
    expect(texts(se)).toContain(strings.common.error)
    expect(labels(se)).toEqual([strings.clip.retryLabel, strings.common.backLabel])
    expect(texts(render(<Clip {...props({ state: 'error', error: 'offline' })} />))).toContain(strings.offline)
  })
})
