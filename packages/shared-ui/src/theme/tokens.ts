/** Lingo design tokens — docs/PLAN.md §7. Two languages coded by luminance + temperature; one straw-yellow marker for the word to learn. */
export type TypeRole = 'display' | 'title' | 'body' | 'label' | 'cueTarget' | 'cueNative'
export const tokens = {
  color: {
    ground: '#0F151B', surface1: '#182028', surface2: '#222C36',
    text: '#EFF1EE', textSecondary: '#A7B1BC',
    nativeCue: '#9FC9D8',            // native-language line: dimmer, cooler, 70 % size
    marker: '#E3C77A',               // the word worth learning; dark text on it
    interactive: '#7FB3D5',          // selected / primary button
    badge: '#E3C77A',                // level chips use surface2; badge alias kept for shared Card
    focus: '#EFF1EE',
    incorrect: '#D98B7A', error: '#D98B7A',
    cueBox: 'rgba(0,0,0,0.65)',
  },
  type: {
    floor: 28,
    display:   { family: 'Manrope-ExtraBold', weight: '700', size: 64, line: 72, tracking: -0.01 },
    title:     { family: 'NotoSans-SemiBold', weight: '700', size: 44, line: 52 },
    body:      { family: 'NotoSans-Regular', weight: '400', size: 32, line: 44 },
    label:     { family: 'NotoSans-SemiBold', weight: '700', size: 28, line: 36, tracking: 0.02 },
    cueTarget: { family: 'NotoSans-Regular', weight: '400', size: 44, line: 57 },
    cueNative: { family: 'NotoSans-Regular', weight: '400', size: 32, line: 40 },
  } as Record<TypeRole, { family: string; weight: '400' | '700'; size: number; line: number; tracking?: number; tabular?: boolean }> & { floor: number },
  layout: { safeX: 96, safeY: 54, rail: 96, railExpanded: 336, cardW: 412, cardH: 232, gutter: 24, heroH: 520, explainW: 880, explainH: 420 },
  focus: { width: 4, offset: 3, wordWidth: 3 },
  motion: { focusMs: 150, focusScale: 1.04, overlayHideMs: 4000, autoPauseHoldMs: 2000 },
} as const
