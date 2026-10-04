import React, { useRef } from 'react'
import { TextInput, View } from 'react-native'
import { backspace, CODE_LEN, typeInto, type Boxes } from '../lib/codeInput'
import { strings } from '../strings'
import { color, radius, space, tap, type } from '../theme'

export interface CodeBoxesProps { boxes: Boxes; onBoxes(b: string[]): void; onComplete(code: string): void; onReject(): void; editable?: boolean }
/** Typing into a filled box arrives as two characters; drop the one already there so only the new one is placed. */
const withoutExisting = (text: string, existing: string | undefined) => {
  if (!existing || text.length < 2) return text
  if (text.startsWith(existing)) return text.slice(existing.length)
  if (text.endsWith(existing)) return text.slice(0, -existing.length)
  return text
}
/** Six boxes driven by lib/codeInput: auto-advance, paste fills all six, Backspace walks back. maxLength 6 on every box so a paste arrives whole. */
export function CodeBoxes({ boxes, onBoxes, onComplete, onReject, editable = true }: CodeBoxesProps) {
  const refs = useRef<Array<TextInput | null>>([])
  const focus = (i: number) => refs.current[i]?.focus()
  return (
    <View style={{ flexDirection: 'row', gap: space.s }}>
      {Array.from({ length: CODE_LEN }, (_, i) => (
        <TextInput
          key={i}
          ref={(r) => { refs.current[i] = r }}
          value={boxes[i] ?? ''}
          aria-label={strings.join.box(i)}
          accessibilityLabel={strings.join.box(i)}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          selectTextOnFocus
          editable={editable}
          maxLength={CODE_LEN}
          onChangeText={(text) => {
            const r = typeInto(boxes, i, withoutExisting(text, boxes[i]))
            if (r.rejected) { onReject(); return }
            onBoxes(r.boxes)
            if (r.complete) onComplete(r.complete)
            else focus(r.focus)
          }}
          onKeyPress={(e) => {
            if (e.nativeEvent.key !== 'Backspace') return
            const r = backspace(boxes, i)
            onBoxes(r.boxes); focus(r.focus)
          }}
          style={[type.code, { flex: 1, minHeight: tap, textAlign: 'center', color: color.text, backgroundColor: color.surface1, borderRadius: radius.button, borderWidth: 2, borderColor: boxes[i] ? color.interactive : color.surface2 }]}
        />
      ))}
    </View>
  )
}
