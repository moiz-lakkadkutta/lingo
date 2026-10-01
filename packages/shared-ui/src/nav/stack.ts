/** Hand-rolled navigation stack (docs/plans/LING-005.md §0.1): a pure reducer, one BackHandler listener in Root, only the top route mounted. */
export type WordsFilter = 'all' | 'due' | 'learned'
export type Route =
  | { name: 'firstRun' } | { name: 'home' } | { name: 'clip'; slug: string }
  | { name: 'player'; slug: string; challenge: boolean } | { name: 'summary'; slug: string } | { name: 'quiz'; slug: string }
  | { name: 'words'; filter: WordsFilter } | { name: 'settings' } | { name: 'pair' } | { name: 'about' } | { name: 'plus' }
/** Never empty. */
export interface NavState { stack: readonly Route[] }
export type NavAction = { type: 'push'; route: Route } | { type: 'replace'; route: Route } | { type: 'pop' } | { type: 'reset'; route: Route }

export function initialNav(route: Route = { name: 'home' }): NavState { return { stack: [route] } }
export function top(s: NavState): Route { return s.stack[s.stack.length - 1]! }
export function canPop(s: NavState): boolean { return s.stack.length > 1 }

/** 'home' · 'clip:<slug>' · 'player:<slug>' · … · 'words' (the filter is ignored: one memory for the Words screen). */
export function routeKey(r: Route): string {
  switch (r.name) {
    case 'clip': case 'player': case 'summary': case 'quiz': return `${r.name}:${r.slug}`
    default: return r.name
  }
}

/** push of a route equal (routeKey) to the top is a no-op; pop on a single-entry stack is a no-op; reset → [route]. Pure. */
export function navReduce(s: NavState, a: NavAction): NavState {
  switch (a.type) {
    case 'push': return routeKey(top(s)) === routeKey(a.route) ? s : { stack: [...s.stack, a.route] }
    case 'replace': return { stack: [...s.stack.slice(0, -1), a.route] }
    case 'pop': return canPop(s) ? { stack: s.stack.slice(0, -1) } : s
    case 'reset': return { stack: [a.route] }
    default: return s
  }
}
