import React from 'react'
import { act } from 'react-test-renderer'
import { Quiz, type QuizProps } from '../src/screens/Quiz'
import { strings } from '../src/strings'
import { tokens } from '../src/theme/tokens'
import { clipReady, quizItem } from './fixtures'
import { blur, box, byLabel, flat, flush, focus, is, labels, preferred, press, pressables, render, texts } from './helpers'

vi.mock('../src/components/MiniPlayer', async (orig) => ({ ...(await orig<object>()), MiniPlayer: (p: object) => React.createElement('MiniPlayer', p) }))

const items = [quizItem('q1', { kind: 'meaning', cueIndex: 0, answer: 1 }), quizItem('q2', { kind: 'cloze', cueIndex: 1, answer: 2 })]
const props = (over: Partial<QuizProps> = {}): QuizProps => ({ clip: clipReady({ quiz: items }), onFinish: vi.fn(async () => ({ level: 'A2' as const, changed: null })), onNext: vi.fn(), onAgain: vi.fn(), onDone: vi.fn(), ...over })
const opt = (text: string, k: number) => strings.quiz.optionLabel(text, k + 1, 4)
const options = (r: ReturnType<typeof render>) => pressables(r).filter((p) => String(p.props['aria-label']).startsWith('Answer '))

describe('Quiz', () => {
  it('shows the prompt at 44 px, a 2×2 grid of 640×140 options and "1 of n" top-right', () => {
    const r = render(<Quiz {...props()} />)
    const prompt = r.root.find((n) => is(n, 'Text') && n.props.children === 'Prompt q1')
    expect(flat(prompt.props.style).fontSize).toBe(44)
    expect(options(r)).toHaveLength(4)
    for (const o of options(r)) expect(box(o)).toMatchObject({ width: 640, height: 140 })
    const grid = r.root.find((n) => n.props.testID === 'quiz-grid')
    expect(flat(grid.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap', maxWidth: 1320 })
    expect(texts(r)).toContain(strings.quiz.progress(1, 2))
    expect(texts(r)).toContain(strings.quiz.meaningKind)
  })
  it('option 0 has preferred focus while answering', () => {
    const r = render(<Quiz {...props()} />)
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([opt('eins', 0)])
  })
  it('a correct pick shows a blue ring and a check on the answer', async () => {
    vi.useFakeTimers()
    try {
      const r = render(<Quiz {...props()} />)
      await press(byLabel(r, opt('zwei', 1)))
      const right = byLabel(r, opt('zwei', 1))
      expect(box(right)).toMatchObject({ borderColor: tokens.color.interactive, borderWidth: 3 })
      expect(right.findAll((n) => is(n, 'View') && n.props.testID === 'check')).toHaveLength(1)
      expect(texts(r)).toContain(strings.quiz.right('zwei'))
      act(() => { vi.advanceTimersByTime(600) })
      expect(texts(r)).toContain(strings.quiz.progress(2, 2))
    } finally { vi.useRealTimers() }
  })
  it('M2: the focused correct answer keeps its blue ring and check; focus is an extra outer ring plus the scale', async () => {
    vi.useFakeTimers()
    try {
      const r = render(<Quiz {...props()} />)
      const pick = byLabel(r, opt('zwei', 1))
      focus(pick) // the learner moved focus here before pressing Select
      await press(pick)
      const right = byLabel(r, opt('zwei', 1))
      expect(box(right)).toMatchObject({ borderColor: tokens.color.interactive, borderWidth: 3 })
      expect(box(right).margin).toBeUndefined()
      expect(right.findAll((n) => is(n, 'View') && n.props.testID === 'check')).toHaveLength(1)
      const ring = right.findAll((n) => is(n, 'View') && n.props.testID === 'focus-ring')
      expect(ring).toHaveLength(1)
      expect(flat(ring[0]!.props.style)).toMatchObject({ position: 'absolute', borderColor: tokens.color.focus, borderWidth: tokens.focus.width })
      expect(flat(ring[0]!.props.style).top).toBeLessThan(-3) // outside the 3 px blue ring
      blur(right)
      expect(byLabel(r, opt('zwei', 1)).findAll((n) => is(n, 'View') && n.props.testID === 'focus-ring')).toHaveLength(0)
      expect(box(byLabel(r, opt('zwei', 1)))).toMatchObject({ borderColor: tokens.color.interactive, borderWidth: 3 })
    } finally { vi.useRealTimers() }
  })
  it('an incorrect pick shows a coral ring on the pick, the answer highlighted and a focused Continue', async () => {
    const r = render(<Quiz {...props()} />)
    await press(byLabel(r, opt('vier', 3)))
    expect(box(byLabel(r, opt('vier', 3)))).toMatchObject({ borderColor: tokens.color.incorrect, borderWidth: 3 })
    expect(byLabel(r, opt('vier', 3)).findAll((n) => is(n, 'View') && n.props.testID === 'check')).toHaveLength(0)
    expect(box(byLabel(r, opt('zwei', 1)))).toMatchObject({ borderColor: tokens.color.interactive })
    expect(texts(r)).toContain(strings.quiz.answerIs('zwei'))
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([strings.quiz.continue])
    await press(byLabel(r, opt('eins', 0))) // ignored after the reveal
    expect(texts(r)).toContain(strings.quiz.answerIs('zwei'))
    await press(byLabel(r, strings.quiz.continue))
    expect(texts(r)).toContain(strings.quiz.progress(2, 2))
  })
  it('a meaning item shows the cue native line after an incorrect pick', async () => {
    const r = render(<Quiz {...props()} />)
    expect(texts(r)).not.toContain(strings.quiz.inClip('native 0'))
    await press(byLabel(r, opt('vier', 3)))
    const line = r.root.find((n) => is(n, 'Text') && n.props.children === strings.quiz.inClip('native 0'))
    expect(flat(line.props.style).color).toBe(tokens.color.nativeCue)
  })
  it('a cloze item offers Replay the line, which mounts the mini player on the cue span', async () => {
    const r = render(<Quiz {...props({ clip: clipReady({ quiz: [items[1]!] }) })} />)
    expect(r.root.findAll((n) => (n.type as unknown) === 'MiniPlayer')).toHaveLength(0)
    await press(byLabel(r, strings.quiz.replayLine))
    const mp = r.root.find((n) => (n.type as unknown) === 'MiniPlayer')
    expect(mp.props).toMatchObject({ manifestUrl: 'https://cdn.example/zug/master.m3u8', startS: 4, endS: 6, playKey: 1 })
    act(() => { mp.props.onEnd() })
    expect(r.root.findAll((n) => (n.type as unknown) === 'MiniPlayer')).toHaveLength(0)
    expect(labels(render(<Quiz {...props()} />))).not.toContain(strings.quiz.replayLine) // meaning item: no replay
  })
  it('no feedback text contains wrong or failed', async () => {
    const r = render(<Quiz {...props()} />)
    await press(byLabel(r, opt('vier', 3)))
    await press(byLabel(r, strings.quiz.continue))
    await press(byLabel(r, opt('eins', 0)))
    await press(byLabel(r, strings.quiz.continue))
    await flush()
    const all = [...texts(r), ...labels(r)].join(' ')
    expect(all).not.toMatch(/wrong|failed/i)
    expect(all).toContain(strings.quiz.done(0, 2))
  })
  it('the done screen shows the score and the level-up line when the level moved', async () => {
    const onFinish = vi.fn(async () => ({ level: 'B1' as const, changed: 'up' as const }))
    const onNext = vi.fn()
    const r = render(<Quiz {...props({ clip: clipReady({ quiz: [items[0]!] }), onFinish, onNext })} />)
    await press(byLabel(r, opt('vier', 3)))
    await press(byLabel(r, strings.quiz.continue))
    await flush()
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onFinish).toHaveBeenCalledWith({ correct: 0, total: 1 })
    expect(texts(r)).toContain(strings.quiz.done(0, 1))
    expect(texts(r)).toContain(strings.quiz.levelUp('B1'))
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([strings.quiz.next])
    expect(labels(r)).toEqual([strings.quiz.next, strings.quiz.again, strings.quiz.finish])
    await press(byLabel(r, strings.quiz.next))
    expect(onNext).toHaveBeenCalled()
    const same = render(<Quiz {...props({ clip: clipReady({ quiz: [items[0]!] }) })} />)
    await press(byLabel(same, opt('zwei', 1)))
    await act(async () => { await new Promise((res) => setTimeout(res, 650)) })
    expect(texts(same)).toContain(strings.quiz.done(1, 1))
    expect(texts(same).some((t) => t.startsWith('Your level'))).toBe(false)
  })
  it('an empty quiz shows the empty message with Back', async () => {
    const onDone = vi.fn()
    const r = render(<Quiz {...props({ clip: clipReady({ quiz: [] }), onDone })} />)
    expect(texts(r)).toContain(strings.quiz.empty)
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([strings.common.back])
    await press(byLabel(r, strings.common.back))
    expect(onDone).toHaveBeenCalled()
  })
})
