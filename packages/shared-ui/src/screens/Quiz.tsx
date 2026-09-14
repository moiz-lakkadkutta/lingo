import React, { useState } from 'react'
import { View } from 'react-native'
import type { QuizItemDto } from '@lingo/contracts'
import { Focusable, T } from '../components'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

/** One item per screen; 2×2 grid of 640×140 options; no timer. Correct → blue ring + check, 600 ms auto-advance; incorrect → coral ring, answer shown, wait for Select. */
export function Quiz({ items, onDone, onReplayCue }: { items: QuizItemDto[]; onDone: (correct: number) => void; onReplayCue: (cueIndex: number) => void }) {
  const [i, setI] = useState(0); const [picked, setPicked] = useState<number | null>(null); const [correct, setCorrect] = useState(0)
  const it = items[i]
  if (!it) return null
  const next = () => { setPicked(null); if (i + 1 >= items.length) onDone(correct); else setI(i + 1) }
  const pick = (k: number) => { if (picked !== null) return; setPicked(k); if (k === it.answer) { setCorrect((c) => c + 1); setTimeout(next, 600) } }
  return (
    <View style={{ flex: 1, gap: px(32) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T variant="label" color={tokens.color.textSecondary}>{it.kind === 'cloze' ? 'FILL THE GAP' : 'WHAT DOES IT MEAN?'}</T><T variant="label" color={tokens.color.textSecondary}>{strings.quiz.progress(i + 1, items.length)}</T></View>
      <T variant="cueTarget">{it.prompt}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: px(20), maxWidth: px(1320) }}>
        {it.options.map((o, k) => {
          const state = picked === null ? 'idle' : k === it.answer ? 'correct' : k === picked ? 'incorrect' : 'idle'
          return (
            <Focusable key={k} label={o} hasTVPreferredFocus={k === 0} onPress={() => pick(k)} selected={state === 'correct'} style={{ width: px(640), height: px(140), justifyContent: 'center', paddingHorizontal: px(28), backgroundColor: tokens.color.surface2, borderColor: state === 'incorrect' ? tokens.color.incorrect : undefined, borderWidth: state === 'incorrect' ? px(3) : 0 }}>
              <T variant="body">{state === 'correct' ? '✓  ' : ''}{o}</T>
            </Focusable>
          )
        })}
      </View>
      {picked !== null && picked !== it.answer ? (
        <View style={{ flexDirection: 'row', gap: px(16) }}>
          {it.cueIndex !== null ? <Focusable label={strings.quiz.replayLine} onPress={() => onReplayCue(it.cueIndex!)} style={{ backgroundColor: tokens.color.surface2, paddingHorizontal: px(28), paddingVertical: px(16) }}><T variant="body">{strings.quiz.replayLine}</T></Focusable> : null}
          <Focusable label={strings.explain.continue} hasTVPreferredFocus onPress={next} style={{ backgroundColor: tokens.color.interactive, paddingHorizontal: px(28), paddingVertical: px(16) }}><T variant="body" color={tokens.color.ground}>{strings.explain.continue}</T></Focusable>
        </View>
      ) : null}
    </View>
  )
}
