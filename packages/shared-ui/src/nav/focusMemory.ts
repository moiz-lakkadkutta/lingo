/**
 * Focus memory = remount + hasTVPreferredFocus on the remembered element (docs/plans/LING-005.md §0.2). Vega honours
 * hasTVPreferredFocus on initial mount only (decision 0006 §5); popped-back screens remount, so this works on both OSes.
 */
export interface FocusMemory { get(key: string): string | undefined; set(key: string, id: string): void; forget(key: string): void }
export function createFocusMemory(): FocusMemory {
  const m = new Map<string, string>()
  return { get: (k) => m.get(k), set: (k, id) => { m.set(k, id) }, forget: (k) => { m.delete(k) } }
}
/** remembered if it is in `available`, else fallback if it is in available, else available[0], else null. */
export function pickPreferred(remembered: string | undefined, available: readonly string[], fallback: string): string | null {
  if (remembered !== undefined && available.includes(remembered)) return remembered
  if (available.includes(fallback)) return fallback
  return available[0] ?? null
}
/** Prop every screen with focus memory takes. Root builds it from the route key. */
export interface FocusMemoryProps { initialFocus?: string; onFocusId(id: string): void }
