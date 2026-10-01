/**
 * Deterministic fixture generator (no network). `--transcribe` writes test/fixtures/transcribe-60s-{de,en}.json from dialogue-{lang}.txt
 * using the timing rule below; `--lemmas` runs the real simplemma bridge (needs LINGO_PYTHON venv) over the fixture vocabulary and writes
 * lemmas-{de,en}.json. The pure functions are exported so transcribe.test.ts can prove the committed JSON is reproducible byte for byte.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { tokenizeWords } from '../src/tokenize'
import { wordsFromTranscribe } from '../src/steps/transcribe'
import { lemmaKey, pythonLemmatizer, type LemmaInput, type LemmaResult } from '../src/lemmatize'
import { TranscribeJson, type Lang } from '../src/types'
import { FREQ_TOKEN } from '../src/freq'

const here = dirname(fileURLToPath(import.meta.url))
export const FIXTURES = resolve(here, '..', 'test', 'fixtures')

type Item = { type: 'pronunciation' | 'punctuation'; id: number; alternatives: Array<{ content: string; confidence: string }>; start_time?: string; end_time?: string }
const cs = (n: number) => (n / 100).toFixed(2)

/**
 * Timing rule (plan §4): cursor starts at 0.40 s; word dur = round2(0.045 × letters + 0.10); gap 0.05; after . ! ? add 0.45, after , ; : add 0.20.
 * Inside [fast] … [/fast]: dur × 0.5, gap 0.02, sentence pause 0.05. Trailing punctuation becomes its own item like Transcribe emits.
 */
export function transcribeFixtureFromDialogue(dialogue: string, lang: Lang): TranscribeJson {
  const tokens = dialogue.trim().split(/\s+/)
  const items: Item[] = []
  const segments: Array<{ id: number; transcript: string; start_time: string; end_time: string; items: number[] }> = []
  let cursor = 40, fast = false, id = 0
  let seg: { words: string[]; start: number; end: number; items: number[] } | null = null
  for (const tok of tokens) {
    if (tok === '[fast]') { fast = true; continue }
    if (tok === '[/fast]') { fast = false; continue }
    const m = /^(.*?)([.,!?;:])$/.exec(tok)
    const content = m ? m[1]! : tok
    const punct = m ? m[2]! : null
    const durFull = Math.round((45 * content.length + 100) / 10)
    const dur = fast ? Math.round(durFull / 2) : durFull
    const start = cursor, end = start + dur
    items.push({ type: 'pronunciation', id, alternatives: [{ content, confidence: '1.0' }], start_time: cs(start), end_time: cs(end) })
    seg ??= { words: [], start, end, items: [] }
    seg.words.push(content + (punct ?? '')); seg.end = end; seg.items.push(id)
    id++
    cursor = end + (fast ? 2 : 5)
    if (punct) {
      items.push({ type: 'punctuation', id, alternatives: [{ content: punct, confidence: '0.0' }] })
      seg.items.push(id); id++
      if (/[.!?]/.test(punct)) {
        cursor += fast ? 5 : 45
        segments.push({ id: segments.length, transcript: seg.words.join(' '), start_time: cs(seg.start), end_time: cs(seg.end), items: seg.items })
        seg = null
      } else cursor += 20
    }
  }
  if (seg) segments.push({ id: segments.length, transcript: seg.words.join(' '), start_time: cs(seg.start), end_time: cs(seg.end), items: seg.items })
  const transcript = tokens.filter((t) => t !== '[fast]' && t !== '[/fast]').join(' ')
  return TranscribeJson.parse({ jobName: `fixture-60s-${lang}`, accountId: '000000000000', status: 'COMPLETED', results: { transcripts: [{ transcript }], items, audio_segments: segments } })
}

/** Word forms the segment tests use beyond the dialogues (so the table covers them too). */
export const EXTRA_FORMS: Record<Lang, LemmaInput[]> = {
  de: [{ word: 'Doch', sentenceInitial: true }, { word: 'Ohh', sentenceInitial: true }, { word: 'hier', sentenceInitial: false }, { word: 'abgenommen', sentenceInitial: false }],
  en: [],
}

export function fixtureVocabulary(t: TranscribeJson, lang: Lang): LemmaInput[] {
  const seen = new Map<string, LemmaInput>()
  for (const w of [...tokenizeWords(wordsFromTranscribe(t)).map((t) => ({ word: t.word, sentenceInitial: t.sentenceInitial })), ...EXTRA_FORMS[lang]]) {
    if (!FREQ_TOKEN.test(w.word) && !/^\p{N}+$/u.test(w.word)) continue
    seen.set(lemmaKey(w.word, w.sentenceInitial), w)
  }
  return [...seen.values()]
}

export async function lemmaTable(vocab: LemmaInput[], lang: Lang): Promise<Record<string, LemmaResult>> {
  const res = await pythonLemmatizer().lemmatizeAll(vocab, lang)
  const table: Record<string, LemmaResult> = {}
  vocab.forEach((v, i) => { table[lemmaKey(v.word, v.sentenceInitial)] = res[i]! })
  return Object.fromEntries(Object.keys(table).sort().map((k) => [k, table[k]!]))
}

export function stringify(o: unknown): string { return JSON.stringify(o, null, 2) + '\n' }

async function main() {
  const args = process.argv.slice(2)
  for (const lang of ['de', 'en'] as Lang[]) {
    const dialogue = await readFile(resolve(FIXTURES, `dialogue-${lang}.txt`), 'utf8')
    const t = transcribeFixtureFromDialogue(dialogue, lang)
    if (args.includes('--transcribe')) {
      await writeFile(resolve(FIXTURES, `transcribe-60s-${lang}.json`), stringify(t))
      const words = wordsFromTranscribe(t)
      console.log(`transcribe-60s-${lang}.json: ${words.length} words, ${words.at(-1)!.end.toFixed(2)} s`)
    }
    if (args.includes('--lemmas')) {
      const vocab = fixtureVocabulary(t, lang)
      const table = await lemmaTable(vocab, lang)
      await writeFile(resolve(FIXTURES, `lemmas-${lang}.json`), stringify(table))
      console.log(`lemmas-${lang}.json: ${Object.keys(table).length} entries`)
    }
  }
  if (!args.length) console.log('usage: gen-fixtures.ts [--transcribe] [--lemmas]')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
