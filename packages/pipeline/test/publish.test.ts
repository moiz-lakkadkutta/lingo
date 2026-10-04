import { publish, publishCalls } from '../src/steps/publish'

describe('publishCalls', () => {
  it('emits sync, master.m3u8, one vtt per language, clip.json in that order', () => {
    const calls = publishCalls({ work: 'work/demo-de', slug: 'demo-de', lang: 'de', natives: ['en'], bucket: 'lingo-media' })
    expect(calls).toMatchSnapshot()
    expect(calls.map((c) => c.args.slice(0, 2).join(' '))).toEqual(['s3 sync', 's3 cp', 's3 cp', 's3 cp', 's3 cp'])
    expect(calls[0]!.args).toEqual(['s3', 'sync', 'work/demo-de/hls', 's3://lingo-media/published/demo-de/', '--delete', '--cache-control', 'public,max-age=31536000,immutable'])
    const flags = (c: { args: string[] }) => ({ cc: c.args[c.args.indexOf('--cache-control') + 1], ct: c.args[c.args.indexOf('--content-type') + 1], to: c.args[3] })
    expect(flags(calls[1]!)).toEqual({ cc: 'public,max-age=60', ct: 'application/vnd.apple.mpegurl', to: 's3://lingo-media/published/demo-de/master.m3u8' })
    expect(flags(calls[2]!)).toEqual({ cc: 'public,max-age=60', ct: 'text/vtt', to: 's3://lingo-media/published/demo-de/vtt/de.vtt' })
    expect(calls[2]!.args[2]).toBe('work/demo-de/de.vtt')
    expect(flags(calls[3]!)).toEqual({ cc: 'public,max-age=60', ct: 'text/vtt', to: 's3://lingo-media/published/demo-de/vtt/en.vtt' })
    expect(calls[3]!.args[2]).toBe('work/demo-de/native-en.vtt')
    expect(flags(calls[4]!)).toEqual({ cc: 'public,max-age=60', ct: 'application/json', to: 's3://lingo-media/published/demo-de/clip.json' })
    expect(publishCalls({ work: 'w', slug: 's', lang: 'en', natives: ['de', 'tr'], bucket: 'b' }).length).toBe(6)
  })
})
describe('publish', () => {
  it('returns the CloudFront base URL', async () => {
    const calls: string[][] = []
    const logs: string[] = []
    const url = await publish({ work: 'w', slug: 'demo-de', lang: 'de', natives: ['en'], bucket: 'b', cloudfrontDomain: 'd111.cloudfront.net' }, { exec: async (cmd, args) => { calls.push([cmd, ...args]); return { stdout: '' } }, log: (m) => logs.push(m) })
    expect(url).toBe('https://d111.cloudfront.net/published/demo-de')
    expect(calls.length).toBe(5)
    expect(logs).toEqual(['published https://d111.cloudfront.net/published/demo-de/master.m3u8'])
  })
})
