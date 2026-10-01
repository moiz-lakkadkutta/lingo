import React from 'react'
import { SafeAreaView } from 'react-native-safe-area-context' // https://docs.expo.dev/versions/v54.0.0/sdk/safe-area-context/
import { color, space } from '../theme'
/** Every screen: safe area on the ground colour, padding l. The bottom edge belongs to the tab bar when it shows. */
export function Page({ children, bottom = true }: { children?: React.ReactNode; bottom?: boolean }) {
  return (
    <SafeAreaView edges={bottom ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']} style={{ flex: 1, backgroundColor: color.ground, padding: space.l, gap: space.m }}>
      {children}
    </SafeAreaView>
  )
}
