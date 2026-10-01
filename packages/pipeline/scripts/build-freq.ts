/**
 * Builds data/freq-{de,en}.txt (top 20 000 lemmas, rank = line number) from hermitdave/FrequencyWords OpenSubtitles 2018 `*_50k.txt`
 * (content CC BY-SA 4.0 — https://github.com/hermitdave/FrequencyWords · https://creativecommons.org/licenses/by-sa/4.0/), lemmatized with
 * simplemma 2.0.0 through the bridge (needs LINGO_PYTHON → venv). Downloads are cached in data/.cache/ (gitignored). See docs/decisions/0004.
 * Names (data/names-{lang}.txt) are stripped before ranking so a listed name never has a rank (names.ts relies on that).
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR, FREQ_TOKEN, mergeByLemma } from '../src/freq'
import { pythonLemmatizer, type LemmaResult } from '../src/lemmatize'
import { loadNames } from '../src/names'
import type { Lang } from '../src/types'

const SOURCE = (lang: Lang) => `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/${lang}/${lang}_50k.txt`
const TOP = 20000, BATCH = 5000
const SANITY: Record<Lang, string[]> = { de: ['warten', 'stunde', 'anrufen', 'abnehmen', 'haus', 'tisch', 'hausen', 'anna'], en: ['wait', 'hour', 'call', 'answer', 'sarah'] }
const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1)

/** Minimum independent support (share of the form's own count) for the lowercase lemma of an ambiguous German form. */
export const VERB_SUPPORT = 0.01
export interface FormRow { word: string; count: number; low: LemmaResult; capped?: LemmaResult }
/**
 * Which lemmas each lowercase subtitle form credits. The list is lowercase, so for German simplemma reads "haus" as the verb hausen and "hat"
 * as haben, while the capitalised lookup finds the nouns Haus and Hat. When the capitalised lookup is a known entry with a different lemma
 * the count goes to BOTH (noun and verb — preferring the noun would send hat → Hat), except that the lowercase lemma must be attested by the
 * list's other, unambiguous forms: their counts must reach VERB_SUPPORT of the form's own count (bitten 3.9 % and danken 3.9 % pass; hausen
 * 0.3 %, tagen 0.2 % and zimmern 0 % do not — the corpus has ~no "haust"/"tagt"/"zimmert"). A form whose lowercase lookup learned nothing
 * (stunden → stunden) credits the capitalised lemma only (Stunde). Pure; `capped` is only set for de.
 */
export function creditLemmas(rows: FormRow[]): Array<{ word: string; count: number; lemma: string }> {
  const split = rows.map((r) => {
    const noun = r.capped?.known && r.capped.lemma.toLowerCase() !== r.low.lemma.toLowerCase() ? r.capped.lemma : undefined
    if (!noun) return { ...r, sure: r.low.lemma, gated: undefined }
    return { ...r, sure: noun, gated: r.low.lemma === r.word ? undefined : r.low.lemma }
  })
  const support = new Map<string, number>()
  for (const r of split) if (!r.gated) support.set(r.sure.toLowerCase(), (support.get(r.sure.toLowerCase()) ?? 0) + r.count)
  return split.flatMap((r) => {
    const lemmas = [r.sure]
    if (r.gated && (support.get(r.gated.toLowerCase()) ?? 0) >= VERB_SUPPORT * r.count) lemmas.push(r.gated)
    return lemmas.map((lemma) => ({ word: r.word, count: r.count, lemma }))
  })
}

async function download(lang: Lang): Promise<string> {
  const cache = resolve(DATA_DIR, '.cache', `${lang}_50k.txt`)
  if (!existsSync(cache)) {
    await mkdir(resolve(DATA_DIR, '.cache'), { recursive: true })
    const res = await fetch(SOURCE(lang))
    if (!res.ok) throw new Error(`download failed: ${res.status} ${SOURCE(lang)}`)
    await writeFile(cache, await res.text())
  }
  return readFile(cache, 'utf8')
}

async function build(lang: Lang) {
  const raw = await download(lang)
  const sha256 = createHash('sha256').update(raw).digest('hex')
  const names = new Set([...(await loadNames(resolve(DATA_DIR, `names-${lang}.txt`)))].map((n) => n.toLowerCase()))
  const all = raw.split('\n').map((l) => l.trim().split(' ')).filter((p) => p.length === 2 && FREQ_TOKEN.test(p[0]!)).map(([word, count]) => ({ word: word!, count: Number(count) }))
  const rows = all.filter((r) => !names.has(r.word))
  const lm = pythonLemmatizer()
  const forms: FormRow[] = []
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const low = await lm.lemmatizeAll(batch.map((r) => ({ word: r.word, sentenceInitial: false })), lang)
    // de: the list is lowercase and simplemma resolves lowercase German nouns to verbs or not at all — look every form up capitalised as well
    const capped = lang === 'de' ? await lm.lemmatizeAll(batch.map((r) => ({ word: cap(r.word), sentenceInitial: false })), lang) : undefined
    batch.forEach((r, k) => forms.push({ ...r, low: low[k]!, capped: capped?.[k] }))
    process.stdout.write(`\r${lang}: ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
  }
  process.stdout.write('\n')
  const merged = mergeByLemma(creditLemmas(forms)).filter((m) => FREQ_TOKEN.test(m.lemma) && !names.has(m.lemma)).slice(0, TOP)
  const list = merged.map((m) => m.lemma)
  await writeFile(resolve(DATA_DIR, `freq-${lang}.txt`), list.join('\n') + '\n')
  const meta = { source: SOURCE(lang), sha256, license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', corpus: 'OpenSubtitles 2018', simplemma: lm.name.replace('simplemma@', ''), generatedAt: new Date().toISOString(), inputForms: all.length, namesStripped: all.length - rows.length, outputLemmas: list.length }
  await writeFile(resolve(DATA_DIR, `freq-${lang}.meta.json`), JSON.stringify(meta, null, 2) + '\n')
  console.log(`${lang}: ${all.length - rows.length} name forms stripped; top 20 → ${list.slice(0, 20).join(' ')}`)
  for (const w of SANITY[lang]) console.log(`  rank(${w}) = ${list.indexOf(w) + 1 || 'none'}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) for (const lang of ['de', 'en'] as Lang[]) await build(lang)
