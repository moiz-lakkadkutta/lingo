/**
 * Recorded doubles for prepare(): no AWS, no ffmpeg, no packager, no Python. Used by test/prepare.test.ts and by `cli prepare --fixture`.
 * exec records argv (ffprobe answers with a duration, packager creates hls/master.m3u8); transcribe returns the committed Transcribe fixture;
 * translate upper-cases (not quite length-preserving — ß → SS — but the fixture dialogues stay within the cps/line limits either way, and native
 * VTT findings are warnings that the prepare tests assert to be empty); lemmatizer is the committed lookup table; freq/names are the real data files.
 */
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tableLemmatizer, type LemmaResult } from './lemmatize'
import { DATA_DIR, loadFreqList } from './freq'
import { loadNames } from './names'
import { TranscribeJson, type Lang, type PrepareDeps } from './types'

export interface RecordedExec { cmd: string; args: string[] }
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures')

/** The lemma table of a fixture: lemmas-{lang}.json, merged with lemmas-{name}-{lang}.json for a named fixture when that file exists. */
function lemmaTableFor(name: string, lang: Lang): Record<string, LemmaResult> {
  const read = (f: string) => JSON.parse(readFileSync(resolve(FIXTURES, f), 'utf8')) as Record<string, LemmaResult>
  const base = read(`lemmas-${lang}.json`)
  const extra = `lemmas-${name}-${lang}.json`
  return name !== '60s' && existsSync(resolve(FIXTURES, extra)) ? { ...base, ...read(extra) } : base
}

/** opts.transcript: the Transcribe fixture name (default '60s'; also 'overlap' → transcribe-overlap-{lang}.json). */
export function fixtureDeps(lang: Lang, opts: { durationS?: number; transcript?: string } = {}): PrepareDeps & { calls: RecordedExec[] } {
  const calls: RecordedExec[] = []
  const name = opts.transcript ?? '60s'
  const transcript = TranscribeJson.parse(JSON.parse(readFileSync(resolve(FIXTURES, `transcribe-${name}-${lang}.json`), 'utf8')))
  const lastWordEnd = Math.max(...transcript.results.items.map((i) => parseFloat(i.end_time ?? '0')))
  return {
    calls,
    async exec(cmd, args) {
      calls.push({ cmd, args })
      if (cmd === 'ffprobe') return { stdout: JSON.stringify({ format: { duration: String(opts.durationS ?? lastWordEnd + 1) } }) }
      if (cmd === 'packager') {
        const master = args[args.indexOf('--hls_master_playlist_output') + 1]!
        await mkdir(dirname(master), { recursive: true })
        await writeFile(master, '#EXTM3U\n')
      }
      return { stdout: '' }
    },
    // like Transcribe, the transcript carries the job name it was started with (prepare --cues reads it back from transcript.json)
    transcribe: async (_source, _lang, jobName) => ({ ...transcript, jobName }),
    translate: async (t) => t.toUpperCase(),
    lemmatizer: tableLemmatizer(lemmaTableFor(name, lang)),
    freqList: (l) => loadFreqList(l),
    names: (l) => loadNames(resolve(DATA_DIR, `names-${l}.txt`)),
    gloss: async (word, lemma) => ({ gloss: `gloss of ${lemma}`, grammar: 'test grammar note', example: `Example with ${word}.` }),
    quiz: async () => ({ items: [] }),
    now: () => new Date('2026-09-15T12:00:00Z'),
    log: () => {},
  }
}
