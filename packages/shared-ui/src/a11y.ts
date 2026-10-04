import { AccessibilityInfo } from 'react-native'
/**
 * For changes that have no focus move (◄► value changes, offline). Prefer live regions; this is the fallback VoiceView reliably speaks.
 * https://developer.amazon.com/docs/react-native-vega/0.72/accessibilityinfo.html
 */
export function announce(text: string): void {
  try { AccessibilityInfo?.announceForAccessibility?.(text) } catch { /* not available on this runtime */ }
}
