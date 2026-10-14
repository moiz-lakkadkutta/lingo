// Tiny static media server for device spikes: serves a local HLS directory over plain http on any port, so the API's
// MEDIA_BASE_URL can point at it (no proxy, no port 80). Dev only; never deploy this.
//   pnpm media:dev [--dir media] [--port 8090]        (or MEDIA_DIR / MEDIA_PORT)
// Layout: <dir>/<manifest key>, e.g. media/demo-de/master.m3u8 for `pnpm --filter @lingo/api seed:dev` (key demo-de/master.m3u8).
// On a Fire TV: `adb reverse tcp:8090 tcp:8090` and MEDIA_BASE_URL=http://localhost:8090 on the API.
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined }
const root = resolve(arg('dir') ?? process.env.MEDIA_DIR ?? 'media')
const port = Number(arg('port') ?? process.env.MEDIA_PORT ?? 8090)

const TYPES = {
  '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.m4s': 'video/iso.segment', '.mp4': 'video/mp4', '.m4a': 'audio/mp4',
  '.aac': 'audio/aac', '.vtt': 'text/vtt', '.webvtt': 'text/vtt', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png',
}

/** The file for a request path inside root, or null (outside root, missing, or a directory). */
export function fileFor(rootDir, urlPath) {
  let p
  try { p = decodeURIComponent(urlPath.split('?')[0]) } catch { return null }
  const abs = resolve(join(rootDir, p))
  if (abs !== rootDir && !abs.startsWith(rootDir + sep)) return null
  try { return statSync(abs).isFile() ? abs : null } catch { return null }
}

export function handler(rootDir) {
  return (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Range')
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range')
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return }
    const file = fileFor(rootDir, req.url ?? '/')
    if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found\n'); return }
    const size = statSync(file).size
    const headers = { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' }
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
      const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
      if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
      if (req.method === 'HEAD') { res.end(); return }
      createReadStream(file, { start, end }).pipe(res)
      return
    }
    res.writeHead(200, { ...headers, 'Content-Length': size })
    if (req.method === 'HEAD') { res.end(); return }
    createReadStream(file).pipe(res)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer(handler(root)).listen(port, () => {
    console.log(`media: serving ${root} on http://localhost:${port}/`)
    console.log(`API: MEDIA_BASE_URL=http://localhost:${port}   Fire TV: adb reverse tcp:${port} tcp:${port}`)
  })
}
