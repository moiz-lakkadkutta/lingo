import { HLS_NAMES, packagerArgs, pack, textLanguages } from '../src/steps/package'

describe('packagerArgs', () => {
  it('de clip with native en yields video + one audio + exactly two text tracks', () => {
    const args = packagerArgs({ work: 'work/demo-de', lang: 'de', natives: ['en'] })
    expect(args).toMatchSnapshot()
    expect(args.filter((a) => a.includes('stream=text')).length).toBe(2)
    expect(args.filter((a) => a.includes('stream=audio')).length).toBe(1)
    expect(args.filter((a) => a.includes('stream=video')).length).toBe(1)
    expect(args.join(' ')).not.toContain('audio_ad')
    expect(args.join(' ')).not.toContain('hls_characteristics')
    expect(args.join(' ')).toContain('--default_language de')
    expect(args.join(' ')).toContain('--segment_duration 4')
    expect(args.at(-1)).toBe('work/demo-de/hls/master.m3u8')
    expect(args.find((a) => a.includes('stream=text') && a.includes('language=de'))).toContain('in=work/demo-de/de.vtt,')
    expect(args.find((a) => a.includes('stream=text') && a.includes('language=en'))).toContain('in=work/demo-de/native-en.vtt,')
    expect(args.find((a) => a.includes('language=en'))).toContain(`hls_name=${HLS_NAMES.en}`)
  })
  it('en clip with natives de,tr yields three text tracks in order en, de, tr', () => {
    const args = packagerArgs({ work: 'w', lang: 'en', natives: ['de', 'tr'] })
    const text = args.filter((a) => a.includes('stream=text'))
    expect(text.length).toBe(3)
    expect(text.map((a) => /language=(\w+)$/.exec(a)![1])).toEqual(['en', 'de', 'tr'])
    expect(text.map((a) => /hls_name=(\w+)/.exec(a)![1])).toEqual(['English', 'German', 'Turkish'])
  })
  it('never emits a text track for the target language twice when natives include it', () => {
    const args = packagerArgs({ work: 'w', lang: 'de', natives: ['de', 'en', 'de'] })
    const text = args.filter((a) => a.includes('stream=text'))
    expect(text.map((a) => /language=(\w+)$/.exec(a)![1])).toEqual(['de', 'en'])
    expect(textLanguages('de', ['en', 'de', 'xx'])).toEqual(['de', 'en', 'xx'])
    expect(packagerArgs({ work: 'w', lang: 'de', natives: ['xx'] }).find((a) => a.includes('language=xx'))).toContain('hls_name=xx')
  })
  it('pack runs packager and returns the master playlist path', async () => {
    const calls: string[] = []
    const out = await pack({ work: 'w', lang: 'de', natives: ['en'] }, { exec: async (cmd) => { calls.push(cmd); return { stdout: '' } } })
    expect(calls).toEqual(['packager']); expect(out).toBe('w/hls/master.m3u8')
  })
})
