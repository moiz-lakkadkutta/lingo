import { ApiError, NetworkError } from '../src/api/client'
import { errorKind, resourceReducer, type Resource } from '../src/data/resource'

describe('resourceReducer', () => {
  it('load keeps previous data while reloading', () => {
    const r: Resource<number> = { state: 'ready', data: 3 }
    expect(resourceReducer(r, { type: 'load' })).toEqual({ state: 'loading', data: 3 })
    expect(resourceReducer<number>({ state: 'loading' }, { type: 'ok', data: 4 })).toEqual({ state: 'ready', data: 4 })
  })
  it('a network error becomes offline, a 404 notFound, anything else server', () => {
    expect(errorKind(new NetworkError('x'))).toBe('offline')
    expect(errorKind(new ApiError(404, 'NOT_FOUND', 'x'))).toBe('notFound')
    expect(errorKind(new ApiError(500, 'INTERNAL', 'x'))).toBe('server')
    expect(errorKind(new Error('zod'))).toBe('server')
  })
  it('a failure keeps stale data', () => {
    expect(resourceReducer<number>({ state: 'loading', data: 2 }, { type: 'fail', error: new NetworkError('x') })).toEqual({ state: 'error', error: 'offline', data: 2 })
    expect(resourceReducer<number>({ state: 'loading' }, { type: 'fail', error: new Error('x') })).toEqual({ state: 'error', error: 'server' })
  })
})
