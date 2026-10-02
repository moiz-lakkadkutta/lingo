import React from 'react'
import { Player, type PlayerProps } from '../src/screens/Player'
import { createRemoteBus } from '../src/remote/types'
import { strings } from '../src/strings'
import { clipReady, learner } from './fixtures'
import { byLabel, is, pressBack, press, render, texts } from './helpers'

// KitPlayer as a host element, so the test can see whether the Player mounted it
vi.mock('@moizp/vega-media-kit', async (orig) => {
  const KitPlayer = React.forwardRef((p: Record<string, unknown>, _ref) => React.createElement('KitPlayer', p))
  return { ...(await orig<object>()), KitPlayer }
})
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
