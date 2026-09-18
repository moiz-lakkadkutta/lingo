// socket.io-client has no native code and uses React Native's global WebSocket. Amazon lists Socket.io 4.7.5 as tested on Vega:
// https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html
import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, JoinPayload, ServerToClientEvents } from '@lingo/contracts'
import type { SessionTransport } from './types'

type LingoSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** websocket only (https://socket.io/docs/v4/client-options/#transports): no XHR long-polling or cookies on a TV runtime. */
export function createSocketTransport(): SessionTransport {
  let socket: LingoSocket | null = null
  const connectCbs = new Set<() => void>()
  const listeners: Array<{ event: keyof ServerToClientEvents; cb: (...args: never[]) => void }> = []
  return {
    connect(baseUrl) {
      if (socket) return
      socket = io(baseUrl, { transports: ['websocket'], autoConnect: true, reconnection: true, reconnectionDelayMax: 5000 })
      socket.on('connect', () => { for (const cb of connectCbs) cb() })
      for (const l of listeners) socket.on(l.event, l.cb as never)
    },
    onConnect(cb) {
      connectCbs.add(cb)
      if (socket?.connected) cb()
      return () => { connectCbs.delete(cb) }
    },
    join(p: JoinPayload) { socket?.emit('join', p) },
    on(event, cb) {
      const l = { event, cb: cb as (...args: never[]) => void }
      listeners.push(l)
      socket?.on(event, cb as never)
      return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); socket?.off(event, cb as never) }
    },
    disconnect() { socket?.disconnect(); socket = null },
  }
}
