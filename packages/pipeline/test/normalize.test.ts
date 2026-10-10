import { ffmpegNormalizeArgs, ffprobeArgs, normalize, scaleFilter, videoOf } from '../src/steps/normalize'

describe('ffmpegNormalizeArgs', () => {
  it('H.264 crf 20 + stereo AAC 192k', () => {
    expect(ffmpegNormalizeArgs('w/source.mp4', 'w/mezz.mp4', { width: 1920, height: 1080 })).toEqual(['-hide_banner', '-loglevel', 'error', '-nostats', '-y', '-i', 'w/source.mp4', '-vf', 'scale=1920:1080,setsar=1', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-ac', '2', '-b:a', '192k', 'w/mezz.mp4'])
    expect(ffprobeArgs('w/source.mp4')).toEqual(['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', 'w/source.mp4'])
  })
})
const vf = (v: { width: number; height: number; sar?: string }) => { const a = ffmpegNormalizeArgs('s', 'd', v); return a[a.indexOf('-vf') + 1] }
describe('no upscaling: scale down to 1080 lines only when the source is taller (LING-008 batch 1)', () => {
  it('480p, 720p and 1080p keep their size; 2160p goes down to 1080p', () => {
    expect(vf({ width: 854, height: 480 })).toBe('scale=854:480,setsar=1')
    expect(vf({ width: 1280, height: 720 })).toBe('scale=1280:720,setsar=1')
    expect(vf({ width: 1920, height: 1080 })).toBe('scale=1920:1080,setsar=1')
    expect(vf({ width: 3840, height: 2160 })).toBe('scale=1920:1080,setsar=1')
  })
  it('368×480 SAR 4:3 becomes square pixels: width × SAR, height kept, both even', () => {
    expect(vf({ width: 368, height: 480, sar: '4:3' })).toBe('scale=490:480,setsar=1')
  })
  it('odd sizes round down to even; SAR 1:1, 0:1 or absent count as square', () => {
    expect(scaleFilter({ width: 641, height: 361 })).toBe('scale=640:360,setsar=1')
    expect(scaleFilter({ width: 640, height: 360, sar: '1:1' })).toBe('scale=640:360,setsar=1')
    expect(scaleFilter({ width: 640, height: 360, sar: '0:1' })).toBe('scale=640:360,setsar=1')
    // anamorphic 1440×1080 SAR 4:3 → 1920×1080; a tall anamorphic source scales by height after the SAR fix
    expect(scaleFilter({ width: 1440, height: 1080, sar: '4:3' })).toBe('scale=1920:1080,setsar=1')
    expect(scaleFilter({ width: 2880, height: 2160, sar: '4:3' })).toBe('scale=1920:1080,setsar=1')
  })
  it('unknown size (no video stream in the probe): an ffmpeg expression with the same rules', () => {
    expect(scaleFilter(undefined)).toBe("scale=w='trunc(iw*sar*min(1,1080/ih)/2)*2':h='trunc(min(ih,1080)/2)*2',setsar=1")
  })
  it('videoOf reads the first video stream of an ffprobe answer', () => {
    expect(videoOf({ streams: [{ codec_type: 'audio' }, { codec_type: 'video', width: 368, height: 480, sample_aspect_ratio: '4:3' }] })).toEqual({ width: 368, height: 480, sar: '4:3' })
    expect(videoOf({ streams: [{ codec_type: 'audio' }] })).toBeUndefined()
    expect(videoOf({})).toBeUndefined()
  })
  it('normalize passes the probed size to ffmpeg', async () => {
    const calls: string[][] = []
    const probe = { format: { duration: '10' }, streams: [{ codec_type: 'video', width: 3840, height: 2160, sample_aspect_ratio: '1:1' }] }
    await normalize('w', 's3://b/x.mp4', { exec: async (cmd, args) => { calls.push([cmd, ...args]); return { stdout: cmd === 'ffprobe' ? JSON.stringify(probe) : '' } } })
    const ff = calls.find((c) => c[0] === 'ffmpeg')!
    expect(ff[ff.indexOf('-vf') + 1]).toBe('scale=1920:1080,setsar=1')
  })
})
describe('ffmpeg is quiet (docs/decisions/0008 decision 12)', () => {
  it('-hide_banner -loglevel error -nostats precede -y', () => {
    const a = ffmpegNormalizeArgs('s', 'd')
    expect(a.slice(0, a.indexOf('-y'))).toEqual(['-hide_banner', '-loglevel', 'error', '-nostats'])
  })
})
describe('normalize', () => {
  it('runs aws cp, ffprobe, ffmpeg in order and returns the probed duration', async () => {
    const calls: Array<[string, ...string[]]> = []
    const exec = async (cmd: string, args: string[]) => { calls.push([cmd, ...args]); return { stdout: cmd === 'ffprobe' ? JSON.stringify({ format: { duration: '66.240000' } }) : '' } }
    const r = await normalize('work/demo', 's3://bucket/demo.mp4', { exec })
    expect(r).toEqual({ durationS: 66.24 })
    expect(calls).toEqual([
      ['aws', 's3', 'cp', 's3://bucket/demo.mp4', 'work/demo/source.mp4'],
      ['ffprobe', ...ffprobeArgs('work/demo/source.mp4')],
      ['ffmpeg', ...ffmpegNormalizeArgs('work/demo/source.mp4', 'work/demo/mezz.mp4')],
    ])
    await expect(normalize('w', 's3://x', { exec: async () => ({ stdout: '{}' }) })).rejects.toThrow(/duration/)
  })
})

describe('normalize keeps the source extension', () => {
  it('downloads s3://…/x.webm to source.webm and probes/normalises that file; no extension falls back to .mp4', async () => {
    const calls: Array<[string, ...string[]]> = []
    const exec = async (cmd: string, args: string[]) => { calls.push([cmd, ...args]); return { stdout: cmd === 'ffprobe' ? JSON.stringify({ format: { duration: '10' } }) : '' } }
    await normalize('w', 's3://bucket/clips/Interview_mit_Friedl%C3%A4nder.webm', { exec })
    expect(calls).toEqual([
      ['aws', 's3', 'cp', 's3://bucket/clips/Interview_mit_Friedl%C3%A4nder.webm', 'w/source.webm'],
      ['ffprobe', ...ffprobeArgs('w/source.webm')],
      ['ffmpeg', ...ffmpegNormalizeArgs('w/source.webm', 'w/mezz.mp4')],
    ])
    calls.length = 0
    await normalize('w', 's3://unused', { exec })
    expect(calls[0]).toEqual(['aws', 's3', 'cp', 's3://unused', 'w/source.mp4'])
    calls.length = 0
    await normalize('w', 's3://b/dir.v2/clip.MKV', { exec })
    expect(calls[0]).toEqual(['aws', 's3', 'cp', 's3://b/dir.v2/clip.MKV', 'w/source.mkv'])
  })
})
