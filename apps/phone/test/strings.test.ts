import { strings } from '../src/strings'

/** Every string in `strings`, calling functions with sample args. */
const all = (v: unknown): string[] => {
  if (typeof v === 'string') return [v]
  if (typeof v === 'function') {
    const out: string[] = []
    for (const args of [[1], ['A2'], ['Wort'], ['good', 'Wort'], [1, 2], ['A2', 1, 2], ['Wort', 'word'], [0], [12, 3]]) {
      try { out.push(...all((v as (...a: unknown[]) => unknown)(...args))) } catch { /* not this signature */ }
    }
    return out
  }
  if (v && typeof v === 'object') return Object.values(v).flatMap(all)
  return []
}

describe('phone strings', () => {
  const texts = all(strings)
  it('no phone string says wrong, failed or streak broken', () => {
    expect(texts.length).toBeGreaterThan(60)
    for (const t of texts) expect(t.toLowerCase()).not.toMatch(/\b(wrong|failed|streak broken)\b/)
  })
  it('no string contains a fire emoji or any emoji', () => {
    for (const t of texts) expect(t).not.toMatch(/\p{Extended_Pictographic}/u)
  })
  it('every grade has a label and Welcome back is spelled exactly', () => {
    for (const g of ['again', 'hard', 'good', 'easy'] as const) {
      expect(strings.quiz.grades[g]).toMatch(/^[A-Z][a-z]+$/)
      expect(strings.quiz.gradeLabel(g, 'Wort')).toBe(`${strings.quiz.grades[g]}: schedule Wort`)
    }
    expect(strings.progress.welcomeBack).toBe('Welcome back')
  })
})
