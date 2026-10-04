import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ConverseCommandInput, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime'
import type { QuizCueInput } from '../src/ai/quiz'

const NOVA = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'nova')

/** Hand-written ConverseCommandOutput bodies (LING-002 plan §7). */
export function nova(name: string): ConverseCommandOutput {
  return JSON.parse(readFileSync(resolve(NOVA, `${name}.json`), 'utf8')) as ConverseCommandOutput
}
export function novaList(name: string): ConverseCommandOutput[] {
  return JSON.parse(readFileSync(resolve(NOVA, `${name}.json`), 'utf8')) as ConverseCommandOutput[]
}

/** vi.fn() send that returns the outputs in order (the last one repeats) and records every input. */
export function fakeSend(...outputs: ConverseCommandOutput[]) {
  let i = 0
  return vi.fn(async (_input: ConverseCommandInput): Promise<ConverseCommandOutput> => structuredClone(outputs[Math.min(i++, outputs.length - 1)]!))
}

/** Text blocks of the user message of the n-th call. */
export function userTexts(send: ReturnType<typeof fakeSend>, call = 0): string[] {
  return (send.mock.calls[call]![0].messages?.[0]?.content ?? []).map((b) => b.text ?? '')
}

/** Five cues, ten distinct highlights (ids 0–9 in this order), plus a repeated "Warte" in cue 5 that flattenHighlights drops. */
export const QUIZ_CUES: QuizCueInput[] = [
  { index: 0, text: 'Ich warte seit zwei\nStunden auf dich.', native: 'I have been waiting for two hours.', highlights: [{ word: 'warte', lemma: 'warten', pos: 'verb', gloss: 'wait' }, { word: 'Stunden', lemma: 'Stunde', pos: 'noun', gloss: 'hours' }] },
  { index: 1, text: 'Ich suche meinen Schlüssel.', native: 'I am looking for my key.', highlights: [{ word: 'suche', lemma: 'suchen', pos: 'verb', gloss: 'look for' }, { word: 'Schlüssel', lemma: 'Schlüssel', pos: 'noun', gloss: 'key' }] },
  { index: 2, text: 'Ich rufe dich morgen an.', native: 'I will call you tomorrow.', highlights: [{ word: 'rufe', lemma: 'rufen', pos: 'verb', gloss: 'call' }, { word: 'morgen', lemma: 'morgen', pos: 'adverb', gloss: 'tomorrow' }] },
  { index: 3, text: 'Ich vergesse immer alles.', native: 'I always forget everything.', highlights: [{ word: 'vergesse', lemma: 'vergessen', pos: 'verb', gloss: 'forget' }, { word: 'immer', lemma: 'immer', pos: 'adverb', gloss: 'always' }] },
  { index: 4, text: 'Der Zug steht am Bahnhof.', native: 'The train is at the station.', highlights: [{ word: 'Zug', lemma: 'Zug', pos: 'noun', gloss: 'train' }, { word: 'Bahnhof', lemma: 'Bahnhof', pos: 'noun', gloss: 'station' }] },
  { index: 5, text: 'Warte hier!', native: 'Wait here!', highlights: [{ word: 'Warte', lemma: 'warten', pos: 'verb', gloss: 'wait' }] },
]
