// node --test scripts/media-dev.test.mjs (pnpm test:scripts)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileFor, handler } from './media-dev.mjs'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'media-dev-')))
mkdirSync(join(root, 'demo-de'))
writeFileSync(join(root, 'demo-de', 'master.m3u8'), '#EXTM3U\n')
writeFileSync(join(root, 'demo-de', 'seg0.ts'), Buffer.from('0123456789'))

test('fileFor stays inside the root', () => {
  assert.equal(fileFor(root, '/demo-de/master.m3u8?x=1'), join(root, 'demo-de', 'master.m3u8'))
  assert.equal(fileFor(root, '/../etc/passwd'), null)
  assert.equal(fileFor(root, '/%2e%2e/%2e%2e/etc/passwd'), null)
  assert.equal(fileFor(root, '/demo-de'), null)
  assert.equal(fileFor(root, '/missing.m3u8'), null)
})

test('serves HLS with the right types, CORS and byte ranges', async () => {
  const server = createServer(handler(root))
  await new Promise((r) => server.listen(0, r))
  const base = `http://localhost:${server.address().port}`
  try {
    const m = await fetch(`${base}/demo-de/master.m3u8`)
    assert.equal(m.status, 200)
    assert.equal(m.headers.get('content-type'), 'application/vnd.apple.mpegurl')
    assert.equal(m.headers.get('access-control-allow-origin'), '*')
    assert.equal(await m.text(), '#EXTM3U\n')
    const seg = await fetch(`${base}/demo-de/seg0.ts`, { headers: { Range: 'bytes=2-4' } })
    assert.equal(seg.status, 206)
    assert.equal(seg.headers.get('content-type'), 'video/mp2t')
    assert.equal(seg.headers.get('content-range'), 'bytes 2-4/10')
    assert.equal(await seg.text(), '234')
    assert.equal((await fetch(`${base}/nope.ts`)).status, 404)
  } finally { server.close() }
})
