import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import type { DueWord, Grade, Lang } from '@lingo/contracts'
import { Button } from '../components/Button'
import { Hint } from '../components/Hint'
import { Page } from '../components/Page'
import type { PhoneApi } from '../lib/api'
import { buildDeck, deckCounts, deckReducer, initialDeck, needsPost, type DeckCard, type DeckEvent, type DeckState } from '../lib/deck'
import { speakWord } from '../lib/speech'
import { strings } from '../strings'
import { color, radius, space, type } from '../theme'

export interface QuizScreenProps { api: PhoneApi; firstClip: string | null; learning: Lang; onResult(correct: number, total: number): boolean; onProgress(): void }
const GRADES: Grade[] = ['again', 'hard', 'good', 'easy']

/** Same strip as shared-ui stripToken (packages/shared-ui/src/screens/player/align.ts) and packages/pipeline/src/tokenize.ts. */
const strip = (s: string) => s.replace(/^[^\p{L}\p{N}'’-]+/u, '').replace(/[^\p{L}\p{N}'’-]+$/u, '')
/** The cue split around the first token that is the word (exact, then case-insensitive); null when no token matches. */
export function markCue(cue: string, word: string): { before: string; mark: string; after: string } | null {
  const parts = cue.split(/(\s+)/)
  let i = parts.findIndex((p) => p.trim() && strip(p) === word)
  if (i < 0) i = parts.findIndex((p) => p.trim() && strip(p).toLowerCase() === word.toLowerCase())
  if (i < 0) return null
  const p = parts[i]!; const core = strip(p); const at = p.indexOf(core)
  return { before: parts.slice(0, i).join('') + p.slice(0, at), mark: core, after: p.slice(at + core.length) + parts.slice(i + 1).join('') }
}

/** deckReducer plus a reset when a (re)load brings a new list. */
const quizReducer = (s: DeckState, e: DeckEvent | { type: 'reset'; cards: DeckCard[] }): DeckState => (e.type === 'reset' ? initialDeck(e.cards) : deckReducer(s, e))

/** 8-64 of [A-Za-z0-9_-] (contracts ReviewId); unique enough per saved word, which is all the server's constraint needs. */
export const newReviewId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; words: DueWord[] }

/** Due deck, SM-2 server-side: flip → Again · Hard · Good · Easy (equal, same style). No score, no percentage, no right/wrong language. */
export function QuizScreen({ api, firstClip, learning, onResult, onProgress }: QuizScreenProps) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [deck, dispatch] = useReducer(quizReducer, [], initialDeck)
  const [sent, setSent] = useState(false)
  const reported = useRef(false)
  /** One reviewId per word per deck: a retry after a lost answer resends it, so the server applies SM-2 once (POST /me/reviews). */
  const reviewIds = useRef(new Map<string, string>())

  const fetchDeck = useCallback(() => {
    setLoad({ kind: 'loading' })
    api.dueWords().then(
      (words) => { reported.current = false; reviewIds.current = new Map(); setSent(false); dispatch({ type: 'reset', cards: buildDeck(words, firstClip) }); setLoad({ kind: 'ready', words }) },
      () => setLoad({ kind: 'error' }),
    )
  }, [api, firstClip])
  useEffect(() => { fetchDeck() }, [fetchDeck])

  useEffect(() => {
    if (load.kind !== 'ready' || !deck.done || reported.current || deck.firstPass.graded === 0) return
    reported.current = true
    setSent(onResult(deck.firstPass.correct, deck.firstPass.graded))
  }, [load.kind, deck.done, deck.firstPass, onResult])

  const reviewIdFor = (savedWordId: string) => {
    let id = reviewIds.current.get(savedWordId)
    if (!id) { id = newReviewId(); reviewIds.current.set(savedWordId, id) }
    return id
  }
  const grade = async (g: Grade) => {
    const card = deck.queue[0]
    if (!card || !deck.flipped || deck.posting) return
    dispatch({ type: 'gradeStart' })
    if (!needsPost(card)) { dispatch({ type: 'gradeOk', grade: g }); return }
    try { await api.review(card.word.savedWordId, g, reviewIdFor(card.word.savedWordId)); dispatch({ type: 'gradeOk', grade: g }) } catch { dispatch({ type: 'gradeFail' }) }
  }

  if (load.kind === 'loading') return <Page bottom={false}><ActivityIndicator color={color.interactive} /></Page>
  if (load.kind === 'error') return (
    <Page bottom={false}>
      <Hint text={strings.quiz.loadError} />
      <Button label={strings.quiz.tryAgain} onPress={fetchDeck} />
    </Page>
  )
  if (load.words.length === 0) return (
    <Page bottom={false}>
      <Text accessibilityRole="header" style={[type.title, { color: color.text }]}>{strings.quiz.emptyTitle}</Text>
      <Text style={[type.body, { color: color.textSecondary }]}>{strings.quiz.emptyBody}</Text>
    </Page>
  )
  if (deck.done) return (
    <Page bottom={false}>
      <Text accessibilityRole="header" style={[type.title, { color: color.text }]}>{strings.quiz.doneTitle}</Text>
      <Text style={[type.body, { color: color.text }]}>{strings.quiz.doneBody(deck.firstPass.graded)}</Text>
      {sent ? <Text accessibilityLiveRegion="polite" style={[type.body, { color: color.textSecondary }]}>{strings.quiz.sentToTv}</Text> : null}
      <Button label={strings.quiz.seeProgress} variant="primary" onPress={onProgress} />
    </Page>
  )

  const counts = deckCounts(load.words)
  const n = load.words.length
  const card = deck.queue[0]!
  const w = card.word
  const position = Math.min(n, deck.firstPass.graded + (card.repeat ? 0 : 1))
  const marked = markCue(w.cueText, w.word)
  return (
    <Page bottom={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[type.label, { color: color.textSecondary }]}>{strings.quiz.counts(counts.due, counts.fresh)}</Text>
        <Text style={[type.label, { color: color.textSecondary }]}>{strings.quiz.position(position, n)}</Text>
      </View>
      {!deck.flipped ? (
        <Pressable
          testID="card"
          onPress={() => dispatch({ type: 'flip' })}
          accessibilityRole="button"
          aria-label={strings.quiz.frontLabel(w.word)}
          style={{ flex: 1, backgroundColor: color.surface1, borderRadius: radius.card, padding: space.l, justifyContent: 'center', alignItems: 'center', gap: space.m }}
        >
          <Text style={[type.card, { color: color.text, textAlign: 'center' }]}>{w.word}</Text>
          <Text style={[type.body, { color: color.textSecondary }]}>{strings.quiz.reveal}</Text>
        </Pressable>
      ) : (
        // Not grouped (no `accessible`): the word, the gloss, the cue, the native line and "Hear it" are each their own screen-reader element.
        <View testID="card" style={{ flex: 1, backgroundColor: color.surface1, borderRadius: radius.card, padding: space.l, justifyContent: 'center', gap: space.m }}>
          <Text style={[type.card, { color: color.text, textAlign: 'center' }]}>{w.word}</Text>
          <Text style={[type.title, { color: color.text, textAlign: 'center' }]}>{w.gloss}</Text>
          <Text testID="cue" style={[type.body, { color: color.text, textAlign: 'center' }]}>
            {marked ? <>{marked.before}<Text testID="cue-mark" style={{ backgroundColor: color.marker, color: color.ground }}>{marked.mark}</Text>{marked.after}</> : w.cueText}
          </Text>
          {w.cueNative ? <Text style={[type.body, { color: color.nativeCue, textAlign: 'center' }]}>{w.cueNative}</Text> : null}
          <Button label={strings.live.hear} ariaLabel={strings.live.hearLabel(w.word)} onPress={() => speakWord(w.word, learning)} />
        </View>
      )}
      {deck.error ? <Hint text={strings.quiz.retry} /> : null}
      {deck.flipped ? (
        <View style={{ flexDirection: 'row', gap: space.s }}>
          {GRADES.map((g) => (
            <Button key={g} testID={`grade-${g}`} label={strings.quiz.grades[g]} ariaLabel={strings.quiz.gradeLabel(g, w.word)} disabled={deck.posting} onPress={() => { void grade(g) }} style={{ flex: 1, paddingHorizontal: space.xs }} />
          ))}
        </View>
      ) : null}
    </Page>
  )
}
