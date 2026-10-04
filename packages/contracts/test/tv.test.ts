import { describe, expect, it } from 'vitest'
import { ClipCard, ClipResponse, LevelPut, NATIVE_LANGS, highlightFloor, LEVELS, BANDS, NEXT } from '../src/index'

const card = { slug: 's', title: 'T', level: 'A2', durationS: 60, posterUrl: null, resumeS: null }
const ready = { ...card, status: 'ready', attribution: 'CC BY', manifestUrl: 'https://cdn.example/m.m3u8', sourceLang: 'de', cues: [], quiz: [], wordsYoullMeet: [] }

describe('tv contracts', () => {
  it('LevelPut accepts placement, settings and quiz bodies and rejects correct > total', () => {
    expect(LevelPut.safeParse({ source: 'placement', level: 'A2' }).success).toBe(true)
    expect(LevelPut.safeParse({ source: 'settings', level: 'B2' }).success).toBe(true)
    expect(LevelPut.safeParse({ source: 'quiz', clipSlug: 'x', correct: 9, total: 10 }).success).toBe(true)
    expect(LevelPut.safeParse({ source: 'quiz', clipSlug: 'x', correct: 11, total: 10 }).success).toBe(false)
    expect(LevelPut.safeParse({ source: 'quiz', clipSlug: 'x', correct: 0, total: 0 }).success).toBe(false)
    expect(LevelPut.safeParse({ source: 'settings', level: 'C1' }).success).toBe(false)
  })
  it('ClipResponse parses a ready clip and a preparing clip by status', () => {
    const r = ClipResponse.parse(ready)
    expect(r.status).toBe('ready')
    const p = ClipResponse.parse({ ...card, status: 'preparing', etaMin: 3 })
    expect(p.status).toBe('preparing')
    if (p.status === 'preparing') expect(p.etaMin).toBe(3)
    expect(ClipResponse.safeParse({ ...card, status: 'preparing' }).success).toBe(false)
  })
  it('ClipCard defaults completed to false and attribution to empty', () => {
    expect(ClipCard.parse(card)).toMatchObject({ completed: false, attribution: '' })
  })
  it('NATIVE_LANGS has nine unique codes including en and de', () => {
    const codes = NATIVE_LANGS.map((l) => l.code)
    expect(new Set(codes).size).toBe(9)
    expect(codes).toContain('en')
    expect(codes).toContain('de')
  })
  it('highlightFloor is 1000, 2000, 4000, 4000 for A1, A2, B1, B2', () => {
    expect(LEVELS.map(highlightFloor)).toEqual([1000, 2000, 4000, 4000])
    expect(BANDS.B2).toEqual([4000, 8000])
    expect(NEXT.B2).toBe('B2')
  })
})
