import { Gloss, type GlossCard } from '@lingo/contracts'
import { cardToGloss, renderGrammar } from '../src/ai/grammar'

const card = (c: Partial<GlossCard>): GlossCard => ({ sense: 's', pos: 'other', gloss: ['x'], register: 'neutral', example: 'An example.', ...c })

describe('grammar renderer', () => {
  it('renders each pos template for en→de and de→en exactly as the table in LING-002-gate-c §3.4', () => {
    // en target, German learner
    expect(renderGrammar(card({ pos: 'noun', plural: 'rackets' }), 'en', 'de', 'racket')).toBe('Nomen, Pl. rackets')
    expect(renderGrammar(card({ pos: 'noun', plural: 'none' }), 'en', 'de', 'tennis')).toBe('Nomen, ohne Plural')
    expect(renderGrammar(card({ pos: 'verb', past: 'supervised', participle: 'supervised' }), 'en', 'de', 'supervise')).toBe('Verb: supervise, supervised, supervised')
    expect(renderGrammar(card({ pos: 'adjective', comparative: 'sweller' }), 'en', 'de', 'swell')).toBe('Adjektiv, Komparativ sweller')
    expect(renderGrammar(card({ pos: 'adjective', comparative: 'none' }), 'en', 'de', 'dead')).toBe('Adjektiv, ohne Komparativ')
    expect(renderGrammar(card({ pos: 'adverb' }), 'en', 'de', 'comfortably')).toBe('Adverb')
    expect(renderGrammar(card({ pos: 'other' }), 'en', 'de', 'hey')).toBe('Wort')
    // de target, English learner
    expect(renderGrammar(card({ pos: 'noun', article: 'der', plural: 'Regenschirme' }), 'de', 'en', 'Regenschirm')).toBe('noun, der Regenschirm, pl. Regenschirme')
    expect(renderGrammar(card({ pos: 'verb', past: 'wartete', participle: 'hat gewartet' }), 'de', 'en', 'warten')).toBe('verb: warten, wartete, hat gewartet')
    expect(renderGrammar(card({ pos: 'verb', past: 'rief an', participle: 'hat angerufen', separable: 'an' }), 'de', 'en', 'rufen')).toBe('separable verb: an|rufen, rief an, hat angerufen')
    expect(renderGrammar(card({ pos: 'verb', past: 'rief an', participle: 'hat angerufen', separable: 'an' }), 'de', 'en', 'anrufen')).toBe('separable verb: an|rufen, rief an, hat angerufen')
    expect(renderGrammar(card({ pos: 'adjective', comparative: 'spannender' }), 'de', 'en', 'spannend')).toBe('adjective, comparative spannender')
    expect(renderGrammar(card({ pos: 'adverb' }), 'de', 'en', 'gern')).toBe('adverb')
    expect(renderGrammar(card({ pos: 'other' }), 'de', 'en', 'na')).toBe('word')
    // register
    expect(renderGrammar(card({ pos: 'adjective', comparative: 'sweller', register: 'dated' }), 'en', 'de', 'swell')).toBe('Adjektiv, Komparativ sweller, veraltet')
    expect(renderGrammar(card({ pos: 'noun', plural: 'weenies', register: 'informal' }), 'en', 'de', 'weenie')).toBe('Nomen, Pl. weenies, umgangssprachlich')
    expect(renderGrammar(card({ pos: 'noun', article: 'die', plural: 'Kumpel', register: 'slang' }), 'de', 'en', 'Kumpel')).toBe('noun, die Kumpel, pl. Kumpel, slang')
    expect(renderGrammar(card({ pos: 'other', register: 'formal' }), 'en', 'de', 'hence')).toBe('Wort, gehoben')
    // other natives fall back to English labels
    expect(renderGrammar(card({ pos: 'noun', plural: 'rackets' }), 'en', 'tr', 'racket')).toBe('noun, pl. rackets')
  })

  it('never renders a comparative for a noun: pruneCard removes fields that do not belong to the pos', () => {
    expect(renderGrammar(card({ pos: 'noun', plural: 'swells', comparative: 'besser' }), 'en', 'de', 'swell')).toBe('Nomen, Pl. swells')
    expect(renderGrammar(card({ pos: 'adjective', comparative: 'sweller', plural: 'swells' }), 'en', 'de', 'swell')).toBe('Adjektiv, Komparativ sweller')
    expect(renderGrammar(card({ pos: 'noun', article: 'der', plural: 'rackets' }), 'en', 'de', 'racket')).toBe('Nomen, Pl. rackets')
  })

  it('every rendered note passes the Gloss schema (≤ 14 words, ≤ 90 chars) for the longest forms in the fixtures', () => {
    const long = 'x'.repeat(40)
    const cases: GlossCard[] = [
      card({ pos: 'verb', past: long, participle: long, register: 'informal' }),
      card({ pos: 'verb', past: 'a b c d e f', participle: 'g h i j k l', separable: 'zurück', register: 'slang' }),
      card({ pos: 'noun', article: 'die', plural: long, register: 'dated' }),
      card({ pos: 'adjective', comparative: long, register: 'formal' }),
    ]
    for (const c of cases) for (const [lang, native] of [['en', 'de'], ['de', 'en'], ['en', 'tr']] as const) {
      const g = renderGrammar(c, lang, native, 'y'.repeat(30))
      expect(Gloss.shape.grammar.safeParse(g).success, `${c.pos} ${lang}→${native}: ${g}`).toBe(true)
    }
  })

  it('cardToGloss joins two glosses with ", " and the result passes the Gloss schema', () => {
    const g = cardToGloss(card({ pos: 'adjective', gloss: ['praktisch', 'raffiniert'], comparative: 'niftier', register: 'informal', example: 'This is a nifty way to save time.' }), 'en', 'de', 'nifty')
    expect(g).toEqual({ gloss: 'praktisch, raffiniert', grammar: 'Adjektiv, Komparativ niftier, umgangssprachlich', example: 'This is a nifty way to save time.' })
    expect(Gloss.safeParse(g).success).toBe(true)
    // two long glosses that do not fit together: the first alone
    const long = cardToGloss(card({ gloss: ['a'.repeat(35), 'b'.repeat(35)] }), 'en', 'de', 'x')
    expect(long.gloss).toBe('a'.repeat(35))
  })
})
