/**
 * Recorded doubles for prepare(): no AWS, no ffmpeg, no packager, no Python. Used by test/prepare.test.ts and by `cli prepare --fixture`.
 * exec records argv (ffprobe answers with a duration, packager creates hls/master.m3u8); transcribe returns the committed Transcribe fixture;
 * translate upper-cases (not quite length-preserving — ß → SS — but the fixture dialogues stay within the cps/line limits either way, and native
 * VTT findings are warnings that the prepare tests assert to be empty); lemmatizer is the committed lookup table; freq/names are the real data files.
 */
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tableLemmatizer, type LemmaResult } from './lemmatize'
import { DATA_DIR, loadFreqList } from './freq'
import { loadNames } from './names'
import { TranscribeJson, type Lang, type PrepareDeps } from './types'

export interface RecordedExec { cmd: string; args: string[] }
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures')

/** A fixture name may carry a directory (`real/friedlaender` → test/fixtures/real/transcribe-friedlaender-{lang}.json). */
export function fixturePath(name: string, kind: 'transcribe' | 'lemmas', lang: Lang): string {
  return resolve(FIXTURES, dirname(name), `${kind}-${basename(name)}-${lang}.json`)
}

/** The lemma table of a fixture: lemmas-{lang}.json, merged with lemmas-{name}-{lang}.json for a named fixture when that file exists. */
function lemmaTableFor(name: string, lang: Lang): Record<string, LemmaResult> {
  const read = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Record<string, LemmaResult>
  const base = read(resolve(FIXTURES, `lemmas-${lang}.json`))
  const extra = fixturePath(name, 'lemmas', lang)
  return name !== '60s' && existsSync(extra) ? { ...base, ...read(extra) } : base
}

/** Media durations of the committed real fixtures (ffprobe of the run's mezzanine), so coverage numbers match the real run. */
export const REAL_DURATIONS: Record<string, number> = { 'real/friedlaender': 226.3, 'real/voa01': 300.4 }

/** opts.transcript: the Transcribe fixture name (default '60s'; also 'overlap', 'real/friedlaender', 'real/voa01'). */
export function fixtureDeps(lang: Lang, opts: { durationS?: number; transcript?: string } = {}): PrepareDeps & { calls: RecordedExec[] } {
  const calls: RecordedExec[] = []
  const name = opts.transcript ?? '60s'
  const transcript = TranscribeJson.parse(JSON.parse(readFileSync(fixturePath(name, 'transcribe', lang), 'utf8')))
  const durationS = opts.durationS ?? REAL_DURATIONS[name]
  const lastWordEnd = Math.max(...transcript.results.items.map((i) => parseFloat(i.end_time ?? '0')))
  return {
    calls,
    async exec(cmd, args) {
      calls.push({ cmd, args })
      if (cmd === 'ffprobe') return { stdout: JSON.stringify({ format: { duration: String(durationS ?? lastWordEnd + 1) } }) }
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
