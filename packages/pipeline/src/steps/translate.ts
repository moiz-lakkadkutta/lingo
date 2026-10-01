/**
 * Amazon Translate, cue by cue so native lines share the target cue's timestamps by construction.
 * TranslateText: Text ≤ 10 000 bytes, language codes 2–5 chars — https://docs.aws.amazon.com/translate/latest/APIReference/API_TranslateText.html ;
 * supported codes (de, en, tr, ar, uk) — https://docs.aws.amazon.com/translate/latest/dg/what-is-languages.html
 */
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate'
import { isDualText, NATIVE_LINE, wrap2, type Seg } from '../segment'
import type { Lang, PrepareDeps } from '../types'

export type Formality = 'FORMAL' | 'INFORMAL'
/**
 * Targets that support Settings.Formality (docs/decisions/0008 decision 11) — https://docs.aws.amazon.com/translate/latest/dg/customizing-translations-formality.html ;
 * brevity is always requested (any source → de/fr/it/pt/es and those → en; an unsupported pair "proceeds with the brevity setting turned off") —
 * https://docs.aws.amazon.com/translate/latest/dg/customizing-translations-brevity.html · https://docs.aws.amazon.com/translate/latest/APIReference/API_TranslationSettings.html
 */
export const FORMALITY_TARGETS = new Set(['de', 'nl', 'fr', 'fr-CA', 'hi', 'it', 'ja', 'ko', 'pt-PT', 'es', 'es-MX'])
export function translateSettings(to: string, formality: Formality = 'INFORMAL'): { Brevity: 'ON'; Formality?: Formality } {
  return FORMALITY_TARGETS.has(to) ? { Brevity: 'ON', Formality: formality } : { Brevity: 'ON' }
}

let client: TranslateClient | undefined
export async function translateWithAws(text: string, from: Lang, to: string, opts: { region?: string; formality?: Formality } = {}): Promise<string> {
  client ??= new TranslateClient({ region: opts.region ?? process.env.AWS_REGION ?? 'eu-central-1' })
  const r = await client.send(new TranslateTextCommand({ Text: text, SourceLanguageCode: from, TargetLanguageCode: to, Settings: translateSettings(to, opts.formality) }))
  return r.TranslatedText ?? ''
}

/** True when the cue is nothing but spelled letters: ≥ 2 tokens after stripping punctuation and every token is one letter (A N N A.). */
export function isSpelling(text: string): boolean {
  const tokens = text.split(/\s+/).map((t) => t.replace(/[^\p{L}]/gu, '')).filter(Boolean)
  return tokens.length >= 2 && tokens.every((t) => [...t].length === 1)
}

/**
 * Per cue, per native ≠ from: translate the unwrapped text and wrap the result at the native budget (2 × 56, docs/decisions/0007 M4);
 * a two-speaker cue is translated line by line so each speaker keeps a hyphenated line (no wrap); a spelled-letters cue (isSpelling) is copied
 * verbatim without a Translate call. Sequential (Translate TPS limits).
 * Keyed by cue index.
 */
export async function alignNative(segs: Seg[], from: Lang, natives: string[], translate: PrepareDeps['translate']): Promise<Record<number, Record<string, string>>> {
  const out: Record<number, Record<string, string>> = {}
  for (const s of segs) {
    out[s.index] = {}
    for (const n of natives) {
      if (n === from) continue
      if (isSpelling(s.text)) { out[s.index]![n] = s.text; continue } // spelled letters are copied verbatim (Translate turns N A. into words)
      if (isDualText(s.text)) {
        const lines: string[] = []
        for (const line of s.text.split('\n')) lines.push('-' + (await translate(line.slice(1), from, n)))
        out[s.index]![n] = lines.join('\n')
      } else out[s.index]![n] = wrap2(await translate(s.text.replace(/\n/g, ' '), from, n), NATIVE_LINE)
    }
  }
  return out
}
