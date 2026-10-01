/**
 * The Player as a pure state machine (docs/plans/LING-003.md §State machine). `reduce` is total: an unknown (state, event) pair
 * returns the same state object and no effects. Player.tsx applies the effects in order.
 */
import type { CueDto } from '@lingo/contracts'
import type { RemoteKey } from '@moizp/vega-media-kit'
import type { Caps } from '../../platformCaps'
import { cueAt, seekTarget } from './seek'

export type Phase = 'playing' | 'holding' | 'explain' | 'sheet'
export interface PlayerCtx { cues: readonly CueDto[]; caps: Caps; plus: boolean; challenge: boolean; autoPause: boolean; holdMs: number; chromeMs: number; graceS: number }
export interface PlayerState {
  phase: Phase; positionS: number; cueIndex: number | null; wordIdx: number; rate: 1 | 0.75
  revealedCue: number | null; chromeUntil: number; heldCue: number | null; stageKey: number; ended: boolean
}
export type PlayerEvent =
  | { type: 'position'; s: number; now: number }
  | { type: 'playerState'; s: 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'ended'; now: number }
  | { type: 'key'; key: RemoteKey; longPress: boolean; repeat: boolean; now: number }
  | { type: 'stageSelect'; now: number }
  | { type: 'back'; now: number }
  | { type: 'focusWord'; idx: number }
  | { type: 'action'; action: 'replay' | 'slower' | 'resume'; now: number }
  | { type: 'holdElapsed'; now: number }
  | { type: 'sheetClose'; now: number }
export type Effect =
  | { kind: 'seek'; s: number } | { kind: 'play' } | { kind: 'pause' } | { kind: 'rate'; r: 1 | 0.75 }
  | { kind: 'startHold'; ms: number } | { kind: 'cancelHold' } | { kind: 'end' } | { kind: 'exit'; positionS: number }

type Result = [PlayerState, Effect[]]
type KeyEvent = Extract<PlayerEvent, { type: 'key' }>

export function initialState(startAt: number): PlayerState {
  return { phase: 'playing', positionS: startAt, cueIndex: null, wordIdx: 0, rate: 1, revealedCue: null, chromeUntil: 0, heldCue: null, stageKey: 0, ended: false }
}

const chrome = (s: PlayerState, now: number, ctx: PlayerCtx): PlayerState => ({ ...s, chromeUntil: now + ctx.chromeMs })
const toExplain = (s: PlayerState, now: number, ctx: PlayerCtx): PlayerState => chrome({ ...s, phase: 'explain', wordIdx: 0 }, now, ctx)
/** Leaving the card or the sheet remounts the stage Pressable (stageKey bump) so hasTVPreferredFocus applies again (decision 0006 §5). */
const backToStage = (s: PlayerState, now: number, ctx: PlayerCtx): PlayerState => chrome({ ...s, phase: 'playing', stageKey: s.stageKey + 1 }, now, ctx)
const toggleReveal = (s: PlayerState, now: number, ctx: PlayerCtx): PlayerState =>
  chrome({ ...s, revealedCue: s.revealedCue === s.cueIndex ? null : s.cueIndex }, now, ctx)

function ended(s: PlayerState): Result {
  return s.ended ? [s, []] : [{ ...s, ended: true }, [{ kind: 'end' }]]
}

/** Position tracking; `hold` false while the sheet is open so an auto-pause never pulls the sheet away from the learner. */
function track(s: PlayerState, pos: number, now: number, ctx: PlayerCtx, hold: boolean): Result {
  const old = s.cueIndex
  let next: PlayerState = { ...s, positionS: pos, cueIndex: cueAt(ctx.cues, pos) }
  const effects: Effect[] = []
  if (hold && ctx.autoPause && old !== null && s.heldCue !== old) {
    const c = ctx.cues[old]
    if (c && pos >= c.endS) {
      next = chrome({ ...next, phase: 'holding', heldCue: old, cueIndex: old }, now, ctx)
      effects.push({ kind: 'pause' }, { kind: 'startHold', ms: ctx.holdMs })
    }
  }
  if (next.cueIndex !== old && next.revealedCue !== next.cueIndex) next = { ...next, revealedCue: null }
  return [next, effects]
}

/** Seek keys in the playing phase. Returns null when the key is not a seek key or the press is ignored (► held). */
function seekKey(s: PlayerState, e: KeyEvent, ctx: PlayerCtx): Result | null {
  const c = chrome(s, e.now, ctx)
  if (e.key === 'left' && e.longPress) return [c, [{ kind: 'seek', s: seekTarget(ctx.cues, s.positionS, 'replay', ctx.graceS) ?? 0 }, { kind: 'play' }]]
  if (e.key === 'left' || e.key === 'rewind') return [c, [{ kind: 'seek', s: seekTarget(ctx.cues, s.positionS, 'prev', ctx.graceS) ?? 0 }]]
  if (e.key === 'right' && e.longPress) return null
  if (e.key === 'right' || e.key === 'fastForward') {
    const t = seekTarget(ctx.cues, s.positionS, 'next', ctx.graceS)
    return [c, t === null ? [] : [{ kind: 'seek', s: t }]]
  }
  return null
}

function playing(s: PlayerState, e: PlayerEvent, ctx: PlayerCtx): Result {
  switch (e.type) {
    case 'position': return track(s, e.s, e.now, ctx, true)
    case 'stageSelect': return [toExplain(s, e.now, ctx), [{ kind: 'pause' }]]
    case 'back': return [s, [{ kind: 'exit', positionS: s.positionS }]]
    case 'playerState':
      if (e.s === 'paused') return [toExplain(s, e.now, ctx), []]
      if (e.s === 'ended') return ended(s)
      return [s, []]
    case 'key': {
      const seek = seekKey(s, e, ctx)
      if (seek) return seek
      if (e.key === 'playPause' || e.key === 'pause') return [toExplain(s, e.now, ctx), [{ kind: 'pause' }]]
      if (e.key === 'up') return [chrome({ ...s, phase: 'sheet' }, e.now, ctx), []]
      if (e.key === 'menu') return [toggleReveal(s, e.now, ctx), []]
      return [s, []]
    }
    default: return [s, []]
  }
}

function holding(s: PlayerState, e: PlayerEvent, ctx: PlayerCtx): Result {
  switch (e.type) {
    case 'holdElapsed': return [chrome({ ...s, phase: 'playing' }, e.now, ctx), [{ kind: 'play' }]]
    case 'stageSelect': return [toExplain(s, e.now, ctx), [{ kind: 'cancelHold' }]]
    case 'back': return [s, [{ kind: 'cancelHold' }, { kind: 'exit', positionS: s.positionS }]]
    case 'playerState':
      if (e.s === 'playing') return [chrome({ ...s, phase: 'playing' }, e.now, ctx), [{ kind: 'cancelHold' }]]
      if (e.s === 'ended') return ended(s)
      return [s, []]
    case 'key': {
      if (e.key === 'playPause' || e.key === 'pause') return [toExplain(s, e.now, ctx), [{ kind: 'cancelHold' }]]
      if (e.key === 'up') return [chrome({ ...s, phase: 'sheet' }, e.now, ctx), [{ kind: 'cancelHold' }, { kind: 'play' }]]
      if (e.key === 'menu') return [toggleReveal(s, e.now, ctx), []]
      const seek = seekKey({ ...s, phase: 'playing' }, e, ctx)
      if (!seek) return [s, []]
      const [next, fx] = seek
      const tail: Effect[] = fx.some((f) => f.kind === 'play') ? [] : [{ kind: 'play' }]
      return [next, [{ kind: 'cancelHold' }, ...fx, ...tail]]
    }
    default: return [s, []]
  }
}

function explain(s: PlayerState, e: PlayerEvent, ctx: PlayerCtx): Result {
  switch (e.type) {
    case 'focusWord': return [{ ...s, wordIdx: e.idx }, []]
    case 'action':
      if (e.action === 'replay') return [backToStage(s, e.now, ctx), [{ kind: 'seek', s: seekTarget(ctx.cues, s.positionS, 'replay', ctx.graceS) ?? 0 }, { kind: 'play' }]]
      if (e.action === 'resume') return [backToStage(s, e.now, ctx), [{ kind: 'play' }]]
      // slower: the card shows the upsell line itself when the rate is not available (free tier or Vega).
      if (ctx.caps.rate && ctx.plus) {
        const r: 1 | 0.75 = s.rate === 1 ? 0.75 : 1
        return [chrome({ ...s, rate: r }, e.now, ctx), [{ kind: 'rate', r }]]
      }
      return [s, []]
    case 'back':
    case 'sheetClose': return [backToStage(s, e.now, ctx), [{ kind: 'play' }]]
    case 'playerState':
      if (e.s === 'playing') return [backToStage(s, e.now, ctx), []]
      if (e.s === 'ended') return ended(s)
      return [s, []]
    case 'key':
      if (e.key === 'playPause' || e.key === 'play') return [backToStage(s, e.now, ctx), [{ kind: 'play' }]]
      if (e.key === 'menu') return [toggleReveal(s, e.now, ctx), []]
      return [s, []] // native focus owns the card
    default: return [s, []]
  }
}

function sheet(s: PlayerState, e: PlayerEvent, ctx: PlayerCtx): Result {
  switch (e.type) {
    case 'back':
    case 'sheetClose': return [backToStage(s, e.now, ctx), []]
    case 'position': return track(s, e.s, e.now, ctx, false)
    case 'playerState':
      if (e.s === 'paused') return [toExplain(s, e.now, ctx), []]
      if (e.s === 'ended') return ended(s)
      return [s, []]
    case 'key':
      if (e.key === 'playPause' || e.key === 'pause') return [toExplain(s, e.now, ctx), [{ kind: 'pause' }]]
      return [s, []] // left/right go to SettingsSheetHandle.cycle; up/down are native focus
    default: return [s, []]
  }
}

export function reduce(s: PlayerState, e: PlayerEvent, ctx: PlayerCtx): Result {
  // Select arrives through the stage Pressable's onPress; key events named select are dropped. Held-key repeats never act.
  if (e.type === 'key' && (e.key === 'select' || e.repeat)) return [s, []]
  switch (s.phase) {
    case 'playing': return playing(s, e, ctx)
    case 'holding': return holding(s, e, ctx)
    case 'explain': return explain(s, e, ctx)
    case 'sheet': return sheet(s, e, ctx)
  }
}
