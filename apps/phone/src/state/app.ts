import type { WordSavedPayload } from '@lingo/contracts'
/** App state machine (pure). Side effects (storage, socket, fetch) live in App.tsx only. */
export type Screen = 'join' | 'live' | 'quiz' | 'progress'
export type LinkState = 'none' | 'joining' | 'joined' | 'reconnecting'
export type Hint = 'badCode' | 'unknownCode' | 'unreachable' | 'cameraOff' | 'invalidChar'
export interface AppState {
  screen: Screen; tv: string | null; pending: string | null; link: LinkState; hint: Hint | null
  saved: WordSavedPayload[]; open: string | null; quizOffer: { clipSlug: string | null } | null; deckClip: string | null
}
export type AppEvent =
  | { type: 'boot'; tv: string | null }               // tv → screen live, link joining; else screen join
  | { type: 'submit'; code: string }                  // pending = code, link joining, hint null
  | { type: 'joined' }                                // tv = pending ?? tv, pending null, link joined, screen join → live
  | { type: 'refused' }                               // tv null, pending null, link none, screen join, hint unknownCode
  | { type: 'unreachable' }                           // link none unless tv (then reconnecting), hint unreachable; screen unchanged
  | { type: 'transport'; up: boolean }                // joined + down → reconnecting; reconnecting + up → joining
  | { type: 'wordSaved'; w: WordSavedPayload }        // append unless savedWordId already present
  | { type: 'quizStart'; clipSlug: string | null }    // quizOffer set; screen unchanged
  | { type: 'toggleWord'; id: string }                // open = open === id ? null : id
  | { type: 'go'; screen: Screen }                    // 'live' with tv null → 'join'; 'quiz' → deckClip = quizOffer?.clipSlug ?? null, quizOffer null
  | { type: 'hint'; hint: Hint | null }
  | { type: 'forgetTv' }                              // tv null, pending null, link none, saved [], open null, quizOffer null, screen join
export const initialApp: AppState = { screen: 'join', tv: null, pending: null, link: 'none', hint: null, saved: [], open: null, quizOffer: null, deckClip: null }
export function appReducer(s: AppState, e: AppEvent): AppState {
  switch (e.type) {
    case 'boot': return e.tv ? { ...s, tv: e.tv, screen: 'live', link: 'joining' } : { ...s, tv: null, screen: 'join' }
    case 'submit': return { ...s, pending: e.code, link: 'joining', hint: null }
    case 'joined': return { ...s, tv: s.pending ?? s.tv, pending: null, link: 'joined', hint: null, screen: s.screen === 'join' ? 'live' : s.screen }
    case 'refused': return { ...s, tv: null, pending: null, link: 'none', screen: 'join', hint: 'unknownCode' }
    case 'unreachable': return { ...s, link: s.tv ? 'reconnecting' : 'none', hint: 'unreachable' }
    case 'transport':
      if (!e.up && s.link === 'joined') return { ...s, link: 'reconnecting' }
      if (e.up && s.link === 'reconnecting') return { ...s, link: 'joining' }
      return s
    case 'wordSaved': return s.saved.some((w) => w.savedWordId === e.w.savedWordId) ? s : { ...s, saved: [...s.saved, e.w] }
    case 'quizStart': return { ...s, quizOffer: { clipSlug: e.clipSlug } }
    case 'toggleWord': return { ...s, open: s.open === e.id ? null : e.id }
    case 'go':
      if (e.screen === 'live' && !s.tv) return { ...s, screen: 'join' }
      if (e.screen === 'quiz') return { ...s, screen: 'quiz', deckClip: s.quizOffer?.clipSlug ?? null, quizOffer: null }
      return { ...s, screen: e.screen }
    case 'hint': return { ...s, hint: e.hint }
    case 'forgetTv': return { ...s, tv: null, pending: null, link: 'none', saved: [], open: null, quizOffer: null, screen: 'join' }
  }
}
