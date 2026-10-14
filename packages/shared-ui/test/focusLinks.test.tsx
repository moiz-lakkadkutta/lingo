import React from 'react'
import type { View } from 'react-native'
import { DualCue, type DualCueProps } from '../src/components/DualCue'
import { Explain, type ExplainProps } from '../src/screens/Explain'
import { alignHighlights } from '../src/screens/player/align'
import { strings } from '../src/strings'
import { cue, hl } from './fixtures'
import { byLabel, renderTagged } from './helpers'

// Decision 0006, amended after S1 (2026-10-04): the card ↔ chip links are pinned in both directions, so Android's spatial focus search
// never moves Save word ▼ to a chip in the cue line below the card, nor a chip ▲ to Replay.
const twoWords = cue(0, 1, 3, 'Ich habe zwei\nStunden gewartet.', [hl('h1', 'Stunden'), hl('h2', 'habe')])

describe('focus links between the Explain card and the word chips', () => {
  const explainProps = (over: Partial<ExplainProps> = {}): ExplainProps => ({
    cue: twoWords, highlight: twoWords.highlights[0]!, alignmentOk: true, wordFocus: 'cue', focusedIdx: 0, onFocusWord: vi.fn(),
    savedIds: new Set(), savedCount: 0, plus: true, caps: { rate: true, wordFocusIn: 'cue' }, rate: 1,
    onSave: vi.fn(async () => 'saved' as const), onReplay: vi.fn(), onSlower: vi.fn(), onPlus: vi.fn(),
    chipRefs: { current: [] }, saveRef: { current: null }, bottom: 300, ...over,
  })
  const save = strings.explain.saveLabel('Stunden')
  const actionLabels = [save, strings.explain.replay, strings.explain.slower]

  it('cue mode: every card action goes ▲ to the focused chip and stays put on ▼', () => {
    const chip = { _nativeTag: 7 } as unknown as View
    const { r, tagOf } = renderTagged(<Explain {...explainProps({ chipRefs: { current: [chip, null] } })} />)
    for (const label of actionLabels) {
      const p = byLabel(r, label)
      expect(p.props.nextFocusUp).toBe(7)
      expect(p.props.nextFocusDown).toBe(tagOf(label))
      expect(tagOf(label)).toBeGreaterThanOrEqual(100)
    }
  })

  it('card mode: chips go ▼ to Save word and stay put on ▲; Save word goes ▲ to the focused chip', () => {
    const chipRefs = { current: [] as Array<View | null> }
    const saveRef = { current: null as View | null }
    const { r, tagOf } = renderTagged(<Explain {...explainProps({ wordFocus: 'card', chipRefs, saveRef, focusedIdx: 1 })} />)
    for (const word of ['Stunden', 'habe']) {
      const label = strings.explain.wordLabel(word)
      expect(byLabel(r, label).props.nextFocusDown).toBe(tagOf(save))
      expect(byLabel(r, label).props.nextFocusUp).toBe(tagOf(label))
    }
    expect(byLabel(r, save).props.nextFocusUp).toBe(tagOf(strings.explain.wordLabel('habe')))
    expect(byLabel(r, save).props.nextFocusDown).toBe(tagOf(save))
  })

  it('no highlight: Replay keeps ▼ on itself and has no ▲ link (no chips to go to)', () => {
    const bare = cue(1, 4, 6, 'Na gut.', [])
    const { r, tagOf } = renderTagged(<Explain {...explainProps({ cue: bare, highlight: null })} />)
    const replay = byLabel(r, strings.explain.replay)
    expect(replay.props.nextFocusDown).toBe(tagOf(strings.explain.replay))
    expect(replay.props.nextFocusUp).toBeUndefined()
  })

  it('DualCue: highlighted chips go ▼ to the given Save handle and stay put on ▲; plain words get no links', () => {
    const props: DualCueProps = {
      cue: twoWords, alignment: alignHighlights(twoWords.text, twoWords.highlights), nativeVisible: true, wordFocus: 'cue',
      focusedIdx: null, onFocusWord: vi.fn(), savedIds: new Set(), userScale: 1, hold: null, nextFocusDown: 42, chipRefs: { current: [] },
    }
    const { r, tagOf } = renderTagged(<DualCue {...props} />)
    for (const word of ['Stunden', 'habe']) {
      const label = strings.explain.wordLabel(word)
      expect(byLabel(r, label).props.nextFocusDown).toBe(42)
      expect(byLabel(r, label).props.nextFocusUp).toBe(tagOf(label))
    }
    const plain = r.root.findAll((n) => (n.type as unknown) === 'Pressable' && !n.props.focusable)
    expect(plain.length).toBe(3)
    expect(plain.every((p) => p.props.nextFocusUp === undefined && p.props.nextFocusDown === undefined)).toBe(true)
  })
})
