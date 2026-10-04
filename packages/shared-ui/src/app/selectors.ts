import { NATIVE_LANGS, NEXT } from '@lingo/contracts'
import type { Catalog, ClipCard, Lang, Level, LibraryWord, ProgressPut } from '@lingo/contracts'
import type { WordsFilter } from '../nav/stack'
import { strings } from '../strings'

export type RowKey = 'continue' | 'justRight' | 'harder' | 'fresh'
export interface HomeRow { key: RowKey; title: string; cards: ClipCard[] }

const unfinished = (c: ClipCard) => !c.completed
/** First just-right card not started and not finished; else first unfinished just-right; else first unfinished harder; else first fresh; else null. */
export function pickHero(c: Catalog): ClipCard | null {
  return c.justRight.find((x) => unfinished(x) && x.resumeS === null) ?? c.justRight.find(unfinished) ?? c.harder.find(unfinished) ?? c.fresh[0] ?? null
}
/** Order continue, justRight, harder, fresh; drops empty rows (so an empty Continue is hidden). */
export function homeRows(c: Catalog, level: Level): HomeRow[] {
  const rows: HomeRow[] = [
    { key: 'continue', title: strings.home.continue, cards: c.continue },
    { key: 'justRight', title: strings.home.justRight(level), cards: c.justRight },
    { key: 'harder', title: strings.home.harder(NEXT[level]), cards: c.harder },
    { key: 'fresh', title: strings.home.fresh, cards: c.fresh },
  ]
  return rows.filter((r) => r.cards.length > 0)
}
/** Next in justRight after `slug` that is not completed; else pickHero excluding slug; else null. */
export function nextClip(c: Catalog | null, slug: string): ClipCard | null {
  if (!c) return null
  const i = c.justRight.findIndex((x) => x.slug === slug)
  const after = i >= 0 ? c.justRight.slice(i + 1).find(unfinished) : undefined
  if (after) return after
  const without = (cs: ClipCard[]) => cs.filter((x) => x.slug !== slug)
  return pickHero({ continue: without(c.continue), justRight: without(c.justRight), harder: without(c.harder), fresh: without(c.fresh) })
}
export function formatMinutes(s: number): string { return strings.time.minutes(Math.max(1, Math.round(s / 60))) }
export function formatClock(s: number): string {
  const t = Math.max(0, Math.floor(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
/** Back from the player: completed when positionS ≥ durationS − 10 or ≥ 0.97·durationS. */
export function progressBody(slug: string, positionS: number, durationS: number): ProgressPut {
  return { clipSlug: slug, positionS, completed: positionS >= durationS - 10 || positionS >= 0.97 * durationS }
}
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
const dayNumber = (d: Date) => Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000)
/** due ≤ the end of `now`'s local day. */
export function isDueToday(dueIso: string, now: Date): boolean { return new Date(dueIso).getTime() <= endOfDay(now).getTime() }
export function dueLabel(dueIso: string, now: Date): string {
  if (isDueToday(dueIso, now)) return strings.words.dueToday
  const n = dayNumber(new Date(dueIso)) - dayNumber(now)
  return n <= 1 ? strings.words.dueTomorrow : strings.words.dueIn(n)
}
/** all · due (isDueToday) · learned; keeps the server's due-ascending order. */
export function filterWords(ws: readonly LibraryWord[], f: WordsFilter, now: Date): LibraryWord[] {
  if (f === 'due') return ws.filter((w) => isDueToday(w.due, now))
  if (f === 'learned') return ws.filter((w) => w.learned)
  return [...ws]
}
/** First 8 of NATIVE_LANGS whose code ≠ learning. */
export function speakOptions(learning: Lang): Array<{ code: string; name: string }> {
  return NATIVE_LANGS.filter((l) => l.code !== learning).slice(0, 8).map((l) => ({ code: l.code, name: l.name }))
}
