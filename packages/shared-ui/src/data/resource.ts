import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ApiError, NetworkError } from '../api/client'

export type ResourceError = 'offline' | 'notFound' | 'server'
export type Resource<T> = { state: 'loading'; data?: T } | { state: 'ready'; data: T } | { state: 'error'; error: ResourceError; data?: T }
export type ResourceEvent<T> = { type: 'load' } | { type: 'ok'; data: T } | { type: 'fail'; error: unknown }

export function errorKind(e: unknown): ResourceError {
  if (e instanceof NetworkError) return 'offline'
  if (e instanceof ApiError && e.status === 404) return 'notFound'
  return 'server'
}
const keep = <T,>(data: T | undefined) => (data === undefined ? {} : { data })
/** load keeps previous data (stale-while-revalidate); fail maps the error and keeps data. */
export function resourceReducer<T>(s: Resource<T>, e: ResourceEvent<T>): Resource<T> {
  switch (e.type) {
    case 'load': return { state: 'loading', ...keep(s.data) }
    case 'ok': return { state: 'ready', data: e.data }
    case 'fail': return { state: 'error', error: errorKind(e.error), ...keep(s.data) }
    default: return s
  }
}

/** Runs load on mount, on deps change and on reload(); ignores results that arrive after unmount or after a newer load. `initial` seeds data. */
export function useResource<T>(load: () => Promise<T>, deps: readonly unknown[], initial?: T): Resource<T> & { reload(): void } {
  const [s, dispatch] = useReducer(resourceReducer<T>, initial === undefined ? { state: 'loading' } : { state: 'loading', data: initial }) as [Resource<T>, (e: ResourceEvent<T>) => void]
  const [tick, setTick] = useState(0)
  const loadRef = useRef(load); loadRef.current = load
  const gen = useRef(0)
  useEffect(() => {
    const my = ++gen.current
    dispatch({ type: 'load' })
    loadRef.current().then((data) => { if (gen.current === my) dispatch({ type: 'ok', data }) }, (error: unknown) => { if (gen.current === my) dispatch({ type: 'fail', error }) })
    return () => { gen.current++ }
  }, [...deps, tick]) // deps are the caller's; load is read through a ref
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...s, reload }
}
