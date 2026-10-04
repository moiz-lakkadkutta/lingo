import type { Level, ProgressStats } from '@lingo/contracts'
import { strings } from '../strings'
/** Progress view-model. The streak never shows as zero: a missed day says "Welcome back"; no fire anywhere. */
export function streakView(s: ProgressStats['streak']): { kind: 'day' | 'welcome' | 'first'; text: string } {
  if (s.welcomeBack) return { kind: 'welcome', text: strings.progress.welcomeBack }
  if (s.day >= 1) return { kind: 'day', text: strings.progress.day(s.day) }
  return { kind: 'first', text: strings.progress.first }
}
export function bandRows(b: ProgressStats['bands']): Array<{ level: Level; known: number; saved: number; fraction: number; value: string; label: string }> {
  return b.map(({ level, known, saved }) => ({
    level, known, saved, fraction: saved ? known / saved : 0,
    value: strings.progress.bandValue(known, saved), label: strings.progress.bandLabel(level, known, saved),
  }))
}
export function nextReview(s: Pick<ProgressStats, 'dueNow' | 'newNow' | 'dueTomorrow'>): { text: string; canReview: boolean } {
  const now = s.dueNow + s.newNow
  if (now > 0) return { text: strings.progress.dueNow(now), canReview: true }
  if (s.dueTomorrow > 0) return { text: strings.progress.dueTomorrow(s.dueTomorrow), canReview: false }
  return { text: strings.progress.nothingDue, canReview: false }
}
