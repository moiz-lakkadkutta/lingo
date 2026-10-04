/**
 * The Player as a pure state machine (docs/plans/LING-003.md §State machine). `reduce` is total: an unknown (state, event) pair
 * returns the same state object and no effects. Player.tsx applies the effects in order.
 */
import type { CueDto } from '@lingo/contracts'
import type { RemoteKey } from '@moizp/vega-media-kit'
import type { Caps } from '../../platformCaps'
import { cueAt, lastStartedCue, seekTarget } from './seek'

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
/** onPosition arrives at ≤ 4 Hz; anything beyond 1 s between two reports is not playback. */
const MAX_PLAY_STEP_S = 1
type KeyEvent = Extract<PlayerEvent, { type: 'key' }>

export function initialState(startAt: number): PlayerState {
  return { phase: 'playing', positionS: startAt, cueIndex: null, wordIdx: 0, rate: 1, revealedCue: null, chromeUntil: 0, heldCue: null, stageKey: 0, ended: false }
}

const chrome = (s: PlayerState, now: number, ctx: PlayerCtx): PlayerState => ({ ...s, chromeUntil: now + ctx.chromeMs })
/**
 * In a gap between lines the card explains the line that just ended, so cueIndex is never null while a cue is shown.
 * Before the first line there is nothing to explain: cueIndex stays null, no card renders, and Player.tsx keeps the stage
 * focusable with a hint so Select (or Play) resumes. That is the only way into explain with cueIndex null.
 */
const toExplain = (s: PlayerState, now: number, ctx: PlayerCtx): PlayerState =>
  chrome({ ...s, phase: 'explain', wordIdx: 0, cueIndex: s.cueIndex ?? lastStartedCue(ctx.cues, s.positionS) }, now, ctx)
/**
 * Leaving the card or the sheet remounts the stage Pressable (stageKey bump) so hasTVPreferredFocus applies again (decision 0006 §5).
 * cueIndex goes back to the cue under the playhead, so a line the card kept on screen (gap, hold) is not held on resume.
 */
const backToStage = (s: PlayerState, now: number, ctx: PlayerCtx): PlayerState =>
  chrome({ ...s, phase: 'playing', stageKey: s.stageKey + 1, cueIndex: cueAt(ctx.cues, s.positionS) }, now, ctx)
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
  // Only continuous playback holds: a forward step of 0–1 s. A larger or backward jump is a seek or a stale report from before one.
  const step = pos - s.positionS
  if (hold && ctx.autoPause && old !== null && s.heldCue !== old && step >= 0 && step <= MAX_PLAY_STEP_S) {
    const c = ctx.cues[old]
    if (c && pos >= c.endS) {
      next = chrome({ ...next, phase: 'holding', heldCue: old, cueIndex: old }, now, ctx)
      effects.push({ kind: 'pause' }, { kind: 'startHold', ms: ctx.holdMs })
    }
  }
  if (next.cueIndex !== old && next.revealedCue !== next.cueIndex) next = { ...next, revealedCue: null }
  return [next, effects]
}

/**
 * Every row that emits seek(t) also moves the state to t: positionS = t, cueIndex = cueAt(t), heldCue = null. Without this the
 * next position report is read against the cue being left (► would hold the skipped line) and a replayed line would never hold again.
 */
function seekTo(s: PlayerState, t: number, ctx: PlayerCtx): [PlayerState, Effect] {
  const cueIndex = cueAt(ctx.cues, t)
  const revealedCue = cueIndex !== s.cueIndex && s.revealedCue !== cueIndex ? null : s.revealedCue
  return [{ ...s, positionS: t, cueIndex, heldCue: null, revealedCue }, { kind: 'seek', s: t }]
}

/** Seek keys in the playing phase. Returns null when the key is not a seek key or the press is ignored (► held). */
function seekKey(s: PlayerState, e: KeyEvent, ctx: PlayerCtx): Result | null {
  const c = chrome(s, e.now, ctx)
  if (e.key === 'left' && e.longPress) {
    const [n, fx] = seekTo(c, seekTarget(ctx.cues, s.positionS, 'replay', ctx.graceS) ?? 0, ctx)
    return [n, [fx, { kind: 'play' }]]
  }
  if (e.key === 'left' || e.key === 'rewind') {
    const [n, fx] = seekTo(c, seekTarget(ctx.cues, s.positionS, 'prev', ctx.graceS) ?? 0, ctx)
    return [n, [fx]]
  }
  if (e.key === 'right' && e.longPress) return null // ► held is ignored
  if (e.key === 'right' || e.key === 'fastForward') {
    const t = seekTarget(ctx.cues, s.positionS, 'next', ctx.graceS)
    if (t === null) return [c, []]
    const [n, fx] = seekTo(c, t, ctx)
    return [n, [fx]]
  }
  return null
}

/** Toggle 1× ↔ 0.75× only where the adapter can honour it and the learner has Plus; otherwise nothing (the UI shows the upsell line). */
function slower(s: PlayerState, now: number, ctx: PlayerCtx): Result {
  if (!ctx.caps.rate || !ctx.plus) return [s, []]
  const r: 1 | 0.75 = s.rate === 1 ? 0.75 : 1
  return [chrome({ ...s, rate: r }, now, ctx), [{ kind: 'rate', r }]]
}

function playing(s: PlayerState, e: PlayerEvent, ctx: PlayerCtx): Result {
  switch (e.type) {
    case 'position': return track(s, e.s, e.now, ctx, true)
    case 'stageSelect':
      // Select asks for the line under the playhead; before the first line there is none, so keep playing and show the chrome.
      if (s.cueIndex === null && lastStartedCue(ctx.cues, s.positionS) === null) return [chrome(s, e.now, ctx), []]
      return [toExplain(s, e.now, ctx), [{ kind: 'pause' }]]
    case 'back': return [s, [{ kind: 'exit', positionS: s.positionS }]]
    case 'playerState':
      if (e.s === 'paused') return [toExplain(s, e.now, ctx), []]
      if (e.s === 'ended') return ended(s)
      return [s, []]
    case 'key': {
      const seek = seekKey(s, e, ctx)
      if (seek) return seek
      // pause only ever pauses; play only resumes, and only from explain (it is ignored here and while holding).
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
    // Only reachable with no card (paused before the first line): the stage keeps focus and Select resumes.
    case 'stageSelect': return s.cueIndex === null ? [backToStage(s, e.now, ctx), [{ kind: 'play' }]] : [s, []]
    case 'action':
      if (e.action === 'replay') {
        const [n, fx] = seekTo(backToStage(s, e.now, ctx), seekTarget(ctx.cues, s.positionS, 'replay', ctx.graceS) ?? 0, ctx)
        return [n, [fx, { kind: 'play' }]]
      }
      if (e.action === 'resume') return [backToStage(s, e.now, ctx), [{ kind: 'play' }]]
      return slower(s, e.now, ctx)
    case 'back':
    case 'sheetClose': return [backToStage(s, e.now, ctx), [{ kind: 'play' }]]
    case 'playerState':
      if (e.s === 'playing') return [backToStage(s, e.now, ctx), []]
      if (e.s === 'ended') return ended(s)
      return [s, []]
    case 'key':
      // play resumes only from here; pause in the card is ignored (already paused).
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
    case 'action': return e.action === 'slower' ? slower(s, e.now, ctx) : [s, []] // the sheet's Speed row
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
  // Held-key repeats never act. Key events named select fall through to [s, []] in every phase:
  // Select arrives through the stage Pressable's onPress instead.
  if (e.type === 'key' && e.repeat) return [s, []]
  switch (s.phase) {
    case 'playing': return playing(s, e, ctx)
    case 'holding': return holding(s, e, ctx)
    case 'explain': return explain(s, e, ctx)
    case 'sheet': return sheet(s, e, ctx)
  }
}
