import { checkLicence, licenceUrl, normaliseLicenceUrl } from '../src/batch/licence'
import { clipRow } from './helpers/batch'

const jsonFetch = (body: unknown, status = 200) => {
  const calls: string[] = []
  const f = (async (url: string | URL) => { calls.push(String(url)); return new Response(JSON.stringify(body), { status }) }) as unknown as typeof fetch
  return Object.assign(f, { calls })
}

describe('licence re-check', () => {
  it('passes when archive.org licenseurl matches after normalising http/https and trailing slash', async () => {
    const f = jsonFetch({ metadata: { licenseurl: 'http://creativecommons.org/licenses/publicdomain/' } })
    const clip = clipRow({ license: 'Public domain (US)', licenseUrl: 'https://www.creativecommons.org/licenses/publicdomain', licenceCheck: { kind: 'ia', id: 'WhattoDo1950' } })
    expect(await checkLicence(clip, f)).toMatchObject({ ok: true })
    expect(f.calls).toEqual(['https://archive.org/metadata/WhattoDo1950'])
    expect(normaliseLicenceUrl('HTTPS://www.creativecommons.org/licenses/by/4.0/')).toBe('creativecommons.org/licenses/by/4.0')
  })
  it('fails when archive.org licenseurl differs or is missing', async () => {
    const clip = clipRow({ licenceCheck: { kind: 'ia', id: 'x' } })
    const r = await checkLicence(clip, jsonFetch({ metadata: { licenseurl: 'http://creativecommons.org/licenses/by-nc/4.0/' } }))
    expect(r.ok).toBe(false); expect(r.message).toMatch(/licence changed — update docs\/content\.md first/)
    expect((await checkLicence(clip, jsonFetch({ metadata: {} }))).ok).toBe(false)
    expect((await checkLicence(clip, jsonFetch({}, 503))).message).toMatch(/503/)
  })
  it('passes when Commons LicenseShortName equals the label', async () => {
    const f = jsonFetch({ query: { pages: { '123': { imageinfo: [{ extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' } } }] } } } })
    const clip = clipRow({ license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0', licenceCheck: { kind: 'commons', file: 'A_&_B.webm' } })
    expect(await checkLicence(clip, f)).toMatchObject({ ok: true })
    expect(f.calls[0]).toBe('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=File%3AA_%26_B.webm')
    expect(licenceUrl({ kind: 'commons', file: 'A_&_B.webm' })).toBe(f.calls[0])
  })
  it('fails when Commons LicenseShortName differs', async () => {
    const f = jsonFetch({ query: { pages: { '1': { imageinfo: [{ extmetadata: { LicenseShortName: { value: 'CC BY-SA 3.0' } } }] } } } })
    const r = await checkLicence(clipRow({ license: 'CC BY 4.0', licenceCheck: { kind: 'commons', file: 'x.webm' } }), f)
    expect(r.ok).toBe(false); expect(r.message).toMatch(/CC BY-SA 3\.0.*CC BY 4\.0/)
    const missing = await checkLicence(clipRow({ licenceCheck: { kind: 'commons', file: 'x.webm' } }), jsonFetch({ query: { pages: { '-1': { missing: '' } } } }))
    expect(missing.ok).toBe(false)
  })
  it('fails a manual check without verifiedOn and passes one with it, without any request', async () => {
    const f = jsonFetch({})
    const r = await checkLicence(clipRow({ licenceCheck: { kind: 'manual', url: 'https://schule.zdf.de/x', verifiedOn: null } }), f)
    expect(r.ok).toBe(false); expect(r.message).toMatch(/verifiedOn/); expect(r.message).toContain('https://schule.zdf.de/x')
    expect((await checkLicence(clipRow({ licenceCheck: { kind: 'manual', url: 'https://schule.zdf.de/x', verifiedOn: '2026-10-03' } }), f)).ok).toBe(true)
    expect(f.calls).toEqual([])
  })
  it('reports a network error as a failed check, not a crash', async () => {
    const f = (async () => { throw new Error('getaddrinfo ENOTFOUND archive.org') }) as unknown as typeof fetch
    const r = await checkLicence(clipRow(), f)
    expect(r.ok).toBe(false); expect(r.message).toMatch(/ENOTFOUND/)
  })
})
