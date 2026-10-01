import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Screen } from '../state/app'
import { strings } from '../strings'
import { color, font, tap, type } from '../theme'

const TABS: Array<{ screen: Screen; label: string }> = [
  { screen: 'live', label: strings.tabs.live }, { screen: 'quiz', label: strings.tabs.review }, { screen: 'progress', label: strings.tabs.progress },
]
/** Live · Review · Progress, no drawer. Selected = interactive text, a 3 dp top border and semibold weight (never colour alone). */
/** hasTv is accepted for the App's call shape; Live without a TV lands on Join via the reducer. */
export function TabBar({ screen, onGo }: { screen: Screen; hasTv: boolean; onGo(s: Screen): void }) {
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ backgroundColor: color.surface1 }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row' }}>
        {TABS.map((t) => {
          const selected = t.screen === screen
          return (
            <Pressable
              key={t.screen}
              onPress={() => onGo(t.screen)}
              accessibilityRole="tab"
              aria-label={t.label}
              aria-selected={selected}
              accessibilityState={{ selected }}
              style={{ flex: 1, minHeight: tap, alignItems: 'center', justifyContent: 'center', borderTopWidth: 3, borderTopColor: selected ? color.interactive : color.surface1 }}
            >
              <Text style={[type.label, { fontFamily: selected ? font.semibold : font.regular, color: selected ? color.interactive : color.textSecondary }]}>{t.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </SafeAreaView>
  )
}
