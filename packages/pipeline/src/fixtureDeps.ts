/**
 * Recorded doubles for prepare(): no AWS, no ffmpeg, no packager, no Python. Used by test/prepare.test.ts and by `cli prepare --fixture`.
 * exec records argv (ffprobe answers with a duration, packager creates hls/master.m3u8); transcribe returns the committed Transcribe fixture;
 * translate upper-cases (not quite length-preserving — ß → SS — but the fixture dialogues stay within the cps/line limits either way, and native
 * VTT findings are warnings that the prepare tests assert to be empty); lemmatizer is the committed lookup table; freq/names are the real data files.
 */
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tableLemmatizer, type LemmaResult } from './lemmatize'
import { DATA_DIR, loadFreqList } from './freq'
import { loadNames } from './names'
import { TranscribeJson, type Lang, type PrepareDeps } from './types'
import { quizCounts, type QuizHighlight } from '@lingo/contracts'
import type { BedrockSend } from './ai/client'
import { GLOSS_TOOL } from './ai/gloss'
import { fallbackPlan, QUIZ_TOOL } from './ai/quiz'

export interface RecordedExec { cmd: string; args: string[] }

/**
 * Offline stand-in for Bedrock Converse (LING-002): answers explain_word with a stub card built from the request and plan_quiz with
 * fallbackPlan() over the requested highlights. Used by `cli spot-check --fixture` (with a throwaway cache) and by tests; never real Nova output.
 */
export function fixtureSend(): BedrockSend {
  return async (input) => {
    const tool = input.toolConfig?.toolChoice && 'tool' in input.toolConfig.toolChoice ? input.toolConfig.toolChoice.tool?.name : undefined
    const payload = JSON.parse(input.messages?.[0]?.content?.[0]?.text ?? '{}') as Record<string, unknown>
    let toolInput: Record<string, unknown>
    if (tool === GLOSS_TOOL) {
      const { word, lemma } = payload as { word: string; lemma: string }
      toolInput = { gloss: `stub meaning of ${lemma}`, grammar: 'stub grammar note', example: `Hier steht ${word} noch einmal.` }
    } else if (tool === QUIZ_TOOL) {
      const H = (payload.highlights as Array<Omit<QuizHighlight, 'cueIndex'>>).map((h) => ({ ...h, cueIndex: 0 }))
      toolInput = fallbackPlan(H, quizCounts(H.length))
    } else throw new Error(`fixtureSend: unknown tool ${String(tool)}`)
    return {
      $metadata: {}, stopReason: 'tool_use', usage: { inputTokens: 300, outputTokens: 60, totalTokens: 360 }, metrics: { latencyMs: 0 },
      output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 'fixture', name: tool, input: toolInput as never } }] } },
    }
  }
}
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures')

export function fixtureDeps(lang: Lang, opts: { durationS?: number } = {}): PrepareDeps & { calls: RecordedExec[] } {
  const calls: RecordedExec[] = []
  const transcript = TranscribeJson.parse(JSON.parse(readFileSync(resolve(FIXTURES, `transcribe-60s-${lang}.json`), 'utf8')))
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
    transcribe: async () => transcript,
    translate: async (t) => t.toUpperCase(),
    lemmatizer: tableLemmatizer(JSON.parse(readFileSync(resolve(FIXTURES, `lemmas-${lang}.json`), 'utf8')) as Record<string, LemmaResult>),
    freqList: (l) => loadFreqList(l),
    names: (l) => loadNames(resolve(DATA_DIR, `names-${l}.txt`)),
    gloss: async (word, lemma) => ({ gloss: `gloss of ${lemma}`, grammar: 'test grammar note', example: `Example with ${word}.` }),
    quiz: async () => ({ items: [] }),
    now: () => new Date('2026-09-15T12:00:00Z'),
    log: () => {},
  }
}
