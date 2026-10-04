import { LearnerDto, LearnerSettingsPatch } from '../src/index'

describe('LearnerSettingsPatch', () => {
  it('accepts the learner-editable settings', () => {
    expect(LearnerSettingsPatch.parse({ learning: 'en', native: 'tr', nativeLine: 'onPause', autoPause: true, cueScale: 1.25, firstRunDone: true })).toEqual({ learning: 'en', native: 'tr', nativeLine: 'onPause', autoPause: true, cueScale: 1.25, firstRunDone: true })
  })
  it('accepts an empty patch and fills no defaults', () => { expect(LearnerSettingsPatch.parse({})).toEqual({}) })
  for (const [k, v] of [['plus', true], ['streak', 5], ['knownRank', 9000], ['level', 'B2']] as const) {
    it(`rejects ${k}`, () => { expect(LearnerSettingsPatch.safeParse({ [k]: v }).success).toBe(false) })
  }
  it('bounds cueScale to 1-1.5', () => {
    expect(LearnerSettingsPatch.safeParse({ cueScale: 1.6 }).success).toBe(false)
    expect(LearnerSettingsPatch.safeParse({ cueScale: 0.9 }).success).toBe(false)
    expect(LearnerSettingsPatch.safeParse({ cueScale: 1.5 }).success).toBe(true)
  })
})

describe('LearnerDto', () => {
  it('defaults the settings a server row may lack', () => {
    expect(LearnerDto.parse({ learning: 'de', native: 'en', level: 'A2', plus: false, streak: 0, firstRunDone: false })).toMatchObject({ nativeLine: 'always', autoPause: false, cueScale: 1 })
  })
})
