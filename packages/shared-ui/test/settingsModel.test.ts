import { cycleSetting, selectSetting, settingsRows, SUPPORTED_NATIVES } from '../src/screens/settings/model'
import { strings } from '../src/strings'
import { learner } from './fixtures'

const S = strings.settings
describe('settings model', () => {
  it('rows follow the plan order with current values', () => {
    const rows = settingsRows(learner({ native: 'tr', nativeLine: 'onPause', cueScale: 1.25 }), 'Pixel')
    expect(rows.map((r) => r.key)).toEqual(['learning', 'native', 'level', 'nativeLine', 'autoPause', 'cueSize', 'pair', 'plus', 'about'])
    expect(rows.map((r) => r.value)).toEqual(['Deutsch', 'Türkçe', 'about A2', 'On pause', 'Off', '125 %', S.pairValue('Pixel'), 'Off', S.open])
    expect(rows.map((r) => r.kind)).toEqual(['cycle', 'cycle', 'cycle', 'cycle', 'cycle', 'cycle', 'link', 'link', 'link'])
    expect(rows[0]!.label).toBe(S.rowLabel(S.learning, 'Deutsch'))
    expect(rows[6]!.label).toBe(S.linkLabel(S.pair, S.pairValue('Pixel')))
    expect(settingsRows(learner(), null)[6]!.value).toBe('Not paired')
  })
  it('learning flips de and en and moves native off the learning language', () => {
    expect(cycleSetting('learning', 1, learner({ learning: 'de', native: 'tr' }))).toMatchObject({ kind: 'patch', patch: { learning: 'en' } })
    expect(cycleSetting('learning', -1, learner({ learning: 'de', native: 'en' }))).toMatchObject({ kind: 'patch', patch: { learning: 'en', native: 'de' } })
    expect(cycleSetting('learning', 1, learner({ learning: 'en', native: 'de' }))).toMatchObject({ kind: 'patch', patch: { learning: 'de', native: 'en' } })
  })
  it('learning swaps carry a visible notice; a plain learning change has none', () => {
    const swap = cycleSetting('learning', 1, learner({ learning: 'de', native: 'en' }))
    expect(swap).toMatchObject({ kind: 'patch', notice: S.nativeSwapped('Deutsch') })
    expect(swap).toMatchObject({ announce: `${S.rowLabel(S.learning, 'English')}. ${S.nativeSwapped('Deutsch')}` })
    expect(cycleSetting('learning', 1, learner({ learning: 'de', native: 'tr' }))).not.toHaveProperty('notice')
  })
  it('I speak only offers languages with native lines (en, de), never the learning language (QA #15)', () => {
    expect(SUPPORTED_NATIVES).toEqual(['en', 'de'])
    // One supported value besides the learning language: left, right and Select leave it as it is.
    for (const learning of ['de', 'en'] as const) {
      const l = learner({ learning, native: learning === 'de' ? 'en' : 'de' })
      expect(cycleSetting('native', 1, l)).toBeNull()
      expect(cycleSetting('native', -1, l)).toBeNull()
      expect(selectSetting('native', l)).toBeNull()
    }
  })
  it('a stored unsupported I speak is shown as is and moves onto a supported value', () => {
    const l = learner({ learning: 'de', native: 'tr' })
    expect(settingsRows(l, null)[1]!.value).toBe('Türkçe')
    expect(cycleSetting('native', 1, l)).toMatchObject({ kind: 'patch', patch: { native: 'en' }, announce: S.rowLabel(S.native, 'English') })
    expect(cycleSetting('native', -1, l)).toMatchObject({ patch: { native: 'en' } })
    expect(cycleSetting('native', 1, learner({ learning: 'en', native: 'ro' }))).toMatchObject({ patch: { native: 'de' } })
    expect(selectSetting('native', learner({ learning: 'en', native: 'ar' }))).toMatchObject({ patch: { native: 'de' } })
  })
  it('level steps without wrapping on left and right and wraps on Select', () => {
    expect(cycleSetting('level', 1, learner({ level: 'A2' }))).toMatchObject({ kind: 'level', level: 'B1' })
    expect(cycleSetting('level', -1, learner({ level: 'A2' }))).toMatchObject({ kind: 'level', level: 'A1' })
    expect(cycleSetting('level', -1, learner({ level: 'A1' }))).toBeNull()
    expect(cycleSetting('level', 1, learner({ level: 'B2' }))).toBeNull()
    expect(selectSetting('level', learner({ level: 'B2' }))).toMatchObject({ kind: 'level', level: 'A1' })
    expect(selectSetting('level', learner({ level: 'A2' }))).toMatchObject({ kind: 'level', level: 'B1' })
  })
  it('native line wraps; auto-pause toggles; cue size steps 100, 125, 150', () => {
    expect(cycleSetting('nativeLine', 1, learner({ nativeLine: 'never' }))).toMatchObject({ patch: { nativeLine: 'always' } })
    expect(cycleSetting('nativeLine', -1, learner({ nativeLine: 'always' }))).toMatchObject({ patch: { nativeLine: 'never' } })
    expect(cycleSetting('autoPause', 1, learner({ autoPause: false }))).toMatchObject({ patch: { autoPause: true } })
    expect(cycleSetting('autoPause', -1, learner({ autoPause: true }))).toMatchObject({ patch: { autoPause: false } })
    expect(cycleSetting('cueSize', 1, learner({ cueScale: 1 }))).toMatchObject({ patch: { cueScale: 1.25 } })
    expect(cycleSetting('cueSize', 1, learner({ cueScale: 1.25 }))).toMatchObject({ patch: { cueScale: 1.5 } })
    expect(cycleSetting('cueSize', 1, learner({ cueScale: 1.5 }))).toBeNull()
    expect(cycleSetting('cueSize', -1, learner({ cueScale: 1 }))).toBeNull()
    expect(selectSetting('cueSize', learner({ cueScale: 1.5 }))).toMatchObject({ patch: { cueScale: 1 } })
  })
  it('pair, Lingo Plus and About open their screens on Select and ignore left and right', () => {
    for (const k of ['pair', 'plus', 'about'] as const) {
      expect(cycleSetting(k, 1, learner())).toBeNull()
      expect(cycleSetting(k, -1, learner())).toBeNull()
      expect(selectSetting(k, learner())).toEqual({ kind: 'open', route: k })
    }
  })
  it('every action carries an announcement with the new value', () => {
    const l = learner()
    expect(cycleSetting('learning', 1, learner({ native: 'tr' }))).toMatchObject({ announce: S.rowLabel(S.learning, 'English') })
    expect(cycleSetting('native', 1, learner({ native: 'tr' }))).toMatchObject({ announce: S.rowLabel(S.native, 'English') })
    expect(cycleSetting('level', 1, l)).toMatchObject({ announce: S.rowLabel(S.level, 'about B1') })
    expect(cycleSetting('nativeLine', 1, l)).toMatchObject({ announce: S.rowLabel(S.nativeLine, 'On pause') })
    expect(cycleSetting('autoPause', 1, l)).toMatchObject({ announce: S.rowLabel(S.autoPause, 'On') })
    expect(cycleSetting('cueSize', 1, l)).toMatchObject({ announce: S.rowLabel(S.cueSize, '125 %') })
  })
})
