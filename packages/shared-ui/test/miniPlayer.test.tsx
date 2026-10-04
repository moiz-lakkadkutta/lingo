import React from 'react'
import { AccessibilityInfo } from 'react-native'
import type { LibraryWord } from '@lingo/contracts'
import { MiniPlayer } from '../src/components/MiniPlayer'
import { createRemoteBus } from '../src/remote/types'
import { Quiz } from '../src/screens/Quiz'
import { Words } from '../src/screens/Words'
import { strings } from '../src/strings'
import { clipReady, quizItem } from './fixtures'
import { byLabel, is, press, render, texts } from './helpers'

// Vega (caps.playback false, KIT-010): the mini player must never mount KitPlayer, which would reach the Shaka stub and crash (PR #2 review B-M2).
vi.mock('../src/platformCaps', async (orig) => {
  const real = await orig<typeof import('../src/platformCaps')>()
  return { ...real, caps: { rate: false, wordFocusIn: 'cue', playback: false } }
})
vi.mock('@moizp/vega-media-kit', async (orig) => {
  const KitPlayer = React.forwardRef((p: Record<string, unknown>, _ref) => React.createElement('KitPlayer', p))
  return { ...(await orig<object>()), KitPlayer }
})
const kitPlayers = (r: ReturnType<typeof render>) => r.root.findAll((n) => is(n, 'KitPlayer'))

describe('PR2-B-M2: MiniPlayer respects caps.playback', () => {
  it('PR2-B-M2: playback false shows the playback message, speaks it, calls onEnd once and mounts no KitPlayer', () => {
    const onEnd = vi.fn()
    const spy = vi.mocked(AccessibilityInfo.announceForAccessibility); spy.mockClear()
    const r = render(<MiniPlayer manifestUrl="https://cdn.example/a.m3u8" startS={1} endS={2} playKey={1} onEnd={onEnd} />)
    expect(kitPlayers(r)).toHaveLength(0)
    expect(texts(r)).toContain(strings.playbackOff.title)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(strings.playbackOff.title)
  })
  it('PR2-B-M2: an explicit caps.playback true still mounts KitPlayer', () => {
    const r = render(<MiniPlayer manifestUrl="https://cdn.example/a.m3u8" startS={1} endS={2} playKey={1} caps={{ rate: true, wordFocusIn: 'cue', playback: true }} />)
    expect(kitPlayers(r)).toHaveLength(1)
    expect(texts(r)).not.toContain(strings.playbackOff.title)
  })

  it('PR2-B-M2: Words — Select on a saved word shows the playback message instead of KitPlayer', async () => {
    const word: LibraryWord = {
      savedWordId: 'a', word: 'a', lemma: 'lemma-a', gloss: 'gloss a', due: new Date(2026, 8, 30).toISOString(), intervalD: 0, reps: 1, learned: false,
      clip: { slug: 'zug', title: 'Der Zug', manifestUrl: 'https://cdn.example/zug.m3u8' }, cue: { index: 2, startS: 4, endS: 6.5, text: 'Der Zug\nfährt ab.', native: 'n' },
    }
    const r = render(<Words words={{ state: 'ready', data: [word] }} filter="all" onFilter={vi.fn()} remote={createRemoteBus()} now={new Date(2026, 9, 1, 10)} onReload={vi.fn()} onFindClip={vi.fn()} onFocusId={vi.fn()} />)
    await press(byLabel(r, strings.words.rowLabel('lemma-a', 'gloss a', strings.words.dueToday, 'Der Zug', true)))
    expect(kitPlayers(r)).toHaveLength(0)
    expect(texts(r)).toContain(strings.playbackOff.title)
  })

  it('PR2-B-M2: Quiz — Replay the line shows no KitPlayer and the replay ends, so the quiz goes on', async () => {
    const items = [quizItem('q2', { kind: 'cloze', cueIndex: 1, answer: 2 })]
    const spy = vi.mocked(AccessibilityInfo.announceForAccessibility); spy.mockClear()
    const r = render(<Quiz clip={clipReady({ quiz: items })} onFinish={vi.fn(async () => ({ level: 'A2' as const, changed: null }))} onNext={vi.fn()} onAgain={vi.fn()} onDone={vi.fn()} />)
    await press(byLabel(r, strings.quiz.replayLine))
    expect(kitPlayers(r)).toHaveLength(0)
    expect(spy).toHaveBeenCalledWith(strings.playbackOff.title) // the mini player mounted in its playback-off form
    // onEnd fired on mount, so the replay closed and Replay the line is offered again
    expect(r.root.findAll((n) => n.props.testID === 'mini-playback-off')).toHaveLength(0)
    expect(byLabel(r, strings.quiz.replayLine)).toBeTruthy()
  })
})
