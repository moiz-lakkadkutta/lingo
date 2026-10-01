import { useEffect, useRef } from 'react'
import { contentLauncher } from '@moizp/vega-media-kit'
import type { LaunchIntent } from '@moizp/vega-media-kit'
import type { Catalog } from '@lingo/contracts'
import { catalogItems, type LaunchSource } from './launch'

/**
 * Content Launcher for Root: registers the catalog with the kit once per catalog load and opens launch intents from the kit
 * (contentLauncher.onLaunchIntent) and from the platform LaunchSource. A known slug opens the Player; an unknown one is ignored.
 * An intent that arrives before the catalog has loaded waits for it (cold start from voice search or a deep link).
 * TODO(KIT-E1): the kit's Vega Content Launcher is a no-op and has no public dispatch; TODO(KIT-E2): onLaunchIntent cannot answer
 * SUCCESS / failure, so apps/vega answers from its own handler.
 * https://developer.amazon.com/ja/docs/vega/0.24/content-launcher-integration-guide.html
 */
export function useLaunchIntents(a: { catalog: Catalog | null; launches: LaunchSource; onOpen(slug: string, positionS?: number): void }): void {
  const { catalog, launches } = a
  const onOpen = useRef(a.onOpen)
  onOpen.current = a.onOpen
  const known = useRef<Set<string> | null>(null)
  const pending = useRef<LaunchIntent | null>(null)

  const handle = useRef((i: LaunchIntent) => {
    if (!known.current) { pending.current = i; return }
    if (known.current.has(i.itemId)) onOpen.current(i.itemId, i.positionS)
    else console.debug('[lingo] launch intent for an unknown clip ignored:', i.itemId)
  }).current

  useEffect(() => {
    if (!catalog) return
    const items = catalogItems(catalog)
    known.current = new Set(items.map((i) => i.id))
    void contentLauncher.registerCatalog(items).catch(() => {})
    if (pending.current) { const p = pending.current; pending.current = null; handle(p) }
  }, [catalog, handle])

  useEffect(() => contentLauncher.onLaunchIntent(handle), [handle])
  useEffect(() => launches.subscribe(handle), [launches, handle])
}
