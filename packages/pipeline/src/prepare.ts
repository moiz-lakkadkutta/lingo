import { execa } from 'execa'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate'
import { serializeVtt } from '@moizp/vega-media-kit/core'
import { segment, wrap2, type Word } from './segment'
import { pickHighlights, clipLevel } from './highlights'
import { glossWord, quizForClip } from './prompts'

/** Whole prepare pipeline. Transcribe call mirrors described's 03-speech (copy the helper in LING-001). Lemmatizer: simplemma via a tiny Python bridge or a JS port — LING-001 decides. */
export async function prepare(input: { slug: string; source: string; lang: 'de' | 'en'; natives: string[] }) {
  const work = `work/${input.slug}`; await mkdir(work, { recursive: true })
  await execa('aws', ['s3', 'cp', input.source, `${work}/source.mp4`], { stdio: 'inherit' })
  // 1. transcribe → words.json (word timestamps)  [LING-001]
  const words = JSON.parse(await readFile(`${work}/words.json`, 'utf8')) as Word[]
  // 2. segment
  const segs = segment(words).map((s) => ({ ...s, text: wrap2(s.text) }))
  // 3. translate cue-by-cue so timestamps align 1:1
  const tr = new TranslateClient({ region: process.env.AWS_REGION ?? 'eu-central-1' })
  const native: Record<number, Record<string, string>> = {}
  for (const s of segs) { native[s.index] = {}; for (const n of input.natives) { if (n === input.lang) continue; const r = await tr.send(new TranslateTextCommand({ Text: s.text.replace('\n', ' '), SourceLanguageCode: input.lang, TargetLanguageCode: n })); native[s.index]![n] = r.TranslatedText ?? '' } }
  // 4. lemmatize + rank + highlights
  const freq = (await readFile(`data/freq-${input.lang}.txt`, 'utf8')).split('\n').map((l) => l.trim()).filter(Boolean)
  const rank = (lemma: string) => { const i = freq.indexOf(lemma.toLowerCase()); return i < 0 ? undefined : i + 1 }
  const tokensOf = (t: string) => t.replace(/\n/g, ' ').split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}-]/gu, '')).filter(Boolean).map((w) => ({ word: w, lemma: w.toLowerCase() /* TODO(LING-001): real lemmatizer */ }))
  const level = clipLevel(segs.flatMap((s) => tokensOf(s.text)), rank)
  const hl = pickHighlights(segs.map((s) => ({ index: s.index, tokens: tokensOf(s.text) })), rank, level)
  // 5. glosses (cached by lemma) + quiz
  const glosses = [] as Array<(typeof hl)[number] & { gloss: string; grammar: string; example: string }>
  for (const h of hl) { const seg = segs[h.cueIndex]!; glosses.push({ ...h, ...(await glossWord(h.word, h.lemma, seg.text, input.lang, input.natives[0]!, level)) }) }
  const quiz = await quizForClip(segs.map((s) => ({ index: s.index, text: s.text, native: native[s.index]![input.natives[0]!] ?? '', highlights: glosses.filter((g) => g.cueIndex === s.index).map((g) => ({ word: g.word, gloss: g.gloss })) })), input.lang, input.natives[0]!)
  await writeFile(`${work}/clip.json`, JSON.stringify({ slug: input.slug, level, segs, native, highlights: glosses, quiz: quiz.items }, null, 2))
  await writeFile(`${work}/${input.lang}.vtt`, serializeVtt(segs.map((s) => ({ trackId: input.lang, id: `c${s.index}`, start: s.startS, end: s.endS, text: s.text }))))
  // 6. package + publish: same Shaka Packager/S3 sync as described (09/10) — LING-001 copies them.
  console.log(`prepared ${input.slug}: level ${level}, ${segs.length} cues, ${hl.length} highlights, ${quiz.items.length} quiz items`)
}
