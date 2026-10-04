import { germanLookupKeys, type GermanLexicon } from '@lingo/contracts'
import { loadFreqList } from '../freq'
import { pythonLemmatizer, type Lemmatizer } from '../lemmatize'

/**
 * G-NONWORD support (docs/decisions/0009, round 3): answers "is this a German word?" from data/freq-de.txt (lemmas, any rank) and
 * simplemma (de) through the lemma bridge, one bridge call per card for the strings germanLookupKeys() names; answers are kept for the
 * life of the instance. When the bridge fails, the rule is skipped (one WARNING) rather than failing the gloss.
 */
export type GermanLexiconFn = (words: string[]) => Promise<GermanLexicon | undefined>

export function simplemmaGermanLexicon(opts: { lemmatizer?: Lemmatizer; freq?: string[]; log: (m: string) => void }): GermanLexiconFn {
  const lemmatizer = opts.lemmatizer ?? pythonLemmatizer()
  const known = new Map<string, { known: boolean; lemma: string }>()
  let freq: Set<string> | undefined = opts.freq ? new Set(opts.freq.map((w) => w.toLowerCase())) : undefined
  let broken = false
  return async (words) => {
    if (broken) return undefined
    try {
      freq ??= new Set((await loadFreqList('de')).map((w) => w.toLowerCase()))
      const missing = [...new Set(words.flatMap(germanLookupKeys))].filter((k) => !known.has(k))
      if (missing.length) {
        const res = await lemmatizer.lemmatizeAll(missing.map((word) => ({ word, sentenceInitial: false })), 'de')
        missing.forEach((k, i) => known.set(k, res[i]!))
      }
    } catch (e) {
      broken = true
      opts.log(`WARNING ai: German word check (G-NONWORD) skipped: ${e instanceof Error ? e.message : String(e)}`)
      return undefined
    }
    const f = freq
    return { inFreq: (s) => f.has(s.toLowerCase()), lookup: (s) => known.get(s) }
  }
}
