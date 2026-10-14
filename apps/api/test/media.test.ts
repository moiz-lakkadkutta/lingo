import request from 'supertest'
import { ClipResponse } from '@lingo/contracts'
import { DEFAULT_MEDIA_BASE, manifestUrlFor, mediaUrlFor } from '../src/lib/media'
import { Env } from '../src/lib/env'

// S1 follow-up: a device spike points manifests at a local media server (`pnpm media:dev`) through MEDIA_BASE_URL instead of a proxy.
describe('MEDIA_BASE_URL', () => {
  it('manifests use CloudFront when set, else MEDIA_BASE_URL on any port, else http://localhost', () => {
    expect(manifestUrlFor('demo-de/master.m3u8', { CLOUDFRONT_DOMAIN: 'd1.cloudfront.net', MEDIA_BASE_URL: 'http://localhost:8090' })).toBe('https://d1.cloudfront.net/demo-de/master.m3u8')
    expect(manifestUrlFor('demo-de/master.m3u8', { MEDIA_BASE_URL: 'http://localhost:8090' })).toBe('http://localhost:8090/demo-de/master.m3u8')
    expect(manifestUrlFor('demo-de/master.m3u8', { CLOUDFRONT_DOMAIN: '', MEDIA_BASE_URL: 'http://192.168.1.20:9000/media/' })).toBe('http://192.168.1.20:9000/media/demo-de/master.m3u8')
    expect(manifestUrlFor('demo-de/master.m3u8', {})).toBe(`${DEFAULT_MEDIA_BASE}/demo-de/master.m3u8`)
    expect(manifestUrlFor(null, { MEDIA_BASE_URL: 'http://localhost:8090' })).toBeNull()
    expect(mediaUrlFor('/a/b.m3u8', { MEDIA_BASE_URL: 'http://localhost:8090//' })).toBe('http://localhost:8090/a/b.m3u8')
  })

  it('env accepts an http(s) URL with any port, treats blank as unset, and rejects other schemes', () => {
    const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/x' }
    expect(Env.parse({ ...base, MEDIA_BASE_URL: 'http://localhost:8090' }).MEDIA_BASE_URL).toBe('http://localhost:8090')
    expect(Env.parse({ ...base, MEDIA_BASE_URL: 'https://media.example.test' }).MEDIA_BASE_URL).toBe('https://media.example.test')
    expect(Env.parse({ ...base, MEDIA_BASE_URL: '' }).MEDIA_BASE_URL).toBeUndefined()
    expect(Env.parse(base).MEDIA_BASE_URL).toBeUndefined()
    expect(() => Env.parse({ ...base, MEDIA_BASE_URL: 'ftp://localhost:21' })).toThrow(/http/)
    expect(() => Env.parse({ ...base, MEDIA_BASE_URL: 'localhost:8090' })).toThrow()
  })

  it('GET /clips/:slug serves the manifest from MEDIA_BASE_URL', async () => {
    vi.resetModules()
    vi.stubEnv('MEDIA_BASE_URL', 'http://localhost:8090')
    vi.stubEnv('CLOUDFRONT_DOMAIN', '')
    try {
      const { createApp } = await import('../src/app')
      const { fixtures } = await import('./helpers/fixtures005')
      const fx = fixtures('media')
      try {
        const c = await fx.clip()
        const d = fx.device()
        await fx.learner(d)
        const r = await request(createApp()).get(`/clips/${c.slug}`).set('x-device-id', d).set('x-native', 'en')
        expect(r.status).toBe(200)
        const body = ClipResponse.parse(r.body.data)
        if (body.status !== 'ready') throw new Error('expected ready')
        expect(body.manifestUrl).toBe(`http://localhost:8090/clips/${c.slug}/master.m3u8`)
      } finally { await fx.cleanup() }
    } finally { vi.unstubAllEnvs() }
  })
})
