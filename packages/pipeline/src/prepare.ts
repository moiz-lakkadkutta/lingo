import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PreparedClip, type PreparedCost, type PreparedCue, type PreparedHighlight, type PreparedQuizItem, type PreparedToken } from '@lingo/contracts'
import { segmentWithReport, wrap2, type Dropped, type Seg } from './segment'
import { assertGate, gateReport } from './gate'
import { BANDS, clipLevel, coverageRank, highlightFloor, isCountable, NEXT, pickHighlights, reviewHighlights, unrankedShare, type Level } from './highlights'
import { DATA_DIR, loadFreqList, rankFn } from './freq'
import { isName, loadNames, rankOf } from './names'
import { lemmaKey, pythonLemmatizer, type LemmaResult } from './lemmatize'
import { tokenizeCues } from './tokenize'
import { checkVtt, cuesToVtt, loadCuesVtt, NATIVE_LINT_LIMITS } from './vtt'
import { createAi } from './ai/index'
import { glossClip, quizInput } from './ai/glossClip'
import { loadPhrases, mergeExpressions } from './phrases'
import { normalize, probeMezz } from './steps/normalize'
import { transcribeJobName, transcribeWithAws, wordsFromTranscribe } from './steps/transcribe'
import { alignNative, translateWithAws } from './steps/translate'
import { pack } from './steps/package'
import { publish } from './steps/publish'
import { alignConfidence, asrSkipWarning, asrSuspectReasons, confidenceItems } from './asr'
import { TranscribeJson, type PrepareDeps, type PrepareInput, type PrepareResult } from './types'
export { BANDS, NEXT, type Level }

export const PIPELINE_VERSION = 'lingo-pipeline@0.1.0'

/** work/<slug>/run.json: step timings and spend of the last prepare() run, written on success and on failure (gate, AI, anything). */
export interface RunJson {
  slug: string
  ok: boolean
  at: string
  /** the step that threw (absent when ok) */
  failedStep?: string
  error?: string
  /** ms per step, in run order; the failed step counts up to the throw */
  timings: Record<string, number>
  totalMs: number
  /** spend so far: Transcribe audio minutes (0 when reused or --cues), Translate characters sent, Bedrock USD (+ the ledger when the deps have one) */
  cost: { transcribeMinutes: number; translateChars: number; bedrockUsd: number; bedrock?: PreparedCost }
}
export const runJsonPath = (work: string) => `${work}/run.json`

class RunRecord {
  private readonly t0 = Date.now()
  private readonly ms: Record<string, number> = {}
  private current: string | null = null
  private since = this.t0
  readonly cost = { transcribeMinutes: 0, translateChars: 0 }
  constructor(private readonly slug: string, private readonly deps: Pick<PrepareDeps, 'cost' | 'now'>) {}
  /** closes the running step and starts `next` (null = none) */
  step(next: string | null): void {
    const now = Date.now()
    if (this.current) this.ms[this.current] = (this.ms[this.current] ?? 0) + (now - this.since)
    this.current = next
    this.since = now
  }
  timings(): Record<string, number> { return { ...this.ms } }
  async write(work: string, error?: unknown): Promise<void> {
    const failedStep = this.current ?? undefined
    this.step(null)
    const bedrock = this.deps.cost?.()
    const json: RunJson = {
      slug: this.slug, ok: error === undefined, at: this.deps.now().toISOString(),
      ...(error !== undefined ? { failedStep: failedStep ?? 'unknown', error: error instanceof Error ? error.message : String(error) } : {}),
      timings: this.timings(), totalMs: Date.now() - this.t0,
      cost: { transcribeMinutes: Math.round(this.cost.transcribeMinutes * 1000) / 1000, translateChars: this.cost.translateChars, bedrockUsd: bedrock?.usd ?? 0, ...(bedrock ? { bedrock } : {}) },
    }
    try { await writeFile(runJsonPath(work), JSON.stringify(json, null, 2) + '\n') } catch (e) { if (error === undefined) throw e } // a failed run keeps its own error
  }
}

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

  const run = new RunRecord(slug, deps)
  try {
    const vttFiles: Record<string, string> = {}

    const t0 = Date.now()
    const mark = (what: string) => deps.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${what}`)
    run.step('media')

    // 1. media: download + probe + normalise; a --cues or --reuse re-run reuses the mezzanine when it exists
    const tPath = `${work}/transcript.json`
    const reuseMedia = (!!input.cues || !!input.reuse) && existsSync(`${work}/mezz.mp4`)
    const { durationS } = reuseMedia ? await probeMezz(work, deps) : await normalize(work, source, deps)
    run.step(input.cues ? 'cues' : 'transcribe')
    mark(reuseMedia ? `media reused (${durationS.toFixed(1)} s)` : `media normalised (${durationS.toFixed(1)} s)`)
    // 2–3. cues: from Transcribe (or, with --reuse, the transcript of an earlier run) + segmenter, or from the corrected VTT (docs/decisions/0007)
    let transcribeJob: string | null = null
    let segs: Seg[]
    let dropped: Dropped[] = []
    // kept for the ASR confidence of each token (LING-002-gate-c §2); absent for a --cues run without a transcript in the work dir
    let transcriptForAsr: TranscribeJson | undefined
    if (input.cues) {
      if (existsSync(tPath)) {
        const raw = JSON.parse(await readFile(tPath, 'utf8')) as { jobName?: string }
        transcribeJob = raw.jobName ?? null
        const parsed = TranscribeJson.safeParse(raw)
        if (parsed.success) transcriptForAsr = parsed.data
      }
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
      run.cost.transcribeMinutes = durationS / 60
        await writeFile(tPath, JSON.stringify(transcript, null, 2))
        mark('transcribed')
      }
      transcriptForAsr = transcript
      run.step('segment')
      const words = wordsFromTranscribe(transcript)
      if (!words.length) throw new Error(`no speech in ${slug}`)
      await writeFile(`${work}/words.json`, JSON.stringify(words))
      const r = segmentWithReport(words)
      segs = r.cues.map((s) => ({ ...s, text: wrap2(s.text) }))
      dropped = r.dropped
      mark(`segmented: ${segs.length} cues, ${dropped.length} dropped, ${r.repairedStops} hesitation stops repaired`)
    }
    for (const d of dropped) warnings.push(`dropped cue ${d.startS.toFixed(3)}–${d.endS.toFixed(3)} ${JSON.stringify(d.text)} (${d.reason})`)
    run.step('gate')
    // write before the gate so a human can correct what the segmenter produced
    const targetVtt = cuesToVtt(segs, lang, input.vttNote)
    const targetPath = `${work}/${lang}.vtt`
    await writeFile(targetPath, targetVtt); vttFiles[lang] = targetPath
    if (dropped.length) await writeFile(`${work}/dropped.vtt`, cuesToVtt(dropped.map((d, i) => ({ index: i, startS: d.startS, endS: d.endS, text: d.text })), lang))
    await writeFile(`${work}/gate.json`, JSON.stringify(gateReport(segs, dropped), null, 2) + '\n')
    assertGate(segs, `edit ${targetPath} (condense, retime, split or merge the cues; a line break in the file is kept) and re-run with --cues ${targetPath}`)
    // 4. native lines, aligned 1:1 by cue
    const formality = input.formality ?? 'INFORMAL'
    run.step('translate')
    const native = await alignNative(segs, lang, natives, (t, f, to) => { run.cost.translateChars += [...t].length; return deps.translate(t, f, to, { formality }) })
    mark(`translated (${natives.join(', ')}, ${formality.toLowerCase()})`)
    // 5. tokens (from the final cue text) → lemma → rank → name
    run.step('lemmatize')
    const raw = tokenizeCues(segs)
    const unique = new Map<string, { word: string; sentenceInitial: boolean }>()
    for (const t of raw) unique.set(lemmaKey(t.word, t.sentenceInitial), { word: t.word, sentenceInitial: t.sentenceInitial })
    const keys = [...unique.keys()]
    const lemmaOf = new Map<string, LemmaResult>()
    ;(await deps.lemmatizer.lemmatizeAll(keys.map((k) => unique.get(k)!), lang)).forEach((r, i) => lemmaOf.set(keys[i]!, r))
    const rank = rankFn(await deps.freqList(lang))
    mark(`lemmatized ${keys.length} forms`)
    run.step('highlights')
    const nameCtx = { lang, rank, list: await deps.names(lang) }
    const tokensByCue: PreparedToken[][] = segs.map(() => [])
    const confidence = transcriptForAsr ? alignConfidence(raw, segs, confidenceItems(transcriptForAsr)) : []
    raw.forEach((t, i) => {
      const { lemma, known } = lemmaOf.get(lemmaKey(t.word, t.sentenceInitial))!
      const name = isName({ word: t.word, lemma, known, sentenceInitial: t.sentenceInitial }, nameCtx)
      const asr = confidence[i]
      tokensByCue[t.cueIndex]!.push({ word: t.word, lemma, rank: rankOf(t.word, lemma, rank) ?? null, name, sentenceInitial: t.sentenceInitial, ...(asr !== undefined ? { asr } : {}) })
    })
    // 6. level, coverage, highlights, glosses, quiz (names, digits and number words do not count, as in pickHighlights)
    const rankable = tokensByCue.flat().filter(isCountable)
    const level = clipLevel(rankable, rank)
    const coverage = coverageRank(rankable, rank)
    const unranked = unrankedShare(rankable, rank)
    if (unranked.share > 0.05) warnings.push(`unranked tokens: ${Math.round(unranked.share * 100)} % of countable tokens have no frequency rank (${unranked.lemmas.slice(0, 12).join(', ')}${unranked.lemmas.length > 12 ? ', …' : ''}) — ASR errors or rare words; the level ignores them`)
    const cueTokens = segs.map((s) => ({ index: s.index, tokens: tokensByCue[s.index]! }))
    const suspects = asrSuspectReasons(cueTokens, rank)
    const phrases = await loadPhrases(lang)
    const notes = new Map(phrases.map((p) => [p.lemma, p.note]))
    // fixed expressions (data/phrases-<lang>.txt): a highlighted token inside one becomes the whole expression
    const picked = mergeExpressions(pickHighlights(cueTokens, rank, level, 0.4, new Set(suspects.keys()), (ci, t) => warnings.push(asrSkipWarning(ci, t.word, t.asr, suspects.get(`${ci}|${t.word.toLowerCase()}`)))), cueTokens, phrases)
    if (!picked.length) warnings.push(`no highlights: no countable token has rank ≥ ${highlightFloor(level)} (band above ${level}); the clip teaches nothing above its level — swap it (docs/content.md §8)`)
    warnings.push(...reviewHighlights(picked, lang))
    const highlights: PreparedHighlight[] = []
    let quiz: PreparedQuizItem[] | undefined
    if (doAi) {
      run.step('ai')
      const results = await glossClip(deps, picked.map((h) => ({ cueIndex: h.cueIndex, word: h.word, lemma: h.lemma, rank: h.rank, cue: segs[h.cueIndex]!.text, nativeCue: native[h.cueIndex]![natives[0]!], ...(h.cueIndex > 0 ? { prevCue: segs[h.cueIndex - 1]!.text } : {}), ...('phrase' in h && h.phrase ? { phrase: notes.get(h.lemma) ? { note: notes.get(h.lemma)! } : {} } : {}) })), lang, natives[0]!, level, (m) => deps.log(m))
      const glossed: Array<PreparedHighlight & { gloss: string }> = []
      results.forEach((r, i) => {
        // a wrong explanation on screen is worse than one highlight fewer (docs/decisions/0009 decision 6)
        if (r.status === 'ok' || r.status === 'soft') glossed.push({ ...picked[i]!, ...r.gloss })
        else warnings.push(`gloss: dropped highlight "${r.word}" (cue ${r.cueIndex}): ${r.status} ${r.issues.join('; ')}`)
      })
      highlights.push(...glossed)
      quiz = (await deps.quiz(quizInput(segs.map((s) => ({ index: s.index, text: s.text, native: native[s.index]![natives[0]!] ?? '' })), results), lang, natives[0]!)).items
    } else highlights.push(...picked)
    mark(`highlights: ${highlights.length}${doAi ? `, glossed, ${quiz?.length ?? 0} quiz items` : ''}`)
    // 7. VTT files: the target VTT is already on disk (step 3) and its findings fail the clip; native findings (2 × 56, 26 cps) are warnings
    run.step('vtt')
    const targetCheck = checkVtt(targetVtt, lang)
    if (targetCheck.findings.length) throw new Error(`target VTT lint: ${targetCheck.findings.map((f) => `${f.id} ${f.problem}=${f.value}`).join('; ')}`)
    for (const n of natives) {
      const vtt = cuesToVtt(segs.map((s) => ({ ...s, text: native[s.index]![n] || ' ' })), n, input.vttNote)
      for (const f of checkVtt(vtt, n, NATIVE_LINT_LIMITS).findings) warnings.push(`native ${n} ${f.id} ${f.problem}=${f.value}`)
      await writeFile(`${work}/native-${n}.vtt`, vtt); vttFiles[n] = `${work}/native-${n}.vtt`
    }
    mark('vtt written')
    // 8. package (+ publish)
    run.step('package')
    const manifest = await pack({ work, lang, natives }, deps)
    mark('packaged')
    // 9. clip.json (written before publish so the publish step can upload it)
    run.step('clip')
    const cost = deps.cost?.()
    const cues: PreparedCue[] = segs.map((s) => ({ index: s.index, startMs: Math.round(s.startS * 1000), endMs: Math.round(s.endS * 1000), text: s.text, native: native[s.index]!, tokens: tokensByCue[s.index]! }))
    const clipBase = {
      version: 1 as const, slug, sourceLang: lang, natives, level, coverageRank: coverage, durationS, cues, highlights, ...(quiz ? { quiz } : {}),
      tracks: { manifest: 'master.m3u8', vtt: Object.fromEntries([lang, ...natives].map((c) => [c, `vtt/${c}.vtt`])) },
      source: { uri: source, transcribeJob }, generated: { at: deps.now().toISOString(), pipeline: PIPELINE_VERSION, lemmatizer: deps.lemmatizer.name, ai: doAi, timings: run.timings() }, warnings,
      ...(cost ? { cost } : {}),
    }
    const clipJson = `${work}/clip.json`
    const write = (clip: PreparedClip) => writeFile(clipJson, JSON.stringify(clip, null, 2) + '\n')
    let clip = PreparedClip.parse({ ...clipBase, publishedBase: null })
    await write(clip)
    if (doPublish) {
      run.step('publish')
      const publishedBase = await publish({ work, slug, lang, natives, bucket: bucket!, cloudfrontDomain: cloudfrontDomain! }, deps)
      run.step(null)
      clip = PreparedClip.parse({ ...clipBase, generated: { ...clipBase.generated, timings: run.timings() }, publishedBase })
      await write(clip); mark('published')
    }
    run.step(null)
    await run.write(work)
    for (const w of warnings) deps.log(`warning: ${w}`)
    deps.log(`prepared ${slug}: level ${level} (coverage rank ${coverage}), ${cues.length} cues, ${highlights.length} highlights, ${quiz ? `${quiz.length} quiz items` : 'no glosses or quiz (--no-ai)'}, ${warnings.length} warnings, ${dropped.length} dropped, ${durationS.toFixed(1)} s, lemmatizer ${deps.lemmatizer.name} → ${clip.publishedBase ?? 'not published'} (${work})${cost ? `, cost $${cost.usd.toFixed(4)} (${cost.calls} calls, ${cost.cachedCalls} cached)` : ''}`)
    return { clip, workDir: work, files: { clipJson, vtt: vttFiles, manifest } }
  } catch (e) {
    await run.write(work, e)
    throw e
  }
}
