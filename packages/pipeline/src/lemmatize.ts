import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Lang } from './types'

/**
 * Lemmatizer seam (docs/decisions/0004). Async because the real implementation is simplemma 2.0.0 behind a Python child process
 * (scripts/lemma_bridge.py, JSON on stdin/stdout, one spawn per lemmatizeAll call). Tests use tableLemmatizer() with committed tables.
 */
export interface LemmaInput { word: string; sentenceInitial: boolean }
export interface LemmaResult { lemma: string; known: boolean }
export interface Lemmatizer {
  /** 'simplemma@2.0.0' | 'table' — recorded in clip.json generated.lemmatizer */
  name: string
  lemmatize(word: string, lang: Lang, sentenceInitial?: boolean): Promise<string>
  /** one process spawn per call */
  lemmatizeAll(words: LemmaInput[], lang: Lang): Promise<LemmaResult[]>
}

/** Table key: the word, plus `|si` when it is sentence-initial (casing changes the lookup for de/en). */
export function lemmaKey(word: string, sentenceInitial: boolean): string { return sentenceInitial ? `${word}|si` : word }

const here = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_BRIDGE = resolve(here, '..', 'scripts', 'lemma_bridge.py')
/** `<repo>/.venv-lemma/bin/python` — the venv README.md tells you to create (simplemma==2.0.0). */
export const REPO_VENV_PYTHON = resolve(here, '..', '..', '..', '.venv-lemma', 'bin', 'python')
/** LINGO_PYTHON, else the repo venv when it exists, else python3. */
export function defaultPython(env: Record<string, string | undefined> = process.env, exists: (p: string) => boolean = existsSync): string {
  return env.LINGO_PYTHON || (exists(REPO_VENV_PYTHON) ? REPO_VENV_PYTHON : 'python3')
}

interface BridgeReply { version: string; results: Array<{ l: string; k: boolean }> }

export function pythonLemmatizer(opts: { python?: string; script?: string } = {}): Lemmatizer {
  const python = opts.python ?? defaultPython()
  const script = opts.script ?? DEFAULT_BRIDGE
  let version: string | undefined
  const self: Lemmatizer = {
    get name() { return `simplemma@${version ?? '?'}` },
    async lemmatizeAll(words, lang) {
      if (!words.length) { if (!version) version = (await call(python, script, { lang, tokens: [] })).version; return [] }
      const reply = await call(python, script, { lang, tokens: words.map((w) => ({ w: w.word, si: w.sentenceInitial })) })
      version = reply.version
      if (reply.results.length !== words.length) throw new Error(`lemma bridge returned ${reply.results.length} results for ${words.length} tokens`)
      return reply.results.map((r) => ({ lemma: r.l, known: r.k }))
    },
    async lemmatize(word, lang, sentenceInitial = false) { return (await self.lemmatizeAll([{ word, sentenceInitial }], lang))[0]!.lemma },
  }
  return self
}

async function call(python: string, script: string, req: { lang: Lang; tokens: Array<{ w: string; si: boolean }> }): Promise<BridgeReply> {
  const r = await execa(python, [script], { input: JSON.stringify(req), reject: false, stdio: ['pipe', 'pipe', 'pipe'] })
  if (r.exitCode !== 0) throw new Error(`lemma bridge (${python}) exited ${r.exitCode}: ${r.stderr || r.message}`)
  try { return JSON.parse(r.stdout) as BridgeReply } catch { throw new Error(`lemma bridge returned unparsable output: ${r.stdout.slice(0, 200)} ${r.stderr}`) }
}

/** Deterministic double: a committed lookup table (test/fixtures/lemmas-{lang}.json). strict (default) throws on a miss; otherwise the word is echoed as its own lemma, unknown. */
export function tableLemmatizer(table: Record<string, LemmaResult>, opts: { strict?: boolean } = {}): Lemmatizer {
  const strict = opts.strict ?? true
  const self: Lemmatizer = {
    name: 'table',
    async lemmatizeAll(words) {
      return words.map((w) => {
        const hit = table[lemmaKey(w.word, w.sentenceInitial)]
        if (hit) return hit
        if (strict) throw new Error(`lemma table has no entry for ${JSON.stringify(lemmaKey(w.word, w.sentenceInitial))}`)
        return { lemma: w.word, known: false }
      })
    },
    async lemmatize(word, lang, sentenceInitial = false) { return (await self.lemmatizeAll([{ word, sentenceInitial }], lang))[0]!.lemma },
  }
  return self
}

/** `python -c "import simplemma"` exits 0 (used by the bridge smoke tests' skipIf). */
export async function pythonHasSimplemma(python = defaultPython()): Promise<boolean> {
  const r = await execa(python, ['-c', 'import simplemma'], { reject: false, stdio: 'ignore' })
  return r.exitCode === 0
}
