import React from 'react'
import { act } from 'react-test-renderer'
import { DualCue } from '../src/components/DualCue'
import { Explain } from '../src/screens/Explain'
import { MEASURE_FALLBACK_MS, Player, type PlayerProps } from '../src/screens/Player'
import { ProgressStrip, PROGRESS_STRIP_H } from '../src/screens/player/ProgressStrip'
import { tokens } from '../src/theme/tokens'
import { createRemoteBus } from '../src/remote/types'
import { strings } from '../src/strings'
import { clipReady, learner } from './fixtures'
import { byLabel, flat, is, pressBack, press, render, texts } from './helpers'

// KitPlayer as a host element, so the test can see whether the Player mounted it; Media Controls handlers are captured so a test can send
// an Alexa / VMC transport command.
const controls = vi.hoisted(() => new Set<(c: string) => void>())
vi.mock('@moizp/vega-media-kit', async (orig) => {
  const kit = await orig<{ mediaControls: object }>()
  const KitPlayer = React.forwardRef((p: Record<string, unknown>, _ref) => React.createElement('KitPlayer', p))
  const onControl = (cb: (c: string) => void) => { controls.add(cb); return () => { controls.delete(cb) } }
  return { ...kit, KitPlayer, mediaControls: { ...kit.mediaControls, onControl } }
})
const transport = (c: string) => act(() => { for (const cb of [...controls]) cb(c) })
const kitPlayers = (r: ReturnType<typeof render>) => r.root.findAll((n) => is(n, 'KitPlayer'))

const props = (over: Partial<PlayerProps> = {}): PlayerProps => ({
  clip: clipReady({ resumeS: 42 }), learner: learner(), scale: 1, challenge: false, savedIds: new Set(), savedCount: 0, remote: createRemoteBus(),
  onBack: vi.fn(), onEnd: vi.fn(), onSave: vi.fn(async () => 'saved' as const), onPlus: vi.fn(), onLearnerChange: vi.fn(), ...over,
})

describe('Player with caps.playback false (review LING-008 M4)', () => {
  const off = { rate: false, wordFocusIn: 'cue' as const, playback: false }

  it('mounts KitPlayer when playback is available (absent counts as available)', () => {
    expect(kitPlayers(render(<Player {...props({ caps: { rate: true, wordFocusIn: 'cue', playback: true } })} />))).toHaveLength(1)
    expect(kitPlayers(render(<Player {...props({ caps: { rate: true, wordFocusIn: 'cue' } })} />))).toHaveLength(1)
  })

  it('shows the playback-unavailable message and mounts no KitPlayer', () => {
    const r = render(<Player {...props({ caps: off })} />)
    expect(texts(r)).toEqual(expect.arrayContaining([strings.playbackOff.title, strings.playbackOff.body]))
    expect(kitPlayers(r)).toHaveLength(0)
    expect(byLabel(r, strings.playbackOff.backLabel).props.hasTVPreferredFocus).toBe(true)
  })

  it('Back (button or remote) leaves at the resume position', async () => {
    const onBack = vi.fn()
    const r = render(<Player {...props({ caps: off, onBack })} />)
    await press(byLabel(r, strings.playbackOff.backLabel))
    expect(onBack).toHaveBeenLastCalledWith(42)
    expect(pressBack()).toBe(true)
    expect(onBack).toHaveBeenCalledTimes(2)
  })
})

describe('Player · Alexa / Media Controls stop (LING-003 follow-up)', () => {
  it('stop leaves the Player at the position, like Back, and a remote back key alone does not', () => {
    const onBack = vi.fn()
    const remote = createRemoteBus()
    render(<Player {...props({ onBack, remote })} />)
    transport('stop')
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onBack).toHaveBeenLastCalledWith(42)
    act(() => remote.emit({ eventType: 'back' })) // Vega forwards Back as a TV event too; BackHandler is the only Back path
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('Player · start position', () => {
  it('starts at startS when given (a deep link), else at the clip resume position', () => {
    expect(kitPlayers(render(<Player {...props({ startS: 75 })} />))[0]!.props.startAt).toBe(75)
    expect(kitPlayers(render(<Player {...props()} />))[0]!.props.startAt).toBe(42)
  })
  it('Back with playback off leaves at startS', async () => {
    const onBack = vi.fn()
    render(<Player {...props({ caps: { rate: false, wordFocusIn: 'cue', playback: false }, onBack, startS: 75 })} />)
    expect(pressBack()).toBe(true)
    expect(onBack).toHaveBeenLastCalledWith(75)
  })
})

describe('Player · progress strip (QA #12)', () => {
  const strip = (r: ReturnType<typeof render>) => r.root.findAll((n) => is(n, 'View') && n.props.accessibilityRole === 'progressbar')
  it('is hidden during uninterrupted playback and shows elapsed / total after a seek key', () => {
    const remote = createRemoteBus()
    const r = render(<Player {...props({ remote })} />)
    expect(strip(r)).toHaveLength(0)
    act(() => remote.emit({ eventType: 'left' }))
    expect(strip(r)).toHaveLength(1)
    expect(strip(r)[0]!.props['aria-label']).toMatch(/^Played \d+:\d\d of 2:30$/)
  })
})

describe('Player · Explain card placement and the progress strip (review M2, M3, L5)', () => {
  const T = tokens.layout
  const stripH = PROGRESS_STRIP_H
  const strip = (r: ReturnType<typeof render>) => r.root.findAll((n) => is(n, 'View') && n.props.accessibilityRole === 'progressbar')
  // ProgressStrip's outer, absolutely placed View (the one with `bottom`).
  const stripBottom = (r: ReturnType<typeof render>) => r.root.findByType(ProgressStrip).props.bottom as number
  const wrap = (r: ReturnType<typeof render>) => r.root.find((n) => is(n, 'View') && n.props.accessibilityViewIsModal)
  const card = (r: ReturnType<typeof render>) => r.root.findByType(Explain).find((n) => is(n, 'View') && flat(n.props.style).backgroundColor === tokens.color.surface1)
  /** Play into the first line (1–3 s) and press Select: the Player pauses on it and opens the card. */
  const openExplain = (r: ReturnType<typeof render>) => {
    const kit = kitPlayers(r)[0]!
    act(() => { kit.props.onState('playing') })
    act(() => { kit.props.onPosition(1.5) })
    act(() => { byLabel(r, strings.player.stage).props.onPress() })
    expect(r.root.findAllByType(Explain)).toHaveLength(1)
  }
  const blockLayout = (r: ReturnType<typeof render>, h: number) => act(() => { r.root.findByType(DualCue).props.onBlockLayout(h) })
  const cardLayout = (r: ReturnType<typeof render>, h: number) => act(() => { card(r).props.onLayout({ nativeEvent: { layout: { height: h } } }) })

  it('draws the card once the cue block and the card are measured, and stacks the strip a gap above the card', () => {
    const r = render(<Player {...props({ startS: 0 })} />)
    openExplain(r)
    expect(flat(wrap(r).props.style).opacity).toBe(0) // not measured yet: laid out, not drawn
    expect(strip(r)).toHaveLength(0)
    blockLayout(r, 180)
    const cardBottom = T.safeY + 180 + T.gutter
    expect(r.root.findByType(Explain).props.bottom).toBe(cardBottom)
    cardLayout(r, 320)
    expect(flat(wrap(r).props.style).opacity).toBe(1)
    expect(strip(r)).toHaveLength(1)
    expect(stripBottom(r)).toBeGreaterThanOrEqual(cardBottom + 320 + T.gutter)
    expect(stripBottom(r) + stripH).toBeLessThanOrEqual(1080 - T.safeY)
  })

  it('caps the card at the top safe edge: maxHeight = 1080 − safeY − its bottom offset', () => {
    const r = render(<Player {...props({ startS: 0 })} />)
    openExplain(r)
    blockLayout(r, 180)
    const cardBottom = T.safeY + 180 + T.gutter
    expect(r.root.findByType(Explain).props.maxHeight).toBe(1080 - T.safeY - cardBottom)
    expect(flat(card(r).props.style).maxHeight).toBe(1080 - T.safeY - cardBottom)
  })

  it('at 150 % subtitle size the strip is left out when it would not fit above the card', () => {
    const r = render(<Player {...props({ startS: 0, learner: learner({ cueScale: 1.5 }) })} />)
    openExplain(r)
    blockLayout(r, 300) // a tall 150 % cue block
    const cardBottom = T.safeY + 300 + T.gutter
    cardLayout(r, 600) // fits under the cap (1080 − 54 − 378 = 648), but leaves no room for the strip
    expect(cardBottom + 600 + T.gutter + stripH).toBeGreaterThan(1080 - T.safeY)
    expect(flat(wrap(r).props.style).opacity).toBe(1)
    expect(strip(r)).toHaveLength(0)
  })

  it('draws the card after MEASURE_FALLBACK_MS even when the cue block is never measured (review L5)', () => {
    vi.useFakeTimers()
    try {
      const r = render(<Player {...props({ startS: 0 })} />)
      openExplain(r)
      expect(MEASURE_FALLBACK_MS).toBe(250)
      act(() => { vi.advanceTimersByTime(MEASURE_FALLBACK_MS - 1) })
      expect(flat(wrap(r).props.style).opacity).toBe(0)
      act(() => { vi.advanceTimersByTime(1) })
      expect(flat(wrap(r).props.style).opacity).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
