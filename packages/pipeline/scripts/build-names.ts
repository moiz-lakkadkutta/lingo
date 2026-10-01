/**
 * Grows data/names-{de,en}.txt (docs/decisions/0008 decision 8, docs/plans/LING-001-quality.md §5.2). Deterministic and idempotent:
 *   existing file ∪ HAND additions ∪ the Intl seed, one per line, code-point sorted (as the files have always been), header comments kept.
 * Intl seed (no network): every single-token region name (ISO 3166-1 alpha-2 + UN M49 continents) and language name (ISO 639-1) that
 * Node's ICU/CLDR data gives in that language — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames
 * (CLDR data, Unicode licence). A label is skipped when simplemma knows its lowercase form in that language AND that form ranks below
 * COMMON_RANK in freq-{lang}.txt (such a word can never be highlighted, so it stays ordinary vocabulary: deutsch, english).
 * The Wikidata given-name seed of the plan is a follow-up (not implemented; see the plan §13).
 * Run `build:freq` afterwards so the new names are stripped from the ranks (docs/decisions/0004).
 * Usage: pnpm --filter @lingo/pipeline build:names   (needs LINGO_PYTHON → venv with simplemma 2.0.0)
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR, loadFreqList, rankFn } from '../src/freq'
import { pythonLemmatizer } from '../src/lemmatize'
import { COMMON_RANK } from '../src/names'
import type { Lang } from '../src/types'

/** ISO 3166-1 alpha-2, the 249 officially assigned codes (https://www.iso.org/iso-3166-country-codes.html, OBP https://www.iso.org/obp/ui/#search). */
export const ISO_3166_1 = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK ' +
  'CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS ' +
  'GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV ' +
  'LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM ' +
  'PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR ' +
  'TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ')
/** UN M49 continent / sub-continent codes (https://unstats.un.org/unsd/methodology/m49/): Africa, Americas, Asia, Europe, Oceania, Northern America, South America. */
export const M49_CONTINENTS = ['002', '019', '142', '150', '009', '021', '005']
/** ISO 639-1 two-letter language codes CLDR names (https://www.loc.gov/standards/iso639-2/php/code_list.php), without the withdrawn aliases in/iw/ji/jw/mo. */
export const ISO_639_1 = (
  'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi ' +
  'fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ' +
  'ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ' +
  'ru rw sa sc sd se sg sh si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh ' +
  'yi yo za zh zu'
).split(' ')

/** Spot-check names from the first real run (docs/decisions/0008 decision 8). */
export const HAND: Record<Lang, string[]> = {
  de: ['Margot', 'Friedländer', 'Brasilien', 'Shanghai', 'Auschwitz', 'Theresienstadt', 'Leonie', 'Tilo', 'Mathias', 'Bröckers'],
  en: ['Pete', 'Irving', 'Margot'],
}

/** One token, starting with an upper-case letter the names files allow (A–Z, Ä, Ö, Ü — the data test's invariant), letters/apostrophes/hyphens after. */
export const SINGLE_TOKEN = /^[A-ZÄÖÜ][\p{L}'’-]*$/u

/** Every single-token region and language label CLDR gives in `lang`, de-duplicated, code-point sorted. Pure (depends only on the ICU data). */
export function intlLabels(lang: Lang): string[] {
  const region = new Intl.DisplayNames([lang], { type: 'region', fallback: 'none' })
  const language = new Intl.DisplayNames([lang], { type: 'language', fallback: 'none' })
  const labels = [...ISO_3166_1, ...M49_CONTINENTS].map((c) => region.of(c)).concat(ISO_639_1.map((c) => language.of(c)))
  return [...new Set(labels.filter((l): l is string => !!l && SINGLE_TOKEN.test(l)))].sort()
}

/** Drop a label whose lowercase form simplemma knows AND that ranks below COMMON_RANK (it can never be highlighted; it stays vocabulary). Pure. */
export function filterSeed(labels: string[], known: (lower: string) => boolean, rank: (lemma: string) => number | undefined): string[] {
  return labels.filter((l) => { const low = l.toLowerCase(); const r = rank(low); return !(known(low) && r !== undefined && r < COMMON_RANK) })
}

/** Header comments of the existing file, then existing ∪ additions, code-point sorted, one per line with a trailing LF. Pure. */
export function mergeNamesFile(text: string, additions: string[]): { text: string; added: string[] } {
  const lines = text.split('\n').map((l) => l.trim())
  const header = lines.filter((l) => l.startsWith('#'))
  const existing = new Set(lines.filter((l) => l && !l.startsWith('#')))
  const added = [...new Set(additions)].filter((a) => !existing.has(a)).sort()
  const all = [...new Set([...existing, ...added])].sort()
  return { text: [...header, ...all].join('\n') + '\n', added }
}

async function build(lang: Lang) {
  const path = resolve(DATA_DIR, `names-${lang}.txt`)
  const labels = intlLabels(lang)
  const lm = pythonLemmatizer()
  const knownList = await lm.lemmatizeAll(labels.map((l) => ({ word: l.toLowerCase(), sentenceInitial: false })), lang)
  const known = new Map(labels.map((l, i) => [l.toLowerCase(), knownList[i]!.known]))
  const rank = rankFn(await loadFreqList(lang))
  const seed = filterSeed(labels, (low) => known.get(low) ?? false, rank)
  const { text, added } = mergeNamesFile(await readFile(path, 'utf8'), [...HAND[lang], ...seed])
  await writeFile(path, text)
  console.log(`${lang}: ${labels.length} Intl labels, ${seed.length} kept after the vocabulary filter, ${added.length} new names (${HAND[lang].length} hand additions)`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) for (const lang of ['de', 'en'] as Lang[]) await build(lang)
