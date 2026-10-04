import * as Speech from 'expo-speech' // on-device TTS, no AWS: https://docs.expo.dev/versions/v54.0.0/sdk/speech/
import type { Lang } from '@lingo/contracts'
export function langTag(l: Lang): string { return l === 'de' ? 'de-DE' : 'en-US' }
/** Some Android phones lack a German voice; speaking then does nothing (no error UI, the chip still shows gloss and example). */
export function speakWord(word: string, l: Lang): void {
  Speech.stop()
  Speech.speak(word, { language: langTag(l), rate: 0.9 })
}
