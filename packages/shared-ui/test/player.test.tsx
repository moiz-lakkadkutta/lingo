import React from 'react'
import { act } from 'react-test-renderer'
import { Player, type PlayerProps } from '../src/screens/Player'
import { createRemoteBus } from '../src/remote/types'
import { strings } from '../src/strings'
import { clipReady, learner } from './fixtures'
import { byLabel, is, pressBack, press, render, texts } from './helpers'

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
