import React from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { formatClock, knownDuration, progressBottom, progressFraction, progressText } from '../src/screens/player/progress'
import { progressVisible } from '../src/screens/player/visibility'
import { PROGRESS_STRIP_H, ProgressStrip } from '../src/screens/player/ProgressStrip'
import { strings } from '../src/strings'
import { tokens } from '../src/theme/tokens'

const is = (n: ReactTestInstance, host: string) => (n.type as unknown) === host
const textOf = (n: ReactTestInstance): string => [n.props.children].flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join('')
const render = (el: React.ReactElement): ReactTestRenderer => { let r: ReactTestRenderer | undefined; act(() => { r = create(el) }); return r! }

describe('formatClock (QA #12)', () => {
  it('formats m:ss under an hour and h:mm:ss from an hour', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(5)).toBe('0:05')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(599.9)).toBe('9:59') // whole seconds, rounded down
    expect(formatClock(3599)).toBe('59:59')
    expect(formatClock(3600)).toBe('1:00:00')
    expect(formatClock(3725)).toBe('1:02:05')
  })
  it('treats negative and non-finite input as 0:00', () => {
    expect(formatClock(-3)).toBe('0:00')
    expect(formatClock(Number.NaN)).toBe('0:00')
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
})

describe('progress values', () => {
  it('knownDuration accepts only a positive finite number', () => {
    expect(knownDuration(270)).toBe(270)
    for (const d of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) expect(knownDuration(d)).toBeNull()
  })
  it('progressFraction is clamped to 0–1 and null without a duration', () => {
    expect(progressFraction(0, 200)).toBe(0)
    expect(progressFraction(50, 200)).toBe(0.25)
    expect(progressFraction(250, 200)).toBe(1)
    expect(progressFraction(-5, 200)).toBe(0)
    expect(progressFraction(50, null)).toBeNull()
  })
  it('progressText clamps elapsed to the duration and drops the total without one', () => {
    expect(progressText(65, 270)).toEqual({ elapsed: '1:05', total: '4:30' })
    expect(progressText(300, 270)).toEqual({ elapsed: '4:30', total: '4:30' })
    expect(progressText(65, null)).toEqual({ elapsed: '1:05', total: null })
  })
})

describe('progressVisible: when the strip shows', () => {
  it('shows while paused on the card and during the end-of-line hold, whatever the chrome timer', () => {
    expect(progressVisible({ phase: 'explain', now: 10_000, chromeUntil: 0 })).toBe(true)
    expect(progressVisible({ phase: 'holding', now: 10_000, chromeUntil: 0 })).toBe(true)
  })
  it('while playing, shows only with the chrome (after a seek), then hides', () => {
    expect(progressVisible({ phase: 'playing', now: 10_000, chromeUntil: 0 })).toBe(false) // uninterrupted playback
    expect(progressVisible({ phase: 'playing', now: 10_000, chromeUntil: 10_000 + tokens.motion.overlayHideMs })).toBe(true)
    expect(progressVisible({ phase: 'playing', now: 10_000 + tokens.motion.overlayHideMs, chromeUntil: 10_000 + tokens.motion.overlayHideMs })).toBe(false)
  })
  it('hides behind the settings sheet', () => {
    expect(progressVisible({ phase: 'sheet', now: 10_000, chromeUntil: 20_000 })).toBe(false)
  })
})

describe('progressBottom: the strip never covers the cue block or the card', () => {
  const k = { safeY: 54, gap: 24, floorH: 36, stripH: PROGRESS_STRIP_H, screenH: 1080 }
  it('sits a gap above the cue block, and above the status line when there is no cue block yet', () => {
    expect(progressBottom({ cueBlockH: 180, card: null }, k)).toBe(54 + 180 + 24)
    expect(progressBottom({ cueBlockH: null, card: null }, k)).toBe(54 + 36 + 24)
    expect(progressBottom({ cueBlockH: 10, card: null }, k)).toBe(54 + 36 + 24)
  })
  it('sits a gap above the Explain card once it is measured, and not at all before', () => {
    expect(progressBottom({ cueBlockH: 180, card: { bottom: 258, height: 400 } }, k)).toBe(258 + 400 + 24)
    expect(progressBottom({ cueBlockH: 180, card: { bottom: 258, height: null } }, k)).toBeNull()
  })
  it('hides rather than run into the top safe area under a very tall card', () => {
    const fits = 1080 - 54 - PROGRESS_STRIP_H - 24 - 258 // the tallest card that still leaves room
    expect(progressBottom({ cueBlockH: 180, card: { bottom: 258, height: fits } }, k)).not.toBeNull()
    expect(progressBottom({ cueBlockH: 180, card: { bottom: 258, height: fits + 1 } }, k)).toBeNull()
  })
})

describe('ProgressStrip', () => {
  const strip = (r: ReactTestRenderer) => r.root.find((n) => is(n, 'View') && n.props.accessibilityRole === 'progressbar')
  const filled = (r: ReactTestRenderer, colour: string) => r.root.findAll((n) => is(n, 'View') && n.props.style?.backgroundColor === colour)
  it('shows elapsed / total and a bar filled to the playhead, with accessible text and no focus', () => {
    const r = render(<ProgressStrip positionS={65} durationS={260} bottom={300} />)
    expect(r.root.findAll((n) => is(n, 'Text')).map(textOf)).toEqual(['1:05 / 4:20'])
    const s = strip(r)
    expect(s.props['aria-label']).toBe(strings.player.progressLabel('1:05', '4:20'))
    expect(s.props.accessibilityValue).toEqual({ min: 0, max: 260, now: 65 })
    expect(s.props.focusable).toBeUndefined()
    expect(r.root.findAll((n) => is(n, 'Pressable'))).toHaveLength(0)
    const fill = filled(r, tokens.color.interactive)
    expect(fill).toHaveLength(1)
    expect(fill[0]!.props.style.width).toBe('25%')
    expect(filled(r, tokens.color.track)).toHaveLength(1)
  })
  it('without a duration shows elapsed time only and no bar', () => {
    const r = render(<ProgressStrip positionS={65} durationS={0} bottom={300} />)
    expect(r.root.findAll((n) => is(n, 'Text')).map(textOf)).toEqual(['1:05'])
    expect(strip(r).props['aria-label']).toBe(strings.player.progressLabel('1:05', null))
    expect(filled(r, tokens.color.track)).toHaveLength(0)
  })
})
