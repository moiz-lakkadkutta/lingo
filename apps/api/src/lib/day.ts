/** Every "day" in LING-006 is a UTC calendar day (docs/plans/LING-006.md, Risk R5: a per-learner time zone is a follow-up). */
export const DAY_MS = 86_400_000
/** 'YYYY-MM-DD' of the instant in UTC. */
export function utcDay(d: Date): string { return d.toISOString().slice(0, 10) }
/** The next 00:00:00.000Z strictly after the start of d's UTC day. */
export function startOfNextUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
}
/** '2026-10-01', -1 → '2026-09-30'. */
export function addUtcDays(day: string, n: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS))
}
/** 00:00:00.000Z of d's UTC day (the free tier's daily limit starts here). */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
