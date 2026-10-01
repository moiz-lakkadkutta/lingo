import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Animated, BackHandler, findNodeHandle, Pressable, View } from 'react-native'
import { KitPlayer } from '@moizp/vega-media-kit'
import type { KitPlayerRef, RemoteEvent } from '@moizp/vega-media-kit'
import type { ClipDetail, LearnerDto } from '@lingo/contracts'
import { DualCue } from '../components'
import { caps as platformCaps, type Caps } from '../platformCaps'
import type { RemoteSource } from '../remote/types'
import { useRemoteKeys } from '../remote/useRemoteKeys'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
import { Explain } from './Explain'
import { alignHighlights } from './player/align'
import { initialState, reduce, type Effect, type PlayerCtx, type PlayerEvent, type PlayerState } from './player/machine'
import { SettingsSheet, type SettingsSheetHandle } from './player/SettingsSheet'
import { StatusLine } from './player/StatusLine'
import { nativeVisible, statusParts } from './player/visibility'

export interface PlayerProps {
  clip: ClipDetail; learner: LearnerDto; scale: number; challenge: boolean; sessionCode?: string
  savedIds: ReadonlySet<string>; savedCount: number; remote: RemoteSource; caps?: Caps
  onBack(positionS: number): void; onEnd(): void
  onSave(highlightId: string): Promise<'saved' | 'limit' | 'error'>; onPlus(): void
  onLearnerChange(patch: Partial<Pick<LearnerDto, 'nativeLine' | 'cueScale'>>): void
}

const REPORTED = new Set(['loading', 'ready', 'playing', 'paused', 'buffering', 'ended'])

/**
 * Thin shell over the pure machine (screens/player/machine.ts): events in, effects out (LING-003, decision 0006).
 * Dual cues are rendered by DualCue from the clip payload, so highlights and native text always align.
 */
export function Player(props: PlayerProps) {
  const { clip, learner, challenge, savedIds, savedCount, remote, onSave, onPlus, onLearnerChange } = props
  const caps = props.caps ?? platformCaps
  const kit = useRef<KitPlayerRef>(null)
  const sheetRef = useRef<SettingsSheetHandle>(null)
  const chipRefs = useRef<Array<View | null>>([])
  const saveRef = useRef<View>(null)
  const hold = useRef(new Animated.Value(0)).current
  const holdAnim = useRef<Animated.CompositeAnimation | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [state, setState] = useState<PlayerState>(() => initialState(clip.resumeS ?? 0))
  const stateRef = useRef(state)
  const ctx = useMemo<PlayerCtx>(() => ({
    cues: clip.cues, caps, plus: learner.plus, challenge, autoPause: learner.autoPause,
    holdMs: tokens.motion.autoPauseHoldMs, chromeMs: tokens.motion.overlayHideMs, graceS: tokens.motion.seekGraceS,
  }), [clip.cues, caps, learner.plus, challenge, learner.autoPause])
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const propsRef = useRef(props)
  propsRef.current = props

  const clearHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
    holdAnim.current?.stop()
    holdAnim.current = null
    hold.setValue(0)
  }, [hold])

  const dispatch = useCallback((e: PlayerEvent): void => {
    const [next, effects] = reduce(stateRef.current, e, ctxRef.current)
    if (next !== stateRef.current) { stateRef.current = next; setState(next) }
    effects.forEach((fx: Effect) => {
      switch (fx.kind) {
        case 'seek': kit.current?.seek(fx.s); break
        case 'play': kit.current?.play(); break
        case 'pause': kit.current?.pause(); break
        case 'rate': kit.current?.setRate(fx.r); break
        case 'startHold':
          clearHold()
          holdAnim.current = Animated.timing(hold, { toValue: 1, duration: fx.ms, useNativeDriver: false })
          holdAnim.current.start()
          holdTimer.current = setTimeout(() => dispatch({ type: 'holdElapsed', now: Date.now() }), fx.ms)
          break
        case 'cancelHold': clearHold(); break
        case 'end': propsRef.current.onEnd(); break
        case 'exit': propsRef.current.onBack(fx.positionS); break
      }
    })
  }, [clearHold, hold])
  useEffect(() => clearHold, [clearHold])

  // Remote keys: select arrives through the stage Pressable; left/right in the sheet cycle the focused row.
  const onKey = useCallback((ev: RemoteEvent) => {
    if (ev.key === 'select') return
    if (stateRef.current.phase === 'sheet' && (ev.key === 'left' || ev.key === 'right')) {
      if (!ev.repeat) sheetRef.current?.cycle(ev.key === 'left' ? -1 : 1)
      return
    }
    dispatch({ type: 'key', key: ev.key, longPress: ev.longPress, repeat: ev.repeat, now: Date.now() })
  }, [dispatch])
  useRemoteKeys(remote, onKey, true)

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { dispatch({ type: 'back', now: Date.now() }); return true })
    return () => sub.remove()
  }, [dispatch])

  // Chrome (status line) hides at chromeUntil; re-render then.
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const wait = state.chromeUntil - Date.now()
    if (wait <= 0) return
    const t = setTimeout(tick, wait)
    return () => clearTimeout(t)
  }, [state.chromeUntil])
  const chromeVisible = state.phase !== 'playing' || Date.now() < state.chromeUntil

  // The machine keeps cueIndex on the line that just ended when Select lands in a gap.
  const shownIdx = state.cueIndex
  const cue = shownIdx !== null ? clip.cues[shownIdx] ?? null : null
  const alignment = useMemo(() => (cue ? alignHighlights(cue.text, cue.highlights) : null), [cue])
  const alignmentOk = !!alignment && alignment.unmatched.length === 0
  const wordFocus: 'cue' | 'card' = caps.wordFocusIn === 'cue' && alignmentOk ? 'cue' : 'card'
  const explaining = state.phase === 'explain' && !!cue
  const highlight = cue ? cue.highlights[state.wordIdx] ?? cue.highlights[0] ?? null : null

  // Chips → Save (▼) needs the Save node handle once the card has mounted.
  const [saveHandle, setSaveHandle] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    setSaveHandle(explaining && saveRef.current ? findNodeHandle(saveRef.current) ?? undefined : undefined)
  }, [explaining, shownIdx])

  // The card sits above the measured cue block; px(300) until the first layout.
  const [cueBlockH, setCueBlockH] = useState<number | null>(null)
  const cardBottom = cueBlockH === null ? px(300) : px(tokens.layout.safeY) + cueBlockH + px(24)

  // Paused before the first line (machine.toExplain): no card, so the stage keeps focus and Select resumes.
  const pausedNoCue = state.phase === 'explain' && !cue
  const stageActive = state.phase === 'playing' || state.phase === 'holding' || pausedNoCue
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.stage }}>
      <KitPlayer
        ref={kit}
        source={{ uri: clip.manifestUrl, type: 'hls' }}
        autoplay
        startAt={clip.resumeS ?? 0}
        onPosition={(s) => dispatch({ type: 'position', s, now: Date.now() })}
        onState={(s) => { if (REPORTED.has(s)) dispatch({ type: 'playerState', s: s as Extract<PlayerEvent, { type: 'playerState' }>['s'], now: Date.now() }) }}
      />
      <Pressable
        key={state.stageKey}
        aria-label={pausedNoCue ? strings.player.stagePaused : strings.player.stage}
        hasTVPreferredFocus={state.phase === 'playing' || pausedNoCue}
        focusable={stageActive}
        pointerEvents={stageActive ? 'auto' : 'none'}
        onPress={() => dispatch({ type: 'stageSelect', now: Date.now() })}
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, outlineWidth: 0 }}
      />
      {explaining ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: tokens.color.scrim }} /> : null}
      <DualCue
        onBlockLayout={setCueBlockH}
        cue={cue}
        alignment={alignment}
        nativeVisible={nativeVisible({ setting: learner.nativeLine, challenge, paused: state.phase === 'explain' || state.phase === 'holding', revealedCue: state.revealedCue, cueIndex: shownIdx })}
        wordFocus={explaining ? wordFocus : 'card'}
        focusedIdx={explaining ? state.wordIdx : null}
        onFocusWord={(idx) => dispatch({ type: 'focusWord', idx })}
        savedIds={savedIds}
        userScale={learner.cueScale}
        hold={state.phase === 'holding' ? hold : null}
        nextFocusDown={saveHandle}
        chipRefs={wordFocus === 'cue' ? chipRefs : undefined}
      />
      <StatusLine parts={pausedNoCue ? [...statusParts({ challenge, rate: state.rate }), strings.player.pausedHint] : statusParts({ challenge, rate: state.rate })} visible={chromeVisible} />
      {explaining && cue ? (
        <Explain
          cue={cue}
          highlight={highlight}
          alignmentOk={alignmentOk}
          wordFocus={wordFocus}
          focusedIdx={state.wordIdx}
          onFocusWord={(idx) => dispatch({ type: 'focusWord', idx })}
          savedIds={savedIds}
          savedCount={savedCount}
          plus={learner.plus}
          caps={caps}
          rate={state.rate}
          onSave={onSave}
          onReplay={() => dispatch({ type: 'action', action: 'replay', now: Date.now() })}
          onSlower={() => dispatch({ type: 'action', action: 'slower', now: Date.now() })}
          onPlus={onPlus}
          chipRefs={chipRefs}
          saveRef={saveRef}
          bottom={cardBottom}
        />
      ) : null}
      {state.phase === 'sheet' ? (
        <SettingsSheet
          ref={sheetRef}
          caps={caps}
          plus={learner.plus}
          rate={state.rate}
          nativeLine={learner.nativeLine}
          cueScale={learner.cueScale}
          onRate={(r) => { if (r !== stateRef.current.rate) dispatch({ type: 'action', action: 'slower', now: Date.now() }) }}
          onLearnerChange={onLearnerChange}
        />
      ) : null}
    </View>
  )
}
