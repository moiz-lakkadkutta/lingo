import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import type { ClipDetail, LevelResult } from '@lingo/contracts'
import { Button, Focusable, MiniPlayer, Screen, StateMessage, T } from '../components'
import { Check } from '../components/Check'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
import { initialQuiz, optionState, quizReduce, type QuizEvent, type QuizState } from './quiz/machine'

export interface QuizProps {
  /** items, cues (native line, replay span), manifestUrl */ clip: ClipDetail
  /** Root: PUT /me/level; null on failure (the result is still shown) */ onFinish(r: { correct: number; total: number }): Promise<LevelResult | null>
  onNext(): void; onAgain(): void; onDone(): void
}

/**
 * TV quiz shell over quiz/machine.ts: one item per screen, prompt 44 px, 2×2 grid of 640×140 options, "3 of 10" top-right, no timer.
 * Correct: blue ring + check, 600 ms auto-advance. Incorrect: coral ring on the pick, the answer ringed, waits for Continue.
 */
export function Quiz({ clip, onFinish, onNext, onAgain, onDone }: QuizProps) {
  const items = clip.quiz
  const [s, setS] = useState<QuizState>(initialQuiz)
  const sRef = useRef(s)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finished = useRef(false)
  const [result, setResult] = useState<{ correct: number; total: number; level: LevelResult | null } | null>(null)
  const onFinishRef = useRef(onFinish); onFinishRef.current = onFinish

  const dispatch = useCallback((e: QuizEvent) => {
    const [next, effects] = quizReduce(sRef.current, e, items)
    sRef.current = next
    setS(next)
    for (const fx of effects) {
      if (fx.kind === 'autoAdvance') {
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => { timer.current = null; dispatch({ type: 'advance' }) }, fx.ms)
      } else if (fx.kind === 'finish' && !finished.current) {
        finished.current = true
        const r = { correct: fx.correct, total: fx.total }
        setResult({ ...r, level: null })
        onFinishRef.current(r).then((level) => setResult({ ...r, level }), () => {})
      }
    }
  }, [items])
  // Clear the auto-advance on item change and on unmount.
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }, [s.i])

  if (!items.length) return <Screen><StateMessage title={strings.quiz.empty} actions={[{ label: strings.common.back, text: strings.common.back, onPress: onDone }]} /></Screen>

  if (s.phase === 'done') {
    const r = result ?? { correct: s.correct, total: items.length, level: null }
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: px(24) }}>
          <T variant="display" accessibilityLiveRegion="polite">{strings.quiz.done(r.correct, r.total)}</T>
          {r.level?.changed === 'up' ? <T variant="title" color={tokens.color.interactive}>{strings.quiz.levelUp(r.level.level)}</T> : null}
          <View style={{ flexDirection: 'row', gap: px(16), marginTop: px(16) }}>
            <Button primary preferred label={strings.quiz.next} text={strings.quiz.next} onPress={onNext} />
            <Button label={strings.quiz.again} text={strings.quiz.again} onPress={onAgain} />
            <Button label={strings.quiz.finish} text={strings.quiz.finish} onPress={onDone} />
          </View>
        </View>
      </Screen>
    )
  }

  const item = items[s.i]!
  const cue = item.cueIndex !== null ? clip.cues.find((c) => c.index === item.cueIndex) ?? null : null
  const answer = item.options[item.answer]!
  const replayable = item.kind === 'cloze' && cue !== null
  return (
    <Screen>
      <View style={{ flex: 1, gap: px(32) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T variant="label" color={tokens.color.textSecondary}>{item.kind === 'cloze' ? strings.quiz.clozeKind : strings.quiz.meaningKind}</T>
          <T variant="label" color={tokens.color.textSecondary}>{strings.quiz.progress(s.i + 1, items.length)}</T>
        </View>
        <T variant="cueTarget" style={{ maxWidth: px(1000) }}>{item.prompt}</T>
        <View key={item.id} testID="quiz-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: px(20), maxWidth: px(1320) }}>
          {item.options.map((o, k) => {
            const st = optionState(s, item, k)
            return (
              <Focusable
                key={k} label={strings.quiz.optionLabel(o, k + 1, item.options.length)} hasTVPreferredFocus={k === 0 && s.phase !== 'revealed'}
                onPress={() => dispatch({ type: 'pick', k })} selected={st === 'correct'}
                style={{ width: px(640), height: px(140), flexDirection: 'row', alignItems: 'center', gap: px(12), paddingHorizontal: px(28), backgroundColor: tokens.color.surface2, ...(st === 'picked' ? { borderColor: tokens.color.incorrect, borderWidth: px(3) } : {}) }}
              >
                {st === 'correct' ? <Check size={px(32)} color={tokens.color.interactive} /> : null}
                <T variant="body">{o}</T>
              </Focusable>
            )
          })}
        </View>
        <View accessibilityLiveRegion="polite" style={{ gap: px(8), minHeight: px(44) }}>
          {s.phase === 'correct' ? <T variant="body">{strings.quiz.right(answer)}</T> : null}
          {s.phase === 'revealed' ? <T variant="body">{strings.quiz.answerIs(answer)}</T> : null}
          {s.phase === 'revealed' && item.kind === 'meaning' && cue?.native ? <T variant="body" color={tokens.color.nativeCue}>{strings.quiz.inClip(cue.native)}</T> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: px(16) }}>
          {replayable ? <Button label={strings.quiz.replayLine} text={strings.quiz.replayLine} onPress={() => dispatch({ type: 'replay' })} /> : null}
          {s.phase === 'revealed' ? <Button key={`continue-${item.id}`} primary preferred label={strings.quiz.continue} text={strings.quiz.continue} onPress={() => dispatch({ type: 'continue' })} /> : null}
        </View>
      </View>
      {replayable && s.replaying ? (
        <View style={{ position: 'absolute', top: px(0), right: px(0) }}>
          <MiniPlayer manifestUrl={clip.manifestUrl} startS={cue!.startS} endS={cue!.endS} playKey={s.replayKey} onEnd={() => dispatch({ type: 'replayEnd' })} />
        </View>
      ) : null}
    </Screen>
  )
}
