// Prints lemmas for the words given on argv: `pnpm --filter @lingo/pipeline lemma:smoke de Warte|si Stunden angerufen`
import { pythonLemmatizer } from '../src/lemmatize'
import type { Lang } from '../src/types'
const [lang = 'de', ...words] = process.argv.slice(2)
const lm = pythonLemmatizer()
const inputs = words.map((w) => (w.endsWith('|si') ? { word: w.slice(0, -3), sentenceInitial: true } : { word: w, sentenceInitial: false }))
const res = await lm.lemmatizeAll(inputs, lang as Lang)
console.log(lm.name)
inputs.forEach((i, k) => console.log(`${i.word}${i.sentenceInitial ? '|si' : ''} → ${res[k]!.lemma}${res[k]!.known ? '' : ' (unknown)'}`))
