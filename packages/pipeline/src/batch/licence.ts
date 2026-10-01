/**
 * Licence re-check before ingest (docs/content.md §8: "Verify the licence is still there … If it is gone or changed, stop and update this
 * file first"). Plain HTTPS GETs, no AWS. archive.org metadata API: https://archive.org/developers/md-read.html ·
 * MediaWiki imageinfo/extmetadata: https://www.mediawiki.org/wiki/API:Imageinfo
 */
import type { BatchClip, LicenceCheck } from './manifest'

export interface LicenceResult { ok: boolean; message: string }

/** Wikimedia asks API clients to send a descriptive User-Agent (https://meta.wikimedia.org/wiki/User-Agent_policy). */
const HEADERS = { 'user-agent': 'lingo-pipeline-batch/0.1 (licence re-check; docs/content.md)', accept: 'application/json' }

/** scheme, `www.`, case and trailing slashes do not change a licence URL */
export const normaliseLicenceUrl = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
const normaliseName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** The GET a check makes (null for manual checks). */
export function licenceUrl(check: LicenceCheck): string | null {
  if (check.kind === 'ia') return `https://archive.org/metadata/${encodeURIComponent(check.id)}`
  if (check.kind === 'commons') return `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=${encodeURIComponent(`File:${check.file}`)}`
  return null
}

/** What the check expects to read back: the licence URL (ia) or the short name, i.e. the label (commons). */
export function licenceExpect(clip: Pick<BatchClip, 'license' | 'licenseUrl' | 'licenceCheck'>): string {
  return clip.licenceCheck.kind === 'ia' ? clip.licenseUrl : clip.license
}

const changed = (found: string, expected: string) => `licence changed — update docs/content.md first: found ${JSON.stringify(found)}, expected ${JSON.stringify(expected)}`

export async function checkLicence(clip: Pick<BatchClip, 'license' | 'licenseUrl' | 'licenceCheck'>, fetchFn: typeof fetch = fetch): Promise<LicenceResult> {
  const check = clip.licenceCheck
  if (check.kind === 'manual') {
    return check.verifiedOn
      ? { ok: true, message: `manual: verified on ${check.verifiedOn} — ${check.url}` }
      : { ok: false, message: `manual licence check: open ${check.url}, confirm the licence and attribution, then set licenceCheck.verifiedOn to today's date in the manifest` }
  }
  const url = licenceUrl(check)!
  const expected = licenceExpect(clip)
  let body: unknown
  try {
    const res = await fetchFn(url, { headers: HEADERS })
    if (!res.ok) return { ok: false, message: `GET ${url} → HTTP ${res.status}` }
    body = await res.json()
  } catch (e) {
    return { ok: false, message: `GET ${url} failed: ${(e as Error).message}` }
  }
  if (check.kind === 'ia') {
    const found = (body as { metadata?: { licenseurl?: unknown } }).metadata?.licenseurl
    if (typeof found !== 'string' || !found) return { ok: false, message: `archive.org item ${check.id} has no metadata.licenseurl (docs/content.md §7: a present licenseurl is a hard gate)` }
    return normaliseLicenceUrl(found) === normaliseLicenceUrl(expected) ? { ok: true, message: `archive.org licenseurl ${found}` } : { ok: false, message: changed(found, expected) }
  }
  const pages = Object.values((body as { query?: { pages?: Record<string, { imageinfo?: Array<{ extmetadata?: { LicenseShortName?: { value?: unknown } } }> }> } }).query?.pages ?? {})
  const found = pages[0]?.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value
  if (typeof found !== 'string' || !found) return { ok: false, message: `Commons File:${check.file} not found or has no LicenseShortName` }
  return normaliseName(found) === normaliseName(expected) ? { ok: true, message: `Commons LicenseShortName ${found}` } : { ok: false, message: changed(found, expected) }
}
