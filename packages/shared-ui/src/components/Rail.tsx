import React, { useState } from 'react'
import { View } from 'react-native'
import { Focusable } from './Focusable'
import { T } from './Text'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface RailItem { key: 'home' | 'review' | 'words' | 'plus' | 'settings'; /** purpose, e.g. strings.rail.reviewLabel */ label: string; text: string }
export interface RailProps {
  items: RailItem[]; current: RailItem['key']; onSelect(k: RailItem['key']): void
  /** handle of the element ► should land on */ rightTarget?: number
  itemRefs?: React.MutableRefObject<Partial<Record<RailItem['key'], View | null>>>
  /** the screen's preferred focus id; the rail item `rail:<key>` matching it takes hasTVPreferredFocus */ initialFocus?: string
  onFocusId?(id: string): void
}
/**
 * Left rail: a 96 px slot that never changes width. While any item has focus, a 336 px surface1 panel with full labels is drawn over
 * the content (absolute), so the content never reflows. Current item: selected ring + interactive text + a 4 px bar on its left edge.
 */
export function Rail({ items, current, onSelect, rightTarget, itemRefs, initialFocus, onFocusId }: RailProps) {
  const [focused, setFocused] = useState<RailItem['key'] | null>(null)
  const open = focused !== null
  return (
    <View testID="rail" style={{ width: px(tokens.layout.rail), zIndex: 10 }} accessibilityRole="menu">
      <View testID="rail-panel" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: px(open ? tokens.layout.railExpanded : tokens.layout.rail), paddingTop: px(tokens.layout.safeY), gap: px(12), backgroundColor: tokens.color.surface1 }}>
        {items.map((it) => {
          const cur = it.key === current
          return (
            <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View testID={cur ? 'rail-current-bar' : undefined} style={{ width: px(4), alignSelf: 'stretch', backgroundColor: cur ? tokens.color.interactive : 'transparent' }} />
              <Focusable
                label={strings.rail.label(it.label)} selected={cur} onPress={() => onSelect(it.key)}
                hasTVPreferredFocus={initialFocus === `rail:${it.key}`}
                focusRef={itemRefs ? (r) => { itemRefs.current[it.key] = r } : undefined}
                nextFocusRight={rightTarget}
                onFocus={() => { setFocused(it.key); onFocusId?.(`rail:${it.key}`) }}
                onBlur={() => setFocused((f) => (f === it.key ? null : f))}
                style={{ paddingVertical: px(20), paddingHorizontal: px(20), minWidth: px(tokens.layout.rail - 16) }}
              >
                <T variant="label" color={cur ? tokens.color.interactive : tokens.color.textSecondary}>{open ? it.text : it.text.slice(0, 1)}</T>
              </Focusable>
            </View>
          )
        })}
      </View>
    </View>
  )
}
