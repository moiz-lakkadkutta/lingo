import { ffmpegNormalizeArgs, ffprobeArgs, normalize } from '../src/steps/normalize'

describe('ffmpegNormalizeArgs', () => {
  it('1080p H.264 crf 20 + stereo AAC 192k', () => {
    expect(ffmpegNormalizeArgs('w/source.mp4', 'w/mezz.mp4')).toEqual(['-hide_banner', '-loglevel', 'error', '-nostats', '-y', '-i', 'w/source.mp4', '-vf', 'scale=-2:1080', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-ac', '2', '-b:a', '192k', 'w/mezz.mp4'])
    expect(ffprobeArgs('w/source.mp4')).toEqual(['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', 'w/source.mp4'])
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
