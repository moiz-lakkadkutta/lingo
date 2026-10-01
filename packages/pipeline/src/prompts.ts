import type { Gloss, Lang, Level, QuizSet } from '@lingo/contracts'
import { createAi, type Ai } from './ai/index'
import type { QuizCueInput } from './ai/quiz'

/** Thin module: a default Ai bound to the environment (created on first use). prepare() builds its own via createAi() to get the cost ledger. */
export { Gloss, QuizSet } from '@lingo/contracts'
export { createAi, AiSchemaError, type Ai, type AiOptions } from './ai/index'

let defaultAi: Ai | undefined
const ai = () => (defaultAi ??= createAi())

export async function glossWord(word: string, lemma: string, cue: string, lang: Lang, native: string, level: Level): Promise<Gloss> {
  return ai().gloss(word, lemma, cue, lang, native, level)
}
export async function quizForClip(cues: QuizCueInput[], lang: Lang, native: string): Promise<QuizSet> {
  return ai().quiz(cues, lang, native)
}
