/**
 * Deterministic fixture generator (no network). `--transcribe` writes test/fixtures/transcribe-{name}-{lang}.json for every entry of
 * FIXTURE_SETS from its dialogue file using the timing rule below; `--lemmas` runs the real simplemma bridge (needs LINGO_PYTHON venv)
 * over the fixture vocabulary and writes lemmas-{lang}.json (60s) or lemmas-{name}-{lang}.json. The pure functions are exported so
 * transcribe.test.ts can prove the committed JSON is reproducible byte for byte.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { tokenizeCues } from '../src/tokenize'
import { segmentWithReport, wrap2 } from '../src/segment'
import { wordsFromTranscribe } from '../src/steps/transcribe'
import { lemmaKey, pythonLemmatizer, type LemmaInput, type LemmaResult } from '../src/lemmatize'
import { TranscribeJson, type Lang } from '../src/types'

const here = dirname(fileURLToPath(import.meta.url))
export const FIXTURES = resolve(here, '..', 'test', 'fixtures')

/**
 * Every Transcribe fixture: the two 60-second single-speaker dialogues and the overlapping-speaker dialogue (docs/decisions/0007 M3) are
 * generated from dialogue files; `given` sets are committed real Transcribe output (test/fixtures/real/README.md, docs/decisions/0008) —
 * only their lemma tables are generated.
 */
export const FIXTURE_SETS: Array<{ name: string; lang: Lang; given?: boolean }> = [
  { name: '60s', lang: 'de' }, { name: '60s', lang: 'en' }, { name: 'overlap', lang: 'de' },
  { name: 'real/friedlaender', lang: 'de', given: true }, { name: 'real/voa01', lang: 'en', given: true },
]
export const dialogueFile = (name: string, lang: Lang) => (name === '60s' ? `dialogue-${lang}.txt` : `dialogue-${name}-${lang}.txt`)
const withDir = (name: string, file: string) => (name.includes('/') ? `${dirname(name)}/${file}` : file)
const base = (name: string) => name.split('/').pop()!
export const lemmaFile = (name: string, lang: Lang) => (name === '60s' ? `lemmas-${lang}.json` : withDir(name, `lemmas-${base(name)}-${lang}.json`))
export const transcribeFile = (name: string, lang: Lang) => withDir(name, `transcribe-${base(name)}-${lang}.json`)

type Item = { type: 'pronunciation' | 'punctuation'; id: number; alternatives: Array<{ content: string; confidence: string }>; start_time?: string; end_time?: string; speaker_label?: string }
type SpeakerSegment = { start_time: string; end_time: string; speaker_label: string; items: Array<{ start_time: string; end_time: string; speaker_label: string }> }
const cs = (n: number) => (n / 100).toFixed(2)
const SPEAKER = /^\[([A-Z])([+-]\d+(?:\.\d+)?)?\]$/

/**
 * Timing rule (plan §4): cursor starts at 0.40 s; word dur = round2(0.045 × letters + 0.10); gap 0.05; after . ! ? add 0.45, after , ; : add 0.20.
 * Inside [fast] … [/fast]: dur × 0.5, gap 0.02, sentence pause 0.05. Trailing punctuation becomes its own item like Transcribe emits.
 * Speakers (docs/plans/LING-001-gate.md §5.2): `[A]` … `[Z]` switch the speaker (A → spk_0, B → spk_1); `[B+0.05]` / `[B-0.12]` also
 * set the next word's start to 50 ms after / 120 ms before the previous word's end, replacing the pause the punctuation added.
 * With a speaker active every item carries speaker_label and results.speaker_labels lists the runs, as in
 * https://docs.aws.amazon.com/transcribe/latest/dg/diarization-output-batch.html . Without speaker tokens the output is unchanged.
 */
export function transcribeFixtureFromDialogue(dialogue: string, lang: Lang, name = '60s'): TranscribeJson {
  const tokens = dialogue.trim().split(/\s+/)
  const items: Item[] = []
  const segments: Array<{ id: number; transcript: string; start_time: string; end_time: string; items: number[]; speaker_label?: string }> = []
  let cursor = 40, fast = false, id = 0, lastEnd = 40
  let speaker: string | undefined
  const speakers = new Set<string>()
  let seg: { words: string[]; start: number; end: number; items: number[]; speaker?: string } | null = null
  const pushSeg = () => {
    if (!seg) return
    segments.push({ id: segments.length, transcript: seg.words.join(' '), start_time: cs(seg.start), end_time: cs(seg.end), items: seg.items, ...(seg.speaker ? { speaker_label: seg.speaker } : {}) })
    seg = null
  }
  for (const tok of tokens) {
    if (tok === '[fast]') { fast = true; continue }
    if (tok === '[/fast]') { fast = false; continue }
    const sp = SPEAKER.exec(tok)
    if (sp) {
      const label = `spk_${sp[1]!.charCodeAt(0) - 65}`
      if (label !== speaker) pushSeg()
      speaker = label; speakers.add(label)
      if (sp[2]) cursor = lastEnd + Math.round(parseFloat(sp[2]) * 100)
      continue
    }
    const m = /^(.*?)([.,!?;:])$/.exec(tok)
    const content = m ? m[1]! : tok
    const punct = m ? m[2]! : null
    const durFull = Math.round((45 * content.length + 100) / 10)
    const dur = fast ? Math.round(durFull / 2) : durFull
    const start = cursor, end = start + dur
    const label = speaker ? { speaker_label: speaker } : {}
    items.push({ type: 'pronunciation', id, alternatives: [{ content, confidence: '1.0' }], start_time: cs(start), end_time: cs(end), ...label })
    seg ??= { words: [], start, end, items: [], ...(speaker ? { speaker } : {}) }
    seg.words.push(content + (punct ?? '')); seg.end = end; seg.items.push(id)
    id++
    lastEnd = end
    cursor = end + (fast ? 2 : 5)
    if (punct) {
      items.push({ type: 'punctuation', id, alternatives: [{ content: punct, confidence: '0.0' }], ...label })
      seg.items.push(id); id++
      if (/[.!?]/.test(punct)) {
        cursor += fast ? 5 : 45
        pushSeg()
      } else cursor += 20
    }
  }
  pushSeg()
  const transcript = tokens.filter((t) => t !== '[fast]' && t !== '[/fast]' && !SPEAKER.test(t)).join(' ')
  const results: Record<string, unknown> = { transcripts: [{ transcript }], items }
  if (speakers.size) {
    const runs: SpeakerSegment[] = []
    for (const it of items) {
      if (it.type !== 'pronunciation') continue
      const entry = { start_time: it.start_time!, end_time: it.end_time!, speaker_label: it.speaker_label! }
      const last = runs.at(-1)
      if (last && last.speaker_label === it.speaker_label) { last.items.push(entry); last.end_time = it.end_time! } else runs.push({ start_time: it.start_time!, end_time: it.end_time!, speaker_label: it.speaker_label!, items: [entry] })
    }
    results.speaker_labels = { channel_label: 'ch_0', speakers: speakers.size, segments: runs }
  }
  results.audio_segments = segments
  return TranscribeJson.parse({ jobName: `fixture-${name}-${lang}`, accountId: '000000000000', status: 'COMPLETED', results })
}

/** Word forms the segment tests use beyond the dialogues (so the table covers them too). */
export const EXTRA_FORMS: Record<Lang, LemmaInput[]> = {
  de: [{ word: 'Doch', sentenceInitial: true }, { word: 'Ohh', sentenceInitial: true }, { word: 'hier', sentenceInitial: false }, { word: 'abgenommen', sentenceInitial: false }],
  en: [],
}

/** The (word, sentenceInitial) pairs prepare() asks the lemmatizer for: tokens of the segmented, wrapped cues (docs/decisions/0007), plus EXTRA_FORMS. */
export function fixtureVocabulary(t: TranscribeJson, lang: Lang, extra: LemmaInput[] = EXTRA_FORMS[lang]): LemmaInput[] {
  const seen = new Map<string, LemmaInput>()
  const cues = segmentWithReport(wordsFromTranscribe(t)).cues.map((s) => ({ ...s, text: wrap2(s.text) }))
  for (const w of [...tokenizeCues(cues).map((t) => ({ word: t.word, sentenceInitial: t.sentenceInitial })), ...extra]) {
    // every token prepare() asks the lemmatizer for (tokenizeCues keeps any token with a letter or digit: "17,5", "N's")
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
  for (const { name, lang, given } of FIXTURE_SETS) {
    const t = given
      ? TranscribeJson.parse(JSON.parse(await readFile(resolve(FIXTURES, transcribeFile(name, lang)), 'utf8')))
      : transcribeFixtureFromDialogue(await readFile(resolve(FIXTURES, dialogueFile(name, lang)), 'utf8'), lang, name)
    if (args.includes('--transcribe') && !given) {
      await writeFile(resolve(FIXTURES, transcribeFile(name, lang)), stringify(t))
      const words = wordsFromTranscribe(t)
      console.log(`transcribe-${name}-${lang}.json: ${words.length} words, ${Math.max(...words.map((w) => w.end)).toFixed(2)} s`)
    }
    if (args.includes('--lemmas')) {
      // the 60s tables also carry the segment tests' extra forms; the other sets only their own vocabulary (merged over lemmas-{lang}.json by fixtureDeps)
      const vocab = fixtureVocabulary(t, lang, name === '60s' ? EXTRA_FORMS[lang] : [])
      const table = await lemmaTable(vocab, lang)
      await writeFile(resolve(FIXTURES, lemmaFile(name, lang)), stringify(table))
      console.log(`${lemmaFile(name, lang)}: ${Object.keys(table).length} entries`)
    }
  }
  if (!args.length) console.log('usage: gen-fixtures.ts [--transcribe] [--lemmas]')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
