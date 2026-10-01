/**
 * Amazon Translate, cue by cue so native lines share the target cue's timestamps by construction.
 * TranslateText: Text ≤ 10 000 bytes, language codes 2–5 chars — https://docs.aws.amazon.com/translate/latest/APIReference/API_TranslateText.html ;
 * supported codes (de, en, tr, ar, uk) — https://docs.aws.amazon.com/translate/latest/dg/what-is-languages.html
 */
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate'
import { fits2, isDualText, MAX_LINE, NATIVE_LINE, wrap2, type Seg } from '../segment'
import type { Lang, PrepareDeps } from '../types'

let client: TranslateClient | undefined
export async function translateWithAws(text: string, from: Lang, to: string, opts: { region?: string } = {}): Promise<string> {
  client ??= new TranslateClient({ region: opts.region ?? process.env.AWS_REGION ?? 'eu-central-1' })
  const r = await client.send(new TranslateTextCommand({ Text: text, SourceLanguageCode: from, TargetLanguageCode: to }))
  return r.TranslatedText ?? ''
}

/** The target layout (2 × 42) when the translation fits it, else the native budget (2 × 56). */
export function wrapNative(t: string): string { return fits2(t, MAX_LINE) ? wrap2(t, MAX_LINE) : wrap2(t, NATIVE_LINE) }

/**
 * Per cue, per native ≠ from: translate the unwrapped text and wrap the result with wrapNative (up to the native budget 2 × 56, docs/decisions/0007 M4);
 * a two-speaker cue is translated line by line so each speaker keeps a hyphenated line (no wrap). Sequential (Translate TPS limits).
 * Keyed by cue index.
 */
export async function alignNative(segs: Seg[], from: Lang, natives: string[], translate: PrepareDeps['translate']): Promise<Record<number, Record<string, string>>> {
  const out: Record<number, Record<string, string>> = {}
  for (const s of segs) {
    out[s.index] = {}
    for (const n of natives) {
      if (n === from) continue
      if (isDualText(s.text)) {
        const lines: string[] = []
        for (const line of s.text.split('\n')) lines.push('-' + (await translate(line.slice(1), from, n)))
        out[s.index]![n] = lines.join('\n')
      } else out[s.index]![n] = wrapNative(await translate(s.text.replace(/\n/g, ' '), from, n))
    }
  }
  return out
}
