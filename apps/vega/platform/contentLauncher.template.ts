// Vega Content Launcher → Lingo LaunchSource. Interim app-side handler until the kit implements it (KIT-007; escalation E1, offered
// upstream as its starting point). Pattern from AmazonAppDev/vega-video-sample src/screens/HomeScreen.tsx:
// factory.getOrMakeServer().setHandler({ handleLaunchContent(contentSearch, autoPlay, optionalFields) }).
// API checked against @amazon-devices/kepler-media-content-launcher 2.0.22 type definitions (ContentLauncher.d.ts):
// ContentLauncherStatusType { SUCCESS, URL_NOT_AVAILABLE, AUTH_FAILED }; IContentSearchParameter.getExternalIdList() → IAdditionalInfo
// { getName(), getValue() }; optionalFields.getPlaybackPreferences()?.getPlaybackPositionInMs().
// Docs: https://developer.amazon.com/ja/docs/vega/0.24/content-launcher-integration-guide.html ·
// https://developer.amazon.com/docs/vega/0.21/content-launcher-overview.html
import { ContentLauncherServerComponent, ContentLauncherStatusType, type IContentSearch, type ILaunchContentOptionalFields } from '@amazon-devices/kepler-media-content-launcher'
import type { LaunchIntent } from '@moizp/vega-media-kit'

/** The external id name Lingo's catalog entries carry (Q5: confirm with Amazon catalog onboarding). */
export const LINGO_ID_NAME = 'lingo_slug'
const SLUG = /^[a-z0-9-]{1,80}$/

/** First external id named lingo_slug; else the first value (parameter or external id) that knownSlugs() contains. */
export function slugFrom(search: IContentSearch, knownSlugs: () => ReadonlySet<string> | null): string | null {
  const params = search.getParameterList()
  for (const p of params) {
    for (const id of p.getExternalIdList()) if (id.getName() === LINGO_ID_NAME && SLUG.test(id.getValue())) return id.getValue()
  }
  const known = knownSlugs()
  if (!known) return null
  for (const p of params) {
    if (known.has(p.getValue())) return p.getValue()
    for (const id of p.getExternalIdList()) if (known.has(id.getValue())) return id.getValue()
  }
  return null
}

/**
 * Registers the handler once (module level in App.tsx). Known slug → emit + SUCCESS; anything else → URL_NOT_AVAILABLE.
 * knownSlugs() returns null while the app does not know the catalog yet: a well-formed lingo_slug is then accepted, and Root ignores
 * an unknown one (TODO(KIT-E2): the kit's onLaunchIntent cannot answer, so this handler answers for the app).
 */
export function registerLingoContentLauncher(emit: (i: LaunchIntent) => void, knownSlugs: () => ReadonlySet<string> | null): void {
  const factory = new ContentLauncherServerComponent()
  const respond = (status: ContentLauncherStatusType) => factory.makeLauncherResponseBuilder().contentLauncherStatus(status).build()
  factory.getOrMakeServer().setHandler({
    async handleLaunchContent(contentSearch: IContentSearch, autoPlay: boolean, optionalFields: ILaunchContentOptionalFields) {
      const slug = slugFrom(contentSearch, knownSlugs)
      const known = knownSlugs()
      if (!slug || (known && !known.has(slug))) {
        console.info('[lingo] content launcher: no Lingo clip for this request')
        return respond(ContentLauncherStatusType.URL_NOT_AVAILABLE)
      }
      const ms = optionalFields?.getPlaybackPreferences()?.getPlaybackPositionInMs() ?? null
      const intent: LaunchIntent = { itemId: slug, source: autoPlay ? 'voice' : 'search' }
      if (ms !== null && ms >= 0) intent.positionS = ms / 1000
      console.info('[lingo] content launcher: open', slug)
      emit(intent)
      return respond(ContentLauncherStatusType.SUCCESS)
    },
  })
}
