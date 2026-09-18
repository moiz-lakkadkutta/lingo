import http from 'node:http'
import type { Express } from 'express'
import { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@lingo/contracts'
import { createApp } from './app'
import { setIo } from './lib/io'
import { registerSockets } from './sockets'

export type LingoIo = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

/** App + HTTP + Socket.IO, no queue. index.ts and tests both use this, so tests boot exactly what production boots. */
export function createServer(): { app: Express; server: http.Server; io: LingoIo } {
  const app = createApp()
  const server = http.createServer(app)
  const io: LingoIo = new Server(server, { cors: { origin: '*' } })
  setIo(io)
  registerSockets(io)
  return { app, server, io }
}
