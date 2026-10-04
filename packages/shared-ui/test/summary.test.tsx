import React from 'react'
import { Summary, type SummaryProps } from '../src/screens/Summary'
import { strings } from '../src/strings'
import { tokens } from '../src/theme/tokens'
import { clipReady, hl } from './fixtures'
import { byLabel, flat, is, labels, preferred, render, texts } from './helpers'

const seven = Array.from({ length: 7 }, (_, i) => hl(`h${i}`, `Wort${i}`))
const props = (over: Partial<SummaryProps> = {}): SummaryProps => ({
  clip: clipReady(), saved: seven, lang: 'de', phoneName: null, phoneQuiz: { status: 'idle' }, lastTvQuiz: null,
  onQuizTv: vi.fn(), onQuizPhone: vi.fn(), onAgain: vi.fn(), onNext: vi.fn(), ...over,
})

describe('Summary', () => {
  it('shows "7 neue Wörter" for German and singular for one word', () => {
    const r = render(<Summary {...props()} />)
    expect(texts(r)).toContain('7 neue Wörter')
    const chips = r.root.findAll((n) => is(n, 'View') && n.props.testID === 'saved-chip')
    expect(chips).toHaveLength(7)
    expect(chips.every((c) => flat(c.props.style).backgroundColor === tokens.color.marker && c.findAll((n) => is(n, 'View') && n.props.testID === 'check').length === 1)).toBe(true)
    expect(texts(render(<Summary {...props({ saved: [hl('a', 'Zug')] })} />))).toContain('1 neues Wort')
    expect(texts(render(<Summary {...props({ saved: [hl('a', 'train')], lang: 'en' })} />))).toContain('1 new word')
  })
  it('shows the no-words line when nothing was saved', () => {
    const r = render(<Summary {...props({ saved: [] })} />)
    expect(texts(r)).toContain(strings.summary.none)
    expect(labels(r)).toContain(strings.summary.quizTv) // quiz items are per clip, not per saved word
  })
  it('Quiz on TV has preferred focus; without quiz items Watch again does', () => {
    expect(preferred(render(<Summary {...props()} />)).map((p) => p.props['aria-label'])).toEqual([strings.summary.quizTv])
    const r = render(<Summary {...props({ clip: clipReady({ quiz: [] }) })} />)
    expect(labels(r)).not.toContain(strings.summary.quizTv)
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([strings.summary.again])
  })
  it('Quiz on phone appears only with a connected phone and saved words', () => {
    expect(labels(render(<Summary {...props()} />))).not.toContain(strings.summary.quizPhone)
    expect(labels(render(<Summary {...props({ phoneName: 'Pixel', saved: [] })} />))).not.toContain(strings.summary.quizPhone)
    const onQuizPhone = vi.fn()
    const r = render(<Summary {...props({ phoneName: 'Pixel', onQuizPhone })} />)
    expect(labels(r)).toEqual([strings.summary.quizTv, strings.summary.quizPhone, strings.summary.again, strings.summary.next])
    byLabel(r, strings.summary.quizPhone).props.onPress()
    expect(onQuizPhone).toHaveBeenCalled()
  })
  it('shows the phone quiz status and result', () => {
    expect(texts(render(<Summary {...props({ phoneName: 'Pixel', phoneQuiz: { status: 'sent', clipSlug: 'zug' } })} />))).toContain(strings.summary.phoneSent('Pixel'))
    expect(texts(render(<Summary {...props({ phoneName: 'Pixel', phoneQuiz: { status: 'done', clipSlug: 'zug', correct: 4, total: 5 } })} />))).toContain(strings.summary.phoneResult(4, 5))
    expect(texts(render(<Summary {...props({ lastTvQuiz: { correct: 8, total: 10 } })} />))).toContain(strings.summary.lastQuiz(8, 10))
  })
})
