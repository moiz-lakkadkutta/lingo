/**
 * Small English/German word tables for the gloss-card form rules (docs/plans/LING-002-gate-c.md §4). Written by hand for this project,
 * grouped by inflection pattern. A missing irregular verb shows up as an F-VERB-en issue in the eval (S-VALID); add it here.
 */

/** Irregular verbs whose base, past and participle are all the same. */
const SAME_THREE = 'bet bid burst cast cost cut fit hit hurt let put quit read rid set shed shut slit split spread thrust upset broadcast forecast'

/** Irregular verbs whose past and participle are the same form ("base past"). Alternatives separated by "/". */
const PAST_IS_PARTICIPLE = [
  'bring brought', 'buy bought', 'catch caught', 'fight fought', 'seek sought', 'teach taught', 'think thought',
  'bend bent', 'build built', 'lend lent', 'send sent', 'spend spent',
  'bleed bled', 'breed bred', 'feed fed', 'flee fled', 'lead led', 'speed sped',
  'creep crept', 'deal dealt', 'dream dreamt/dreamed', 'feel felt', 'keep kept', 'kneel knelt/kneeled', 'leave left', 'mean meant',
  'meet met', 'sleep slept', 'sweep swept', 'weep wept', 'lose lost', 'shoot shot', 'light lit/lighted', 'slide slid',
  'bind bound', 'find found', 'grind ground', 'wind wound',
  'hang hung/hanged', 'cling clung', 'fling flung', 'sling slung', 'sting stung', 'stick stuck', 'strike struck', 'swing swung', 'wring wrung',
  'dig dug', 'spin spun', 'sit sat', 'spit spat', 'stand stood', 'hold held',
  'have had', 'hear heard', 'lay laid', 'pay paid', 'say said', 'make made', 'sell sold', 'tell told', 'shine shone/shined', 'win won',
  'burn burnt/burned', 'learn learnt/learned', 'smell smelt/smelled', 'spell spelt/spelled', 'spill spilt/spilled', 'spoil spoilt/spoiled',
  'leap leapt/leaped', 'lean leant/leaned', 'dwell dwelt/dwelled', 'kneel knelt', 'plead pled/pleaded', 'sneak snuck/sneaked',
  'strive strove', 'slay slew', 'shoe shod',
]

/** Irregular verbs with three forms ("base past participle"). Alternatives separated by "/". */
const THREE_FORMS = [
  'be was/were been', 'do did done', 'go went gone', 'get got got/gotten', 'come came come', 'run ran run', 'become became become',
  'begin began begun', 'drink drank drunk', 'ring rang rung', 'shrink shrank shrunk', 'sing sang sung', 'sink sank sunk',
  'spring sprang sprung', 'stink stank stunk', 'swim swam swum',
  'bite bit bitten', 'hide hid hidden', 'drive drove driven', 'ride rode ridden', 'rise rose risen', 'write wrote written',
  'strive strove striven', 'stride strode stridden', 'arise arose arisen', 'smite smote smitten',
  'blow blew blown', 'grow grew grown', 'know knew known', 'throw threw thrown', 'fly flew flown', 'draw drew drawn',
  'break broke broken', 'choose chose chosen', 'freeze froze frozen', 'speak spoke spoken', 'steal stole stolen', 'wake woke woken',
  'weave wove woven', 'awake awoke awoken',
  'bear bore born/borne', 'swear swore sworn', 'tear tore torn', 'wear wore worn',
  'eat ate eaten', 'fall fell fallen', 'beat beat beaten', 'give gave given', 'forbid forbade forbidden', 'forget forgot forgotten',
  'forgive forgave forgiven', 'see saw seen', 'shake shook shaken', 'take took taken', 'lie lay lain', 'tread trod trodden',
  'show showed shown/showed', 'mow mowed mown/mowed', 'prove proved proven/proved', 'sew sewed sewn/sewed', 'sow sowed sown/sowed',
  'swell swelled swollen/swelled', 'hew hewed hewn/hewed', 'saw sawed sawn/sawed', 'shear sheared shorn/sheared',
  'dive dove/dived dived', 'slay slew slain', 'thrive throve/thrived thriven/thrived', 'stave stove/staved stove/staved',
]

/** Prefixes that keep the base verb's irregular forms (understand → understood, overtake → overtook). */
const VERB_PREFIXES = ['under', 'over', 'with', 'fore', 'out', 'mis', 'up', 're', 'un', 'be']

export interface IrregularVerb { past: string[]; participle: string[] }

function buildIrregularVerbs(): Map<string, IrregularVerb> {
  const m = new Map<string, IrregularVerb>()
  const add = (base: string, past: string[], participle: string[]) => {
    const prev = m.get(base)
    m.set(base, { past: [...new Set([...(prev?.past ?? []), ...past])], participle: [...new Set([...(prev?.participle ?? []), ...participle])] })
  }
  for (const v of SAME_THREE.split(' ')) add(v, [v], [v])
  for (const e of PAST_IS_PARTICIPLE) { const [b, p] = e.split(' ') as [string, string]; add(b, p.split('/'), p.split('/')) }
  for (const e of THREE_FORMS) { const [b, p, pp] = e.split(' ') as [string, string, string]; add(b, p.split('/'), pp.split('/')) }
  return m
}

export const IRREGULAR_VERBS: ReadonlyMap<string, IrregularVerb> = buildIrregularVerbs()

/** The irregular forms of a verb, including a prefixed one (understand → stand). */
export function irregularVerb(lemma: string): IrregularVerb | undefined {
  const l = lemma.toLowerCase()
  const direct = IRREGULAR_VERBS.get(l)
  if (direct) return direct
  for (const p of VERB_PREFIXES) {
    if (!l.startsWith(p) || l.length - p.length < 2) continue
    const base = IRREGULAR_VERBS.get(l.slice(p.length))
    if (base) return { past: base.past.map((f) => p + f), participle: base.participle.map((f) => p + f) }
  }
  return undefined
}

/** Irregular English plurals (singular → plural). */
export const IRREGULAR_PLURALS: Readonly<Record<string, string[]>> = {
  child: ['children'], man: ['men'], woman: ['women'], person: ['people', 'persons'], foot: ['feet'], tooth: ['teeth'], goose: ['geese'],
  mouse: ['mice'], ox: ['oxen'], life: ['lives'], knife: ['knives'], wife: ['wives'], leaf: ['leaves'], half: ['halves'], wolf: ['wolves'],
  shelf: ['shelves'], thief: ['thieves'], calf: ['calves'],
}

/** English nouns whose plural is the singular. */
export const INVARIANT_NOUNS: ReadonlySet<string> = new Set(['sheep', 'deer', 'fish', 'series', 'species', 'aircraft', 'means'])

/** Irregular English comparatives. */
export const IRREGULAR_COMPARATIVES: Readonly<Record<string, string[]>> = {
  good: ['better'], well: ['better'], bad: ['worse'], ill: ['worse'], far: ['farther', 'further'], little: ['less'], many: ['more'], much: ['more'],
}

/** Irregular German comparatives (LING-002-gate-c §4 F-COMP-de). */
export const GERMAN_IRREGULAR_COMPARATIVES: Readonly<Record<string, string>> = { gut: 'besser', viel: 'mehr', gern: 'lieber', hoch: 'höher', nah: 'näher' }

/**
 * Frequent function words per language, with the words both languages share removed (in, an, so, was, die, war, man, will, also, hat,
 * bad, fast, rest, gift, her): X-LANG compares how many of each an example contains.
 */
export const STOPWORDS: Readonly<Record<'en' | 'de', ReadonlySet<string>>> = {
  en: new Set(('the and of to is are you that it he she they we my your his with for on at this be have has not but or from by what can do ' +
    'there our me too very a i were').split(' ')),
  de: new Set(('der und ist ich du er sie wir ihr nicht mit den dem des ein eine einen zu auf für von aus bei mein meine meinem dein sehr ' +
    'auch noch wie aber oder sind kann haben mich dich uns wenn').split(' ')),
}

/** Words that do not count as content words of a gloss (articles, reflexive and infinitive markers, "something/someone"). */
export const FUNCTION_WORDS: Readonly<Record<string, ReadonlySet<string>>> = {
  de: new Set('der die das den dem des ein eine einen einem einer eines sich zu und oder etwas jemand jemanden jemandem'.split(' ')),
  en: new Set('the a an to be and or something someone sth sb'.split(' ')),
}
