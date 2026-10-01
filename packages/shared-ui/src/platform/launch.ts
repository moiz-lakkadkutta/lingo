import type { Catalog } from '@lingo/contracts'
import type { CatalogItem, LaunchIntent } from '@moizp/vega-media-kit'

/**
 * Launch intents from outside the app: Fire OS Android deep links (apps/expo LaunchBridge) and the Vega Content Launcher handler
 * (apps/vega/platform/contentLauncher.template.ts). The kit has no public way to feed an intent in yet (TODO(KIT-E1)), so the
 * platform entries hand Root a LaunchSource, the same pattern as RemoteSource.
 * https://developer.amazon.com/docs/vega/0.21/content-launcher-overview.html · https://developer.amazon.com/docs/catalog/integrate-with-launcher.html
 */
export interface LaunchSource { subscribe(cb: (i: LaunchIntent) => void): () => void }

/** Fan-out bus. An emit before any subscriber is queued (max 1, newest wins) so a cold-start deep link is not lost. */
export function createLaunchBus(): LaunchSource & { emit(i: LaunchIntent): void } {
  const subs = new Set<(i: LaunchIntent) => void>()
  let pending: LaunchIntent | null = null
  return {
    subscribe(cb) {
      subs.add(cb)
      if (pending) { const p = pending; pending = null; cb(p) }
      return () => { subs.delete(cb) }
    },
    emit(i) {
      if (subs.size === 0) { pending = i; return }
      for (const cb of [...subs]) cb(i)
    },
  }
}

export const noLaunches: LaunchSource = { subscribe: () => () => {} }

const SLUG = /^[a-z0-9-]{1,80}$/
const URI = /^lingo:\/\/clip\/([^?#]*)(?:\?([^#]*))?(?:#.*)?$/
/** 'lingo://clip/<slug>' or 'lingo://clip/<slug>?t=<seconds>' → { itemId: slug, positionS?, source: 'unknown' }. Anything else → null.
 *  A regex, not URL: Hermes/Vega URL support for custom schemes is not something to lean on. */
export function parseLaunchUri(uri: string): LaunchIntent | null {
  const m = URI.exec(uri.trim())
  if (!m || !SLUG.test(m[1]!)) return null
  const intent: LaunchIntent = { itemId: m[1]!, source: 'unknown' }
  for (const pair of (m[2] ?? '').split('&')) {
    const [k, v] = pair.split('=')
    if (k === 't' && v !== undefined && /^\d+(\.\d+)?$/.test(v)) intent.positionS = Number(v)
  }
  return intent
}

export function launchUri(slug: string): string { return 'lingo://clip/' + slug }

/** Unique by slug across continue/justRight/harder/fresh, in that order. */
export function catalogItems(c: Catalog): CatalogItem[] {
  const seen = new Set<string>()
  const out: CatalogItem[] = []
  for (const row of [c.continue, c.justRight, c.harder, c.fresh]) {
    for (const card of row) {
      if (seen.has(card.slug)) continue
      seen.add(card.slug)
      out.push({ id: card.slug, title: card.title, durationS: card.durationS, posterUrl: card.posterUrl ?? undefined, uri: launchUri(card.slug) })
    }
  }
  return out
}
