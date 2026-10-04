// The phone reuses the TV token values; sizes are phone dp, not 1080p px.
import { tokens } from '../../../packages/shared-ui/src/theme/tokens' // relative on purpose: no @lingo/shared-ui dependency (it would pull the kit link into the phone)
export const color = tokens.color
export const font = { regular: 'NotoSans_400Regular', semibold: 'NotoSans_600SemiBold', display: 'Manrope_800ExtraBold' } as const
export const type = {
  display: { fontFamily: font.display, fontSize: 40, lineHeight: 48 },        // "Day 6" only
  title:   { fontFamily: font.semibold, fontSize: 24, lineHeight: 30 },
  card:    { fontFamily: font.semibold, fontSize: 36, lineHeight: 44 },       // quiz front
  body:    { fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
  label:   { fontFamily: font.semibold, fontSize: 15, lineHeight: 20, letterSpacing: 0.3 },
  code:    { fontFamily: font.semibold, fontSize: 30, lineHeight: 36 },
} as const
export const tap = 56
export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32 } as const
export const radius = { chip: 6, button: 8, card: 12 } as const
