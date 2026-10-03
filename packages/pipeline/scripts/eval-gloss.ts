/**
 * Gloss eval (docs/plans/LING-002-gate-c.md §9.3): runs glossClip (and with --quiz the real quiz) on a committed gold set with one model
 * configuration, scores it, writes work/eval/<gold>.<model>.<config>.json and prints one row per item plus a summary line.
 * Exit code 0 always: it is a measurement, not a gate. Only ever run it on gold files.
 *
 *   AWS_PROFILE=… pnpm --filter @lingo/pipeline eval:gloss --gold eval/gold/en-de.what-to-do-on-a-date-1950.json \
 *     --model us.amazon.nova-2-lite-v1:0 [--reasoning low] [--quiz] [--no-cache]
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { Command } from 'commander'
import { createAi } from '../src/ai/index'
import type { Reasoning } from '../src/ai/call'
import { GLOSS_PROMPT_VERSION } from '../src/ai/gloss'
import { glossClip, quizInput } from '../src/ai/glossClip'
import { GoldSet, isExcluded } from '../src/eval/gold'
import { scoreSet } from '../src/eval/score'

const o = new Command()
  .requiredOption('--gold <file>', 'gold set JSON (eval/gold/…)')
  .option('--model <id>', 'Bedrock model id (default: LINGO_AI_MODEL / NOVA_LITE_MODEL_ID / Lite v1)')
  .option('--reasoning <level>', 'off | low | medium (Nova 2 Lite only)', 'off')
  .option('--quiz', 'also build the quiz from the ok cards and run the automatic quiz checks')
  .option('--no-cache', 'use a throwaway cache (every call goes to Bedrock)')
  .option('--verbose', 'print the AI log lines')
  .parse()
  .opts<{ gold: string; model?: string; reasoning: string; quiz?: boolean; cache: boolean; verbose?: boolean }>()

if (!['off', 'low', 'medium'].includes(o.reasoning)) throw new Error(`--reasoning must be off, low or medium, got ${o.reasoning}`)
const gold = GoldSet.parse(JSON.parse(await readFile(o.gold, 'utf8')))
const cacheDir = o.cache ? join('data', '.cache', 'ai-eval') : await mkdtemp(join(tmpdir(), 'lingo-eval-'))
const log = o.verbose ? (m: string) => console.log(m) : () => {}
const ai = createAi({ ...(o.model ? { model: o.model } : {}), reasoning: o.reasoning as Reasoning, cacheDir, log })
const model = ai.config.model

const items = gold.items.filter((g) => !isExcluded(g)).map((g) => ({ cueIndex: g.cueIndex, word: g.word, lemma: g.lemma, rank: 0, cue: g.cue, ...(g.nativeCue ? { nativeCue: g.nativeCue } : {}) }))
const results = await glossClip(ai, items, gold.lang, gold.native, gold.level, log)
let quiz
if (o.quiz) {
  const cues = [...new Map(gold.items.map((g) => [g.cueIndex, { index: g.cueIndex, text: g.cue, native: g.nativeCue ?? '' }])).values()].sort((a, b) => a.index - b.index)
  quiz = (await ai.quiz(quizInput(cues, results), gold.lang, gold.native)).items
}
const score = scoreSet(gold, results, quiz, ai.cost().usd)

const config = `v${GLOSS_PROMPT_VERSION}.reasoning-${o.reasoning}`
const name = basename(o.gold).replace(/\.json$/, '')
await mkdir(join('work', 'eval'), { recursive: true })
const out = join('work', 'eval', `${name}.${model.replace(/[:/]/g, '_')}.${config}.json`)
await writeFile(out, JSON.stringify({ gold: o.gold, model, reasoning: o.reasoning, promptVersion: GLOSS_PROMPT_VERSION, at: new Date().toISOString(), score, results, quiz, cost: ai.cost() }, null, 2) + '\n')

for (const s of score.items) {
  const excluded = s.status === 'excluded'
  const failed = excluded ? [] : Object.entries(s.checks).filter(([k, v]) => !v && k !== 'S-FIRST').map(([k]) => k)
  const first = s.checks['S-FIRST'] || excluded ? '' : ' (retry/re-ask)'
  console.log(`${s.pass ? 'PASS' : 'FAIL'} ${s.id.padEnd(18)} ${s.status.padEnd(9)} ${failed.join(',').padEnd(24)} ${s.gloss}${s.ambiguous ? ' [ambiguous]' : ''}${first}`)
}
const firstTry = score.items.filter((s, i) => !isExcluded(gold.items[i]!) && s.checks['S-FIRST']).length
const quizText = score.quizChecks ? ` · quiz ${quiz!.length} items, auto ${Object.values(score.quizChecks).filter(Boolean).length}/${Object.keys(score.quizChecks).length}${Object.values(score.quizChecks).every(Boolean) ? '' : ` (failed: ${Object.entries(score.quizChecks).filter(([, v]) => !v).map(([k]) => k).join(', ')})`}` : ''
console.log(`eval ${name} · ${model} · v${GLOSS_PROMPT_VERSION} · reasoning ${o.reasoning} · ${score.passed}/${score.total} · reject hits ${score.rejectHits} · excluded ${score.excludedOk ? 'ok' : 'FAIL'} · first try ${firstTry}/${score.total}${quizText} · $${score.usd.toFixed(4)} (${ai.cost().calls} calls, ${ai.cost().cachedCalls} cached) → ${out}`)
