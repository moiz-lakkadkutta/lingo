import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { z } from 'zod'
const client = () => new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION ?? 'us-east-1' })
const LITE = () => process.env.NOVA_LITE_MODEL_ID ?? 'amazon.nova-lite-v1:0'
export const Gloss = z.object({ gloss: z.string().max(60), grammar: z.string().max(90), example: z.string().max(120) })
export const QuizSet = z.object({ items: z.array(z.object({ kind: z.enum(['meaning', 'cloze']), prompt: z.string(), options: z.array(z.string()).length(4), answer: z.number().int().min(0).max(3), cueIndex: z.number().int().nullable() })).min(6).max(12) })

export async function glossWord(word: string, lemma: string, cue: string, lang: 'de' | 'en', native: string, level: string) {
  const r = await client().send(new ConverseCommand({ modelId: LITE(), system: [{ text: `You are a ${lang === 'de' ? 'German' : 'English'} teacher for a ${level} learner whose native language is ${native}. Reply with JSON only: {"gloss": "≤6 words in ${native}", "grammar": "≤14 words, e.g. 'separable verb: an|rufen'", "example": "one new sentence at ${level} using the word"}.` }], messages: [{ role: 'user', content: [{ text: JSON.stringify({ word, lemma, cue }) }] }], inferenceConfig: { maxTokens: 200, temperature: 0.2 } }))
  return Gloss.parse(JSON.parse(r.output?.message?.content?.[0]?.text ?? '{}'))
}
export async function quizForClip(cues: Array<{ index: number; text: string; native: string; highlights: Array<{ word: string; gloss: string }> }>, lang: 'de' | 'en', native: string) {
  const r = await client().send(new ConverseCommand({ modelId: LITE(), system: [{ text: `Write a vocabulary quiz from these subtitle cues (${lang} → ${native}). 6 "meaning" items: prompt = the highlighted word; options = 4 ${native} glosses, distractors from OTHER highlighted words in this clip. 4 "cloze" items: prompt = the cue with the highlighted word replaced by ____; options = 4 ${lang} words from this clip. Exactly one correct answer. cueIndex = the cue used. JSON only: {"items":[...]}` }], messages: [{ role: 'user', content: [{ text: JSON.stringify(cues) }] }], inferenceConfig: { maxTokens: 3000, temperature: 0.3 } }))
  return QuizSet.parse(JSON.parse(r.output?.message?.content?.[0]?.text ?? '{"items":[]}'))
}
