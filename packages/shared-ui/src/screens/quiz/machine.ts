import type { QuizItemDto } from '@lingo/contracts'
/** TV quiz as a pure reducer (docs/plans/LING-005.md §3). No timer on answering; a correct pick auto-advances after 600 ms. */
export type QuizPhase = 'answering' | 'correct' | 'revealed' | 'done'
export interface QuizState { i: number; picked: number | null; correct: number; phase: QuizPhase; replayKey: number; replaying: boolean }
export type QuizEvent = { type: 'pick'; k: number } | { type: 'advance' } | { type: 'continue' } | { type: 'replay' } | { type: 'replayEnd' }
export type QuizEffect = { kind: 'autoAdvance'; ms: number } | { kind: 'finish'; correct: number; total: number }
export const AUTO_ADVANCE_MS = 600

export function initialQuiz(): QuizState { return { i: 0, picked: null, correct: 0, phase: 'answering', replayKey: 0, replaying: false } }

function next(s: QuizState, items: readonly QuizItemDto[]): [QuizState, QuizEffect[]] {
  if (s.i + 1 >= items.length) return [{ ...s, phase: 'done', replaying: false }, [{ kind: 'finish', correct: s.correct, total: items.length }]]
  return [{ ...s, i: s.i + 1, picked: null, phase: 'answering', replaying: false }, []]
}

export function quizReduce(s: QuizState, e: QuizEvent, items: readonly QuizItemDto[]): [QuizState, QuizEffect[]] {
  switch (e.type) {
    case 'pick': {
      const item = items[s.i]
      if (s.phase !== 'answering' || !item) return [s, []]
      return e.k === item.answer
        ? [{ ...s, picked: e.k, correct: s.correct + 1, phase: 'correct' }, [{ kind: 'autoAdvance', ms: AUTO_ADVANCE_MS }]]
        : [{ ...s, picked: e.k, phase: 'revealed' }, []]
    }
    case 'advance': return s.phase === 'correct' ? next(s, items) : [s, []]
    case 'continue': return s.phase === 'revealed' ? next(s, items) : [s, []]
    case 'replay': return s.phase === 'done' ? [s, []] : [{ ...s, replaying: true, replayKey: s.replayKey + 1 }, []]
    case 'replayEnd': return s.replaying ? [{ ...s, replaying: false }, []] : [s, []]
    default: return [s, []]
  }
}

/** correct: shown when the phase is correct|revealed and k is the answer; picked: an incorrect pick in revealed. */
export function optionState(s: QuizState, item: QuizItemDto, k: number): 'idle' | 'correct' | 'picked' {
  if ((s.phase === 'correct' || s.phase === 'revealed') && k === item.answer) return 'correct'
  if (s.phase === 'revealed' && k === s.picked && k !== item.answer) return 'picked'
  return 'idle'
}
