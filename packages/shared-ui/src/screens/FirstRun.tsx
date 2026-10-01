import React, { useEffect, useRef, useState } from 'react'
import { BackHandler, View } from 'react-native'
import type { Lang, LearnerDto, Level } from '@lingo/contracts'
import { Button, Focusable, Screen, T } from '../components'
import { speakOptions } from '../app/selectors'
import type { SessionState } from '../session/types'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
import { firstRunReduce, initialFirstRun, type FirstRunEvent, type FirstRunState } from './firstRun/machine'
import { PLACEMENT } from './firstRun/placement'
import { Pair } from './Pair'

export interface FirstRunProps {
  learner: LearnerDto; session: SessionState; remote?: never
  onProfile(p: { learning: Lang; native: string }): void; onLevel(level: Level): void; onDone(): void
}
const F = strings.firstRun
const LEARN: Lang[] = ['de', 'en']

/** First run (plan §8): I'm learning → I speak → a 60-second placement (or Skip → about A2) → pair the phone. D-pad + Select only; Back walks back. */
export function FirstRun({ learner, session, onProfile, onLevel, onDone }: FirstRunProps) {
  const [s, setS] = useState<FirstRunState>(() => initialFirstRun(learner))
  const sRef = useRef(s)
  const cbs = useRef({ onProfile, onLevel, onDone }); cbs.current = { onProfile, onLevel, onDone }
  const dispatch = (e: FirstRunEvent): boolean => {
    const [next, effects] = firstRunReduce(sRef.current, e)
    sRef.current = next
    setS(next)
    let handled = true
    for (const fx of effects) {
      if (fx.kind === 'profile') cbs.current.onProfile({ learning: fx.learning, native: fx.native })
      else if (fx.kind === 'level') cbs.current.onLevel(fx.level)
      else if (fx.kind === 'done') cbs.current.onDone()
      else if (fx.kind === 'unhandledBack') handled = false
    }
    return handled
  }
  const dispatchRef = useRef(dispatch); dispatchRef.current = dispatch
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => dispatchRef.current({ type: 'back' }))
    return () => sub.remove()
  }, [])

  if (s.panel === 'learning') {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: px(40) }}>
          <T variant="display">{F.learning}</T>
          <View style={{ flexDirection: 'row', gap: px(32) }}>
            {LEARN.map((l) => {
              const name = strings.settings.learningOpts[l]
              return (
                <Focusable key={l} label={F.learningLabel(name)} hasTVPreferredFocus={l === s.learning} onPress={() => dispatch({ type: 'learning', lang: l })}
                  style={{ width: px(560), height: px(320), justifyContent: 'center', alignItems: 'center', backgroundColor: tokens.color.surface1 }}>
                  <T variant="display">{name}</T>
                </Focusable>
              )
            })}
          </View>
        </View>
      </Screen>
    )
  }
  if (s.panel === 'speak') {
    const opts = speakOptions(s.learning)
    const pref = opts.some((o) => o.code === s.native) ? s.native : opts[0]!.code
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: px(40) }}>
          <T variant="display">{F.speak}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: px(24), maxWidth: px(4 * 400 + 3 * 24) }}>
            {opts.map((o) => (
              <Focusable key={o.code} label={F.speakLabel(o.name)} hasTVPreferredFocus={o.code === pref} onPress={() => dispatch({ type: 'speak', code: o.code })}
                style={{ width: px(400), height: px(140), justifyContent: 'center', alignItems: 'center', backgroundColor: tokens.color.surface1 }}>
                <T variant="title">{o.name}</T>
              </Focusable>
            ))}
          </View>
        </View>
      </Screen>
    )
  }
  if (s.panel === 'placement') {
    const items = PLACEMENT[s.learning]
    const i = s.answers.length
    const item = items[i]!
    return (
      <Screen>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T variant="title">{F.placementTitle}</T>
          <T variant="label" color={tokens.color.textSecondary}>{F.item(i + 1, items.length)}</T>
        </View>
        <T variant="body" color={tokens.color.textSecondary}>{F.placementBody}</T>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: px(40) }}>
          <View testID="placement-cue" style={{ backgroundColor: tokens.color.cueBox, paddingHorizontal: px(28), paddingVertical: px(16), borderRadius: 6 }}>
            <T variant="cueTarget" style={{ textAlign: 'center' }}>{item.text}</T>
          </View>
          <T variant="title">{F.placement}</T>
          <View key={`answers-${i}`} style={{ flexDirection: 'row', gap: px(16) }}>
            <Button primary preferred label={F.yesLabel} text={F.yes} onPress={() => dispatch({ type: 'answer', a: 'yes' })} />
            <Button label={F.mostlyLabel} text={F.mostly} onPress={() => dispatch({ type: 'answer', a: 'mostly' })} />
            <Button label={F.noLabel} text={F.no} onPress={() => dispatch({ type: 'answer', a: 'no' })} />
          </View>
          <Button label={F.skipLabel} text={F.skip} onPress={() => dispatch({ type: 'skip' })} />
        </View>
      </Screen>
    )
  }
  return (
    <Screen>
      <Pair embedded code={session.code} joinUrl={session.joinUrl} connected={session.phone} onLater={() => dispatch({ type: 'finish' })} />
    </Screen>
  )
}
