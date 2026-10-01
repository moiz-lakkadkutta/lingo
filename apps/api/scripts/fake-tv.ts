/**
 * A stand-in TV for testing the phone without a Fire TV (docs/plans/LING-006.md §Fake TV).
 * pnpm --filter @lingo/api exec tsx scripts/fake-tv.ts [--api http://localhost:4000] [--device fake-tv-1]
 * Commands on stdin: s = save the next word (emits word:saved to the phone), q = quiz:start for the last saved word's clip, x = exit.
 */
import { createInterface } from 'node:readline'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { SessionDto } from '@lingo/contracts'
import type { ClientToServerEvents, ServerToClientEvents } from '@lingo/contracts'
import { db } from '../src/lib/db'

const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] ?? fallback : fallback }
const api = arg('api', 'http://localhost:4000').replace(/\/$/, '')
const device = arg('device', 'fake-tv-1')
const headers = { 'content-type': 'application/json', 'x-device-id': device }

async function highlights() {
  const take = () => db.highlight.findMany({ take: 10, orderBy: { id: 'asc' }, include: { cue: { include: { clip: { select: { slug: true } } } } } })
  let hs = await take()
  if (hs.length) return hs
  const clip = await db.clip.upsert({ where: { slug: 'fake-tv-demo' }, update: {}, create: { slug: 'fake-tv-demo', title: 'Am Bahnhof (fake TV)', sourceLang: 'de', durationS: 30, level: 'A2', coverageRank: 1000, license: 'CC BY 4.0', attribution: 'Lingo test fixture', status: 'ready' } })
  const cue = await db.cue.create({ data: { clipId: clip.id, index: 0, startMs: 0, endMs: 3000, text: 'Der Zug fährt gleich vom Bahnhof ab.', native: { en: 'The train is about to leave the station.' } } })
  for (const [w, g, l] of [['Zug', 'train', 'A1'], ['Bahnhof', 'station', 'A1'], ['gleich', 'in a moment', 'A2']] as const)
    await db.highlight.create({ data: { cueId: cue.id, word: w, lemma: w.toLowerCase(), rank: 500, gloss: g, grammar: 'noun', example: `Der ${w} ist da.`, level: l } })
  hs = await take()
  return hs
}

async function main() {
  const r = await fetch(`${api}/sessions`, { method: 'POST', headers })
  const { code } = SessionDto.parse(((await r.json()) as { data: unknown }).data)
  console.log(`code: ${code}\nlink: lingo://join/${code}\ncommands: s = save a word, q = quiz:start, x = exit`)
  const hs = await highlights()
  let next = 0; let lastClip: string | null = null
  const s: Socket<ServerToClientEvents, ClientToServerEvents> = io(api, { transports: ['websocket'] })
  s.on('connect', () => s.emit('join', { code, role: 'tv' }))
  s.on('session:state', (p) => console.log('session:state', p))
  s.on('session:error', (p) => console.log('session:error', p))
  s.on('phone:connected', (p) => console.log('phone:connected', p))
  s.on('phone:disconnected', (p) => console.log('phone:disconnected', p))
  s.on('quiz:result', (p) => console.log('quiz:result', p))
  const rl = createInterface({ input: process.stdin })
  for await (const line of rl) {
    const cmd = line.trim()
    if (cmd === 's') {
      const h = hs[next++ % hs.length]!
      const res = await fetch(`${api}/me/words`, { method: 'POST', headers, body: JSON.stringify({ highlightId: h.id, sessionCode: code }) })
      lastClip = h.cue.clip.slug
      console.log(`saved ${h.word} (${res.status})`)
    } else if (cmd === 'q') {
      s.emit('quiz:start', { code, clipSlug: lastClip }); console.log('quiz:start', { code, clipSlug: lastClip })
    } else if (cmd === 'x') break
  }
  s.disconnect(); rl.close(); await db.$disconnect()
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1) })
