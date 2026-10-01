import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { View } from 'react-native'
import type { LearnerDto } from '@lingo/contracts'
import { Focusable } from '../../components/Focusable'
import { T } from '../../components/Text'
import type { Caps } from '../../platformCaps'
import { strings } from '../../strings'
import { tokens } from '../../theme/tokens'
import { px } from '../../theme/scale'

export interface SettingsSheetProps {
  caps: Caps; plus: boolean; rate: 1 | 0.75; nativeLine: LearnerDto['nativeLine']; cueScale: number
  onRate(r: 1 | 0.75): void; onLearnerChange(p: Partial<Pick<LearnerDto, 'nativeLine' | 'cueScale'>>): void; onUpsell(): void
}
/** ◄► on the focused row; the Player forwards those keys here because the sheet is open while video plays. */
export interface SettingsSheetHandle { cycle(dir: -1 | 1): void }

type RowKey = 'speed' | 'nativeLine' | 'size'
const RATES = [1, 0.75] as const
const LINES: ReadonlyArray<LearnerDto['nativeLine']> = ['always', 'onPause', 'never']
const SIZES = [1, 1.25, 1.5] as const
const step = <V,>(list: readonly V[], cur: V, dir: -1 | 1): V => list[(Math.max(0, list.indexOf(cur)) + dir + list.length) % list.length]!

/** ▲ sheet, top-right in the safe zone: Speed (only where caps.rate) · Native line · Subtitle size. Video keeps playing. */
export const SettingsSheet = forwardRef<SettingsSheetHandle, SettingsSheetProps>(function SettingsSheet({ caps, plus, rate, nativeLine, cueScale, onRate, onLearnerChange }, ref) {
  const [status, setStatus] = useState<string | null>(null)
  const focused = useRef<RowKey>(caps.rate ? 'speed' : 'nativeLine')

  const cycle = (row: RowKey, dir: -1 | 1) => {
    if (row === 'speed') {
      const r = step(RATES, rate, dir)
      // Free tier: one line of upsell, value stays, no navigation.
      if (r === 0.75 && !plus) { setStatus(strings.explain.slowerUpsell); return }
      setStatus(null); onRate(r)
    } else if (row === 'nativeLine') onLearnerChange({ nativeLine: step(LINES, nativeLine, dir) })
    else onLearnerChange({ cueScale: step(SIZES, cueScale as (typeof SIZES)[number], dir) })
  }
  useImperativeHandle(ref, () => ({ cycle: (dir) => cycle(focused.current, dir) }))

  const rows: Array<{ key: RowKey; name: string; value: string }> = [
    ...(caps.rate ? [{ key: 'speed' as const, name: strings.sheet.speed, value: rate === 1 ? '1×' : '0.75×' }] : []),
    { key: 'nativeLine', name: strings.settings.nativeLine, value: strings.settings.nativeLineOpts[nativeLine] },
    { key: 'size', name: strings.settings.cueSize, value: `${Math.round(cueScale * 100)} %` },
  ]
  return (
    <View style={{ position: 'absolute', right: px(tokens.layout.safeX), top: px(tokens.layout.safeY), width: px(tokens.layout.sheetW), backgroundColor: tokens.color.surface1, borderRadius: 8, padding: px(24), gap: px(8) }}>
      <T variant="title">{strings.sheet.title}</T>
      {rows.map((r, i) => (
        <Focusable
          key={r.key}
          label={strings.sheet.rowLabel(r.name, r.value)}
          hasTVPreferredFocus={i === 0}
          onFocus={() => { focused.current = r.key }}
          onPress={() => cycle(r.key, 1)}
          style={{ backgroundColor: tokens.color.surface2, paddingHorizontal: px(24), paddingVertical: px(14), flexDirection: 'row', justifyContent: 'space-between' }}
        >
          <T variant="body">{r.name}</T>
          <T variant="body" color={tokens.color.interactive}>{r.value}</T>
        </Focusable>
      ))}
      <T variant="label" color={tokens.color.textSecondary} accessibilityLiveRegion="polite">{status ?? strings.sheet.hint}</T>
    </View>
  )
})
