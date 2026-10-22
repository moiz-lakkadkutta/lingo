import { BlockList, isIPv4, isIPv6 } from 'node:net'

/**
 * Express 'trust proxy' setting (https://expressjs.com/en/guide/behind-proxies.html). Only a peer on loopback is trusted:
 * on the EC2 server that is Caddy, whose reverse_proxy ignores a client's own X-Forwarded-For and sends the connecting
 * address instead (https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults). A client that reaches the
 * API port directly is not on loopback, so its X-Forwarded-For is never read.
 */
export const TRUST_PROXY = 'loopback'

const unmapped = (addr: string): string => (addr.toLowerCase().startsWith('::ffff:') && isIPv4(addr.slice(7)) ? addr.slice(7) : addr)

const LOOPBACK = new BlockList()
LOOPBACK.addSubnet('127.0.0.0', 8, 'ipv4')
LOOPBACK.addAddress('::1', 'ipv6')

/** 127.0.0.0/8, ::1 and IPv4-mapped 127.x: the addresses Express's 'loopback' preset trusts. Anything that is not an IP is not loopback. */
export function isLoopback(addr: string): boolean {
  const a = unmapped(addr.trim())
  if (isIPv4(a)) return LOOPBACK.check(a, 'ipv4')
  return isIPv6(a) && LOOPBACK.check(a, 'ipv6')
}

/**
 * The client address for a connection, with the same rule Express uses for req.ip under TRUST_PROXY: walk from the peer
 * through X-Forwarded-For right to left while the hop is loopback; the first hop that is not loopback is the client.
 * If every hop is loopback, the furthest one is returned. A peer that is not loopback is returned as is.
 * Socket.IO handshakes use this (socket.handshake.address is always the proxy's address behind Caddy).
 */
export function clientIp(peer: string | undefined, forwardedFor: string | string[] | undefined): string {
  const xff = Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? '')
  const hops = [peer ?? '', ...xff.split(',').map((h) => h.trim()).filter(Boolean).reverse()]
  let ip = hops[0]
  for (let i = 0; i < hops.length - 1 && ip && isLoopback(ip); i++) ip = hops[i + 1]
  return ip || 'unknown'
}
