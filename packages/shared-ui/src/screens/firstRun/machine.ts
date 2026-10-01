import type { Lang, LearnerDto, Level } from '@lingo/contracts'
import { DEFAULT_LEVEL, PLACEMENT, placeLevel, type Answer } from './placement'

export type FirstRunPanel = 'learning' | 'speak' | 'placement' | 'pair'
export interface FirstRunState { panel: FirstRunPanel; learning: Lang; native: string; answers: Answer[]; level: Level | null }
export type FirstRunEvent = { type: 'learning'; lang: Lang } | { type: 'speak'; code: string } | { type: 'answer'; a: Answer } | { type: 'skip' } | { type: 'back' } | { type: 'finish' }
export type FirstRunEffect = { kind: 'profile'; learning: Lang; native: string } | { kind: 'level'; level: Level } | { kind: 'done' } | { kind: 'unhandledBack' }

const other = (l: Lang): Lang => (l === 'de' ? 'en' : 'de')
export function initialFirstRun(l: LearnerDto): FirstRunState {
  return { panel: 'learning', learning: l.learning, native: l.native === l.learning ? other(l.learning) : l.native, answers: [], level: null }
}

/** First run: I'm learning → I speak → placement (six lines or Skip → A2) → pair. Back walks one panel back; on the first panel it is unhandled (the OS exits). */
export function firstRunReduce(s: FirstRunState, e: FirstRunEvent): [FirstRunState, FirstRunEffect[]] {
  switch (s.panel) {
    case 'learning':
      if (e.type === 'learning') return [{ ...s, panel: 'speak', learning: e.lang, native: s.native === e.lang ? other(e.lang) : s.native }, []]
      if (e.type === 'back') return [s, [{ kind: 'unhandledBack' }]]
      break
    case 'speak':
      if (e.type === 'speak') return [{ ...s, panel: 'placement', native: e.code, answers: [] }, [{ kind: 'profile', learning: s.learning, native: e.code }]]
      if (e.type === 'back') return [{ ...s, panel: 'learning' }, []]
      break
    case 'placement': {
      const items = PLACEMENT[s.learning]
      if (e.type === 'answer') {
        const answers = [...s.answers, e.a]
        if (answers.length < items.length) return [{ ...s, answers }, []]
        const level = placeLevel(items, answers)
        return [{ ...s, answers, panel: 'pair', level }, [{ kind: 'level', level }]]
      }
      if (e.type === 'skip') return [{ ...s, panel: 'pair', level: DEFAULT_LEVEL }, [{ kind: 'level', level: DEFAULT_LEVEL }]]
      if (e.type === 'back') return [{ ...s, panel: 'speak', answers: [] }, []]
      break
    }
    case 'pair':
      if (e.type === 'finish') return [s, [{ kind: 'done' }]]
      if (e.type === 'back') return [{ ...s, panel: 'placement', answers: [], level: null }, []]
      break
  }
  return [s, []]
}
