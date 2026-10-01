import type { RemoteKey } from '@moizp/vega-media-kit'
import { initialState, reduce, type PlayerCtx, type PlayerEvent, type PlayerState } from '../src/screens/player/machine'
import { cues } from './fixtures'

// cues: [1,3) gap [4,6) [6.5,9)
const ctx: PlayerCtx = { cues, caps: { rate: true, wordFocusIn: 'cue' }, plus: true, challenge: false, autoPause: false, holdMs: 2000, chromeMs: 4000, graceS: 1 }
const NOW = 10_000
const key = (k: RemoteKey, o: { longPress?: boolean; repeat?: boolean } = {}): PlayerEvent => ({ type: 'key', key: k, longPress: o.longPress ?? false, repeat: o.repeat ?? false, now: NOW })
const at = (s: number, over: Partial<PlayerState> = {}, c: PlayerCtx = ctx): PlayerState => ({ ...reduce(initialState(0), { type: 'position', s, now: 0 }, c)[0], ...over })
const run = (s: PlayerState, events: PlayerEvent[], c: PlayerCtx = ctx) => {
  const effects: unknown[][] = []
  for (const e of events) { const [n, fx] = reduce(s, e, c); s = n; effects.push(fx) }
  return { s, effects }
}

describe('player machine', () => {
  it('initialState is playing with no cue, wordIdx 0, rate 1, stageKey 0', () => {
    expect(initialState(12)).toEqual({ phase: 'playing', positionS: 12, cueIndex: null, wordIdx: 0, rate: 1, revealedCue: null, chromeUntil: 0, heldCue: null, stageKey: 0, ended: false })
  })

  it('position updates cueIndex and clears the Menu reveal when the cue changes', () => {
    let [s, fx] = reduce(initialState(0), { type: 'position', s: 1.5, now: 1 }, ctx)
    expect(s.cueIndex).toBe(0)
    expect(s.positionS).toBe(1.5)
    expect(fx).toEqual([])
    ;[s] = reduce(s, key('menu'), ctx)
    expect(s.revealedCue).toBe(0)
    ;[s] = reduce(s, { type: 'position', s: 2, now: 2 }, ctx)
    expect(s.revealedCue).toBe(0)
    ;[s] = reduce(s, { type: 'position', s: 3.5, now: 3 }, ctx)
    expect(s.cueIndex).toBeNull()
    expect(s.revealedCue).toBeNull()
  })

  it('stage Select pauses and opens Explain on the current cue with wordIdx 0', () => {
    const [s, fx] = reduce(at(4.5, { wordIdx: 1 }), { type: 'stageSelect', now: NOW }, ctx)
    expect(s.phase).toBe('explain')
    expect(s.cueIndex).toBe(1)
    expect(s.wordIdx).toBe(0)
    expect(fx).toEqual([{ kind: 'pause' }])
  })

  it('Play/Pause while playing opens Explain; Play/Pause in Explain resumes and bumps stageKey', () => {
    const { s, effects } = run(at(4.5), [key('playPause'), key('playPause')])
    expect(effects[0]).toEqual([{ kind: 'pause' }])
    expect(effects[1]).toEqual([{ kind: 'play' }])
    expect(s.phase).toBe('playing')
    expect(s.stageKey).toBe(1)
    const [e] = reduce(at(4.5), key('pause'), ctx)
    expect(e.phase).toBe('explain')
  })

  it('short ◄ while playing seeks to the previous cue start and shows chrome', () => {
    const [s, fx] = reduce(at(4.5), key('left'), ctx)
    expect(fx).toEqual([{ kind: 'seek', s: 1 }])
    expect(s.chromeUntil).toBe(NOW + ctx.chromeMs)
    expect(s.phase).toBe('playing')
    const [, fx2] = reduce(at(5.5), key('left'), ctx)
    expect(fx2).toEqual([{ kind: 'seek', s: 4 }])
  })

  it('long ◄ while playing seeks to the current cue start and plays', () => {
    const [s, fx] = reduce(at(4.5), key('left', { longPress: true }), ctx)
    expect(fx).toEqual([{ kind: 'seek', s: 4 }, { kind: 'play' }])
    expect(s.chromeUntil).toBe(NOW + ctx.chromeMs)
  })

  it('long-press repeats change nothing', () => {
    const s0 = at(4.5)
    for (const k of ['left', 'right', 'playPause', 'up', 'menu'] as RemoteKey[]) {
      const [s, fx] = reduce(s0, key(k, { longPress: true, repeat: true }), ctx)
      expect(s).toBe(s0)
      expect(fx).toEqual([])
    }
  })

  it('► after the last cue emits no effect', () => {
    const [, fx] = reduce(at(7), key('right'), ctx)
    expect(fx).toEqual([])
    const [, fx2] = reduce(at(4.5), key('right'), ctx)
    expect(fx2).toEqual([{ kind: 'seek', s: 6.5 }])
  })

  it('Rewind and Fast-forward behave as short ◄ and ►', () => {
    expect(reduce(at(4.5), key('rewind'), ctx)[1]).toEqual(reduce(at(4.5), key('left'), ctx)[1])
    expect(reduce(at(4.5), key('rewind', { longPress: true }), ctx)[1]).toEqual([{ kind: 'seek', s: 1 }])
    expect(reduce(at(4.5), key('fastForward'), ctx)[1]).toEqual([{ kind: 'seek', s: 6.5 }])
    expect(reduce(at(4.5), key('fastForward', { longPress: true }), ctx)[1]).toEqual([{ kind: 'seek', s: 6.5 }])
  })

  it('▲ while playing opens the sheet without pausing; Back closes it with a stageKey bump', () => {
    const { s, effects } = run(at(4.5), [key('up'), { type: 'back', now: NOW }])
    expect(effects[0]).toEqual([])
    expect(effects[1]).toEqual([])
    expect(s.phase).toBe('playing')
    expect(s.stageKey).toBe(1)
    const [sheet] = reduce(at(4.5), key('up'), ctx)
    expect(sheet.phase).toBe('sheet')
    const [closed] = reduce(sheet, { type: 'sheetClose', now: NOW }, ctx)
    expect(closed.phase).toBe('playing')
    expect(closed.stageKey).toBe(1)
  })

  it('Menu toggles the native reveal for the current cue only', () => {
    let [s, fx] = reduce(at(4.5), key('menu'), ctx)
    expect(s.revealedCue).toBe(1)
    expect(fx).toEqual([])
    ;[s] = reduce(s, key('menu'), ctx)
    expect(s.revealedCue).toBeNull()
    ;[s] = reduce(s, key('menu'), ctx)
    ;[s] = reduce(s, { type: 'position', s: 7, now: NOW }, ctx)
    expect(s.cueIndex).toBe(2)
    expect(s.revealedCue).toBeNull()
    const [ex] = reduce(at(4.5, { phase: 'explain' }), key('menu'), ctx)
    expect(ex.revealedCue).toBe(1)
    const [sh] = reduce(at(4.5, { phase: 'sheet' }), key('menu'), ctx)
    expect(sh.revealedCue).toBeNull()
  })

  it('select key events are ignored in every phase', () => {
    for (const phase of ['playing', 'holding', 'explain', 'sheet'] as const) {
      const s0 = at(4.5, { phase })
      const [s, fx] = reduce(s0, key('select'), ctx)
      expect(s).toBe(s0)
      expect(fx).toEqual([])
    }
  })

  it('with autoPause the end of a cue pauses, starts a hold of holdMs and keeps the held cue on screen', () => {
    const c = { ...ctx, autoPause: true }
    const s0 = at(2.8, {}, c)
    expect(s0.cueIndex).toBe(0)
    const [s, fx] = reduce(s0, { type: 'position', s: 3.1, now: NOW }, c)
    expect(s.phase).toBe('holding')
    expect(s.heldCue).toBe(0)
    expect(s.cueIndex).toBe(0)
    expect(fx).toEqual([{ kind: 'pause' }, { kind: 'startHold', ms: 2000 }])
    const [still, fx2] = reduce(s, { type: 'position', s: 3.2, now: NOW }, c)
    expect(still).toBe(s)
    expect(fx2).toEqual([])
    // boundary: a position exactly at the cue's endS holds
    const [edge, fxEdge] = reduce(s0, { type: 'position', s: 3.0, now: NOW }, c)
    expect(edge.phase).toBe('holding')
    expect(fxEdge).toEqual([{ kind: 'pause' }, { kind: 'startHold', ms: 2000 }])
    const [noAuto] = reduce(s0, { type: 'position', s: 3.1, now: NOW }, ctx)
    expect(noAuto.phase).toBe('playing')
    expect(noAuto.cueIndex).toBeNull()
  })

  it('holdElapsed plays again and the same cue does not hold twice', () => {
    const c = { ...ctx, autoPause: true }
    const held = reduce(at(2.8, {}, c), { type: 'position', s: 3.1, now: NOW }, c)[0]
    const [s, fx] = reduce(held, { type: 'holdElapsed', now: NOW }, c)
    expect(s.phase).toBe('playing')
    expect(fx).toEqual([{ kind: 'play' }])
    const [again, fx2] = reduce(s, { type: 'position', s: 3.3, now: NOW }, c)
    expect(again.phase).toBe('playing')
    expect(fx2).toEqual([])
  })

  it('a key during the hold cancels it: Select opens Explain; ◄ seeks and plays; ▲ opens the sheet', () => {
    const c = { ...ctx, autoPause: true }
    const held = reduce(at(2.8, {}, c), { type: 'position', s: 3.1, now: NOW }, c)[0]
    expect(held.phase).toBe('holding')

    const [ex, fx1] = reduce(held, { type: 'stageSelect', now: NOW }, c)
    expect(ex.phase).toBe('explain')
    expect(ex.wordIdx).toBe(0)
    expect(fx1).toEqual([{ kind: 'cancelHold' }])
    for (const k of ['playPause', 'pause'] as RemoteKey[]) {
      const [pp, fxp] = reduce(held, key(k), c)
      expect(pp.phase).toBe('explain')
      expect(fxp).toEqual([{ kind: 'cancelHold' }])
    }

    const [pl, fx2] = reduce(held, key('left'), c)
    expect(pl.phase).toBe('playing')
    expect(fx2).toEqual([{ kind: 'cancelHold' }, { kind: 'seek', s: 1 }, { kind: 'play' }])
    const [, fx2l] = reduce(held, key('left', { longPress: true }), c)
    expect(fx2l).toEqual([{ kind: 'cancelHold' }, { kind: 'seek', s: 1 }, { kind: 'play' }])
    const [, fx2r] = reduce(held, key('right'), c)
    expect(fx2r).toEqual([{ kind: 'cancelHold' }, { kind: 'seek', s: 4 }, { kind: 'play' }])

    const [sh, fx3] = reduce(held, key('up'), c)
    expect(sh.phase).toBe('sheet')
    expect(fx3).toEqual([{ kind: 'cancelHold' }, { kind: 'play' }])

    const [pp, fx4] = reduce(held, { type: 'playerState', s: 'playing', now: NOW }, c)
    expect(pp.phase).toBe('playing')
    expect(fx4).toEqual([{ kind: 'cancelHold' }])
  })

  it('Back in Explain resumes; Back while playing exits with the position; Back in holding cancels and exits', () => {
    const [ex, fx1] = reduce(at(4.5, { phase: 'explain' }), { type: 'back', now: NOW }, ctx)
    expect(ex.phase).toBe('playing')
    expect(ex.stageKey).toBe(1)
    expect(fx1).toEqual([{ kind: 'play' }])
    const [, fx2] = reduce(at(4.5), { type: 'back', now: NOW }, ctx)
    expect(fx2).toEqual([{ kind: 'exit', positionS: 4.5 }])
    const [, fx3] = reduce(at(3.1, { phase: 'holding', heldCue: 0, cueIndex: 0 }), { type: 'back', now: NOW }, ctx)
    expect(fx3).toEqual([{ kind: 'cancelHold' }, { kind: 'exit', positionS: 3.1 }])
  })

  it('focusWord sets wordIdx; replay seeks to the cue start and resumes', () => {
    const ex = reduce(at(5, { phase: 'explain' }), { type: 'focusWord', idx: 1 }, ctx)[0]
    expect(ex.wordIdx).toBe(1)
    const [s, fx] = reduce(ex, { type: 'action', action: 'replay', now: NOW }, ctx)
    expect(s.phase).toBe('playing')
    expect(s.stageKey).toBe(1)
    expect(fx).toEqual([{ kind: 'seek', s: 4 }, { kind: 'play' }])
    const [r, fxr] = reduce(ex, { type: 'action', action: 'resume', now: NOW }, ctx)
    expect(r.phase).toBe('playing')
    expect(fxr).toEqual([{ kind: 'play' }])
  })

  it('slower toggles the rate only when caps.rate and plus; otherwise the state is unchanged and no effect is emitted', () => {
    const ex = at(5, { phase: 'explain' })
    const slower = { type: 'action', action: 'slower', now: NOW } as const
    const [s1, fx1] = reduce(ex, slower, ctx)
    expect(s1.rate).toBe(0.75)
    expect(s1.phase).toBe('explain')
    expect(fx1).toEqual([{ kind: 'rate', r: 0.75 }])
    const [s2, fx2] = reduce(s1, slower, ctx)
    expect(s2.rate).toBe(1)
    expect(fx2).toEqual([{ kind: 'rate', r: 1 }])
    for (const c of [{ ...ctx, plus: false }, { ...ctx, caps: { rate: false, wordFocusIn: 'cue' as const } }]) {
      const [s, fx] = reduce(ex, slower, c)
      expect(s).toBe(ex)
      expect(fx).toEqual([])
    }
  })

  it('an external paused report moves playing to explain; an external playing report moves explain to playing', () => {
    const [ex, fx1] = reduce(at(4.5), { type: 'playerState', s: 'paused', now: NOW }, ctx)
    expect(ex.phase).toBe('explain')
    expect(ex.wordIdx).toBe(0)
    expect(fx1).toEqual([])
    const [pl, fx2] = reduce(ex, { type: 'playerState', s: 'playing', now: NOW }, ctx)
    expect(pl.phase).toBe('playing')
    expect(pl.stageKey).toBe(1)
    expect(fx2).toEqual([])
    for (const st of ['loading', 'ready', 'buffering'] as const) {
      const s0 = at(4.5)
      expect(reduce(s0, { type: 'playerState', s: st, now: NOW }, ctx)).toEqual([s0, []])
    }
  })

  it('ended emits end exactly once', () => {
    const ended = { type: 'playerState', s: 'ended', now: NOW } as const
    const { s, effects } = run(at(8.9), [ended, ended])
    expect(s.ended).toBe(true)
    expect(effects).toEqual([[{ kind: 'end' }], []])
    const [, fx] = reduce(at(8.9, { phase: 'explain' }), ended, ctx)
    expect(fx).toEqual([{ kind: 'end' }])
  })

  it('arrow keys in Explain change nothing', () => {
    const ex = at(4.5, { phase: 'explain' })
    for (const k of ['left', 'right', 'up', 'down', 'select', 'rewind', 'fastForward'] as RemoteKey[]) {
      for (const longPress of [false, true]) {
        const [s, fx] = reduce(ex, key(k, { longPress }), ctx)
        expect(s).toBe(ex)
        expect(fx).toEqual([])
      }
    }
  })

  it('the sheet ignores left and right (the component handles them) and Play/Pause from the sheet opens Explain', () => {
    const sheet = at(4.5, { phase: 'sheet' })
    for (const k of ['left', 'right'] as RemoteKey[]) {
      const [s, fx] = reduce(sheet, key(k), ctx)
      expect(s).toBe(sheet)
      expect(fx).toEqual([])
    }
    const [ex, fx] = reduce(sheet, key('playPause'), ctx)
    expect(ex.phase).toBe('explain')
    expect(ex.wordIdx).toBe(0)
    expect(fx).toEqual([{ kind: 'pause' }])
    const [tracked] = reduce(sheet, { type: 'position', s: 7, now: NOW }, ctx)
    expect(tracked.phase).toBe('sheet')
    expect(tracked.cueIndex).toBe(2)
  })

  it('slower from the sheet toggles the rate with the same gate and keeps the sheet open', () => {
    const sheet = at(4.5, { phase: 'sheet' })
    const slower = { type: 'action', action: 'slower', now: NOW } as const
    const [s, fx] = reduce(sheet, slower, ctx)
    expect(s.phase).toBe('sheet')
    expect(s.rate).toBe(0.75)
    expect(fx).toEqual([{ kind: 'rate', r: 0.75 }])
    expect(reduce(sheet, slower, { ...ctx, plus: false })).toEqual([sheet, []])
    expect(reduce(sheet, { type: 'action', action: 'replay', now: NOW }, ctx)).toEqual([sheet, []])
  })

  it('► with autoPause does not hold the cue that was skipped', () => {
    const c = { ...ctx, autoPause: true }
    const s0 = at(4.5, {}, c)
    expect(s0.cueIndex).toBe(1)
    const [s1, fx1] = reduce(s0, key('right'), c)
    expect(fx1).toEqual([{ kind: 'seek', s: 6.5 }])
    expect(s1.positionS).toBe(6.5)
    expect(s1.cueIndex).toBe(2)
    expect(s1.heldCue).toBeNull()
    const [s2, fx2] = reduce(s1, { type: 'position', s: 6.5, now: NOW }, c)
    expect(s2.phase).toBe('playing')
    expect(fx2).toEqual([])
    // ◄ back across a cue end does not hold the cue being left either
    const [s3] = reduce(at(5.5, {}, c), key('left'), c)
    expect(s3.positionS).toBe(4)
    expect(s3.cueIndex).toBe(1)
  })

  it('replay after a hold auto-pauses again at the line end', () => {
    const c = { ...ctx, autoPause: true }
    const held = reduce(at(2.8, {}, c), { type: 'position', s: 3.1, now: NOW }, c)[0]
    expect(held.heldCue).toBe(0)
    const holdsAgain = (s: PlayerState) => {
      let n = s
      for (const p of [1.5, 2, 2.5]) n = reduce(n, { type: 'position', s: p, now: NOW }, c)[0]
      expect(n.phase).toBe('playing')
      const [h, fx] = reduce(n, { type: 'position', s: 3.05, now: NOW }, c)
      n = h
      expect(n.phase).toBe('holding')
      expect(n.heldCue).toBe(0)
      expect(fx).toEqual([{ kind: 'pause' }, { kind: 'startHold', ms: 2000 }])
    }
    // long ◄ from the hold
    const [viaKey, fxKey] = reduce(held, key('left', { longPress: true }), c)
    expect(fxKey).toEqual([{ kind: 'cancelHold' }, { kind: 'seek', s: 1 }, { kind: 'play' }])
    expect(viaKey).toMatchObject({ phase: 'playing', positionS: 1, cueIndex: 0, heldCue: null })
    holdsAgain(viaKey)
    // Replay from the card
    const ex = reduce(held, { type: 'stageSelect', now: NOW }, c)[0]
    const [viaCard, fxCard] = reduce(ex, { type: 'action', action: 'replay', now: NOW }, c)
    expect(fxCard).toEqual([{ kind: 'seek', s: 1 }, { kind: 'play' }])
    expect(viaCard).toMatchObject({ phase: 'playing', positionS: 1, cueIndex: 0, heldCue: null })
    holdsAgain(viaCard)
  })

  it('a held ► is ignored', () => {
    const s0 = at(4.5)
    const [s, fx] = reduce(s0, key('right', { longPress: true }), ctx)
    expect(s).toBe(s0)
    expect(fx).toEqual([])
  })

  it('with autoPause the sheet stays open across a cue end and nothing pauses', () => {
    const c = { ...ctx, autoPause: true }
    const sheet = at(2.8, { phase: 'sheet' }, c)
    expect(sheet.cueIndex).toBe(0)
    const [s, fx] = reduce(sheet, { type: 'position', s: 3.1, now: NOW }, c)
    expect(s.phase).toBe('sheet')
    expect(fx).toEqual([])
  })

  it('Select in a gap opens Explain on the line that just ended, so cueIndex is never null in the card', () => {
    const gap = at(3.5)
    expect(gap.cueIndex).toBeNull()
    for (const e of [{ type: 'stageSelect', now: NOW }, key('playPause'), { type: 'playerState', s: 'paused', now: NOW }] as PlayerEvent[]) {
      const [s] = reduce(gap, e, ctx)
      expect(s.phase).toBe('explain')
      expect(s.cueIndex).toBe(0)
    }
    const [before] = reduce(at(0.5), { type: 'stageSelect', now: NOW }, ctx)
    expect(before.cueIndex).toBeNull() // nothing has started yet
  })

  it('resuming from a gap does not hold the line Explain showed', () => {
    const c = { ...ctx, autoPause: true }
    const ex = reduce(at(3.4, {}, c), { type: 'stageSelect', now: NOW }, c)[0]
    expect(ex.cueIndex).toBe(0)
    const [back] = reduce(ex, { type: 'back', now: NOW }, c)
    expect(back.cueIndex).toBeNull()
    const [s, fx] = reduce(back, { type: 'position', s: 3.6, now: NOW }, c)
    expect(s.phase).toBe('playing')
    expect(fx).toEqual([])
  })

  it('a stale position after a ► seek does not hold the skipped cue', () => {
    const c = { ...ctx, autoPause: true }
    let s = reduce(at(4.5, {}, c), key('right'), c)[0]
    expect(s.positionS).toBe(6.5)
    let fx: unknown[]
    ;[s, fx] = reduce(s, { type: 'position', s: 4.6, now: NOW }, c) // report from before the seek landed
    expect(fx).toEqual([])
    expect(s.cueIndex).toBe(1)
    ;[s, fx] = reduce(s, { type: 'position', s: 6.5, now: NOW }, c)
    expect(s.phase).toBe('playing')
    expect(s.cueIndex).toBe(2)
    expect(fx).toEqual([])
  })

  it('normal 0.25 s position steps still hold at the line end', () => {
    const c = { ...ctx, autoPause: true }
    let s = at(1, {}, c)
    let fx: unknown[] = []
    for (let p = 1.25; p <= 3.01; p += 0.25) [s, fx] = reduce(s, { type: 'position', s: p, now: NOW }, c)
    expect(s.phase).toBe('holding')
    expect(s.heldCue).toBe(0)
    expect(fx).toEqual([{ kind: 'pause' }, { kind: 'startHold', ms: 2000 }])
    // the step rule: forward 0–1 s is playback; a larger jump is a seek or a stale report
    const [b, fxb] = reduce(at(5.5, {}, c), { type: 'position', s: 6.2, now: NOW }, c)
    expect(b.phase).toBe('holding') // forward 0.7 s: holds cue 1
    expect(fxb).toHaveLength(2)
    const [j, fxj] = reduce(at(5.5, {}, c), { type: 'position', s: 7, now: NOW }, c)
    expect(j.phase).toBe('playing') // forward 1.5 s: a jump, not playback
    expect(fxj).toEqual([])
  })
})
