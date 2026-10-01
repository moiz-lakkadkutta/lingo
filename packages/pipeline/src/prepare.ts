import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PreparedClip, type PreparedCue, type PreparedHighlight, type PreparedQuizItem, type PreparedToken } from '@lingo/contracts'
import { segmentWithReport, wrap2, type Dropped, type Seg } from './segment'
import { assertGate, gateReport } from './gate'
import { BANDS, clipLevel, coverageRank, highlightFloor, isCountable, NEXT, pickHighlights, reviewHighlights, unrankedShare, type Level } from './highlights'
import { DATA_DIR, loadFreqList, rankFn } from './freq'
import { isName, loadNames, rankOf } from './names'
import { lemmaKey, pythonLemmatizer, type LemmaResult } from './lemmatize'
import { tokenizeCues } from './tokenize'
import { checkVtt, cuesToVtt, loadCuesVtt, NATIVE_LINT_LIMITS } from './vtt'
import { createAi } from './ai/index'
import { normalize, probeMezz } from './steps/normalize'
import { transcribeJobName, transcribeWithAws, wordsFromTranscribe } from './steps/transcribe'
import { alignNative, translateWithAws } from './steps/translate'
import { pack } from './steps/package'
import { publish } from './steps/publish'
import { TranscribeJson, type PrepareDeps, type PrepareInput, type PrepareResult } from './types'
export { BANDS, NEXT, type Level }

export const PIPELINE_VERSION = 'lingo-pipeline@0.1.0'

export function defaultDeps(): PrepareDeps {
  const log = (m: string) => console.log(m)
  const ai = createAi({ log })
  return {
    exec: async (cmd, args, opts) => { const r = await execa(cmd, args, { cwd: opts?.cwd, stdio: ['ignore', 'pipe', 'inherit'] }); return { stdout: r.stdout } },
    transcribe: transcribeWithAws,
    translate: translateWithAws,
    lemmatizer: pythonLemmatizer(),
    freqList: (lang) => loadFreqList(lang),
    names: (lang) => loadNames(resolve(DATA_DIR, `names-${lang}.txt`)),
    gloss: ai.gloss,
    quiz: ai.quiz,
    cost: ai.cost,
    now: () => new Date(),
    log,
  }
}

/** Steps 1–10 of PLAN §4: normalise → transcribe → segment (or, with input.cues, a corrected VTT: docs/decisions/0007) → translate → lemmatize/rank/highlight → gloss/quiz (skipped when input.ai === false) → VTT → package → publish → clip.json. */
export async function prepare(input: PrepareInput, deps: PrepareDeps = defaultDeps()): Promise<PrepareResult> {
  const { slug, source, lang } = input
  const natives = [...new Set(input.natives.filter((n) => n !== lang))]
  if (!natives.length) throw new Error('natives must include at least one language other than the target')
  const doPublish = input.publish !== false
  const doAi = input.ai !== false
  const bucket = input.bucket ?? process.env.S3_BUCKET_MEDIA
  const cloudfrontDomain = input.cloudfrontDomain ?? process.env.CLOUDFRONT_DOMAIN
  if (doPublish && (!bucket || !cloudfrontDomain)) throw new Error('publish needs S3_BUCKET_MEDIA and CLOUDFRONT_DOMAIN (or --no-publish)')
  const warnings: string[] = []
  const work = resolve(input.workRoot ?? 'work', slug)
  await mkdir(work, { recursive: true })

  const vttFiles: Record<string, string> = {}

  const t0 = Date.now()
  const mark = (what: string) => deps.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${what}`)

  // 1. media: download + probe + normalise; a --cues or --reuse re-run reuses the mezzanine when it exists
  const tPath = `${work}/transcript.json`
  const reuseMedia = (!!input.cues || !!input.reuse) && existsSync(`${work}/mezz.mp4`)
  const { durationS } = reuseMedia ? await probeMezz(work, deps) : await normalize(work, source, deps)
  mark(reuseMedia ? `media reused (${durationS.toFixed(1)} s)` : `media normalised (${durationS.toFixed(1)} s)`)
  // 2–3. cues: from Transcribe (or, with --reuse, the transcript of an earlier run) + segmenter, or from the corrected VTT (docs/decisions/0007)
  let transcribeJob: string | null = null
  let segs: Seg[]
  let dropped: Dropped[] = []
  if (input.cues) {
    if (existsSync(tPath)) transcribeJob = (JSON.parse(await readFile(tPath, 'utf8')) as { jobName?: string }).jobName ?? null
    segs = (await loadCuesVtt(input.cues, lang)).map((s) => ({ ...s, text: wrap2(s.text) })) // read fully before anything is written
    mark(`cues from file ${input.cues}`)
  } else {
    let transcript: TranscribeJson
    if (input.reuse && existsSync(tPath)) {
      transcript = TranscribeJson.parse(JSON.parse(await readFile(tPath, 'utf8')))
      transcribeJob = transcript.jobName ?? null
      mark(`transcript reused (${tPath})`)
    } else {
      transcribeJob = transcribeJobName(slug, deps.now())
      transcript = await deps.transcribe(source, lang, transcribeJob)
      await writeFile(tPath, JSON.stringify(transcript, null, 2))
      mark('transcribed')
    }
    const words = wordsFromTranscribe(transcript)
    if (!words.length) throw new Error(`no speech in ${slug}`)
    await writeFile(`${work}/words.json`, JSON.stringify(words))
    const r = segmentWithReport(words)
    segs = r.cues.map((s) => ({ ...s, text: wrap2(s.text) }))
    dropped = r.dropped
    mark(`segmented: ${segs.length} cues, ${dropped.length} dropped, ${r.repairedStops} hesitation stops repaired`)
  }
  for (const d of dropped) warnings.push(`dropped cue ${d.startS.toFixed(3)}–${d.endS.toFixed(3)} ${JSON.stringify(d.text)} (${d.reason})`)
  // write before the gate so a human can correct what the segmenter produced
  const targetVtt = cuesToVtt(segs, lang)
  const targetPath = `${work}/${lang}.vtt`
  await writeFile(targetPath, targetVtt); vttFiles[lang] = targetPath
  if (dropped.length) await writeFile(`${work}/dropped.vtt`, cuesToVtt(dropped.map((d, i) => ({ index: i, startS: d.startS, endS: d.endS, text: d.text })), lang))
  await writeFile(`${work}/gate.json`, JSON.stringify(gateReport(segs, dropped), null, 2) + '\n')
  assertGate(segs, `edit ${targetPath} (condense, retime, split or merge the cues; a line break in the file is kept) and re-run with --cues ${targetPath}`)
  // 4. native lines, aligned 1:1 by cue
  const formality = input.formality ?? 'INFORMAL'
  const native = await alignNative(segs, lang, natives, (t, f, to) => deps.translate(t, f, to, { formality }))
  mark(`translated (${natives.join(', ')}, ${formality.toLowerCase()})`)
  // 5. tokens (from the final cue text) → lemma → rank → name
  const raw = tokenizeCues(segs)
  const unique = new Map<string, { word: string; sentenceInitial: boolean }>()
  for (const t of raw) unique.set(lemmaKey(t.word, t.sentenceInitial), { word: t.word, sentenceInitial: t.sentenceInitial })
  const keys = [...unique.keys()]
  const lemmaOf = new Map<string, LemmaResult>()
  ;(await deps.lemmatizer.lemmatizeAll(keys.map((k) => unique.get(k)!), lang)).forEach((r, i) => lemmaOf.set(keys[i]!, r))
  const rank = rankFn(await deps.freqList(lang))
  mark(`lemmatized ${keys.length} forms`)
  const nameCtx = { lang, rank, list: await deps.names(lang) }
  const tokensByCue: PreparedToken[][] = segs.map(() => [])
  raw.forEach((t, i) => {
    const { lemma, known } = lemmaOf.get(lemmaKey(t.word, t.sentenceInitial))!
    const name = isName({ word: t.word, lemma, known, sentenceInitial: t.sentenceInitial }, nameCtx)
    tokensByCue[t.cueIndex]!.push({ word: t.word, lemma, rank: rankOf(t.word, lemma, rank) ?? null, name, sentenceInitial: t.sentenceInitial })
  })
  // 6. level, coverage, highlights, glosses, quiz (names, digits and number words do not count, as in pickHighlights)
  const rankable = tokensByCue.flat().filter(isCountable)
  const level = clipLevel(rankable, rank)
  const coverage = coverageRank(rankable, rank)
  const unranked = unrankedShare(rankable, rank)
  if (unranked.share > 0.05) warnings.push(`unranked tokens: ${Math.round(unranked.share * 100)} % of countable tokens have no frequency rank (${unranked.lemmas.slice(0, 12).join(', ')}${unranked.lemmas.length > 12 ? ', …' : ''}) — ASR errors or rare words; the level ignores them`)
  const picked = pickHighlights(segs.map((s) => ({ index: s.index, tokens: tokensByCue[s.index]! })), rank, level)
  if (!picked.length) warnings.push(`no highlights: no countable token has rank ≥ ${highlightFloor(level)} (band above ${level}); the clip teaches nothing above its level — swap it (docs/content.md §8)`)
  warnings.push(...reviewHighlights(picked, lang))
  const highlights: PreparedHighlight[] = []
  let quiz: PreparedQuizItem[] | undefined
  if (doAi) {
    const glossed: Array<PreparedHighlight & { gloss: string }> = []
    for (const h of picked) glossed.push({ ...h, ...(await deps.gloss(h.word, h.lemma, segs[h.cueIndex]!.text, lang, natives[0]!, level)) })
    highlights.push(...glossed)
    quiz = (await deps.quiz(segs.map((s) => ({ index: s.index, text: s.text, native: native[s.index]![natives[0]!] ?? '', highlights: glossed.filter((g) => g.cueIndex === s.index).map((g) => ({ word: g.word, gloss: g.gloss })) })), lang, natives[0]!)).items
  } else highlights.push(...picked)
  mark(`highlights: ${highlights.length}${doAi ? `, glossed, ${quiz?.length ?? 0} quiz items` : ''}`)
  // 7. VTT files: the target VTT is already on disk (step 3) and its findings fail the clip; native findings (2 × 56, 26 cps) are warnings
  const targetCheck = checkVtt(targetVtt, lang)
  if (targetCheck.findings.length) throw new Error(`target VTT lint: ${targetCheck.findings.map((f) => `${f.id} ${f.problem}=${f.value}`).join('; ')}`)
  for (const n of natives) {
    const vtt = cuesToVtt(segs.map((s) => ({ ...s, text: native[s.index]![n] || ' ' })), n)
    for (const f of checkVtt(vtt, n, NATIVE_LINT_LIMITS).findings) warnings.push(`native ${n} ${f.id} ${f.problem}=${f.value}`)
    await writeFile(`${work}/native-${n}.vtt`, vtt); vttFiles[n] = `${work}/native-${n}.vtt`
  }
  mark('vtt written')
  // 8. package (+ publish)
  const manifest = await pack({ work, lang, natives }, deps)
  mark('packaged')
  // 9. clip.json (written before publish so the publish step can upload it)
  const cost = deps.cost?.()
  const cues: PreparedCue[] = segs.map((s) => ({ index: s.index, startMs: Math.round(s.startS * 1000), endMs: Math.round(s.endS * 1000), text: s.text, native: native[s.index]!, tokens: tokensByCue[s.index]! }))
  const clipBase = {
    version: 1 as const, slug, sourceLang: lang, natives, level, coverageRank: coverage, durationS, cues, highlights, ...(quiz ? { quiz } : {}),
    tracks: { manifest: 'master.m3u8', vtt: Object.fromEntries([lang, ...natives].map((c) => [c, `vtt/${c}.vtt`])) },
    source: { uri: source, transcribeJob }, generated: { at: deps.now().toISOString(), pipeline: PIPELINE_VERSION, lemmatizer: deps.lemmatizer.name, ai: doAi }, warnings,
    ...(cost ? { cost } : {}),
  }
  const clipJson = `${work}/clip.json`
  const write = (clip: PreparedClip) => writeFile(clipJson, JSON.stringify(clip, null, 2) + '\n')
  let clip = PreparedClip.parse({ ...clipBase, publishedBase: null })
  await write(clip)
  if (doPublish) { clip = PreparedClip.parse({ ...clipBase, publishedBase: await publish({ work, slug, lang, natives, bucket: bucket!, cloudfrontDomain: cloudfrontDomain! }, deps) }); await write(clip); mark('published') }
  for (const w of warnings) deps.log(`warning: ${w}`)
  deps.log(`prepared ${slug}: level ${level} (coverage rank ${coverage}), ${cues.length} cues, ${highlights.length} highlights, ${quiz ? `${quiz.length} quiz items` : 'no glosses or quiz (--no-ai)'}, ${warnings.length} warnings, ${dropped.length} dropped, ${durationS.toFixed(1)} s, lemmatizer ${deps.lemmatizer.name} → ${clip.publishedBase ?? 'not published'} (${work})${cost ? `, cost $${cost.usd.toFixed(4)} (${cost.calls} calls, ${cost.cachedCalls} cached)` : ''}`)
  return { clip, workDir: work, files: { clipJson, vtt: vttFiles, manifest } }
}
