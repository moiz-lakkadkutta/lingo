import { LEVELS, NATIVE_LANGS } from '@lingo/contracts'
import type { Lang, LearnerDto, LearnerSettingsPatch, Level } from '@lingo/contracts'
import { LINES, SIZES, step } from '../../settings/options'
import { strings } from '../../strings'

export type SettingsKey = 'learning' | 'native' | 'level' | 'nativeLine' | 'autoPause' | 'cueSize' | 'pair' | 'plus' | 'about'
export interface SettingsRow { key: SettingsKey; name: string; value: string; kind: 'cycle' | 'link'; /** aria-label */ label: string }
export type SettingsAction =
  /** notice: a visible status line for a side effect the learner did not ask for directly (QA #4: I speak swapped with the learning language). */
  | { kind: 'patch'; patch: LearnerSettingsPatch; announce: string; notice?: string } | { kind: 'level'; level: Level; announce: string }
  | { kind: 'open'; route: 'pair' | 'plus' | 'about' }

const S = strings.settings
const NAMES: Record<SettingsKey, string> = { learning: S.learning, native: S.native, level: S.level, nativeLine: S.nativeLine, autoPause: S.autoPause, cueSize: S.cueSize, pair: S.pair, plus: S.plus, about: S.about }
const other = (l: Lang): Lang => (l === 'de' ? 'en' : 'de')
/**
 * "I speak" values that have native lines today (docs/content-status.md: German clips carry `en` native lines, English clips `de`).
 * The contracts enum (NATIVE_LANGS) stays wide so stored learners with other values still parse; the row shows such a value but
 * ◄► only move to these (QA #15).
 */
export const SUPPORTED_NATIVES: readonly Lang[] = ['en', 'de']
const nativeName = (code: string) => NATIVE_LANGS.find((n) => n.code === code)?.name ?? code
const value = {
  learning: (l: Lang) => S.learningOpts[l],
  native: nativeName,
  level: (l: Level) => strings.level.about(l),
  nativeLine: (v: LearnerDto['nativeLine']) => S.nativeLineOpts[v],
  autoPause: (on: boolean) => (on ? S.autoPauseOpts.on : S.autoPauseOpts.off),
  cueSize: (scale: number) => S.sizeValue(Math.round(scale * 100)),
}
const say = (key: SettingsKey, v: string) => S.rowLabel(NAMES[key], v)

/** Order = plan §8: Learning language · I speak · Level · Native line · Auto-pause · Cue size · Pair phone · Lingo Plus · About. */
export function settingsRows(l: LearnerDto, phoneName: string | null): SettingsRow[] {
  const cycle = (key: SettingsKey, v: string): SettingsRow => ({ key, name: NAMES[key], value: v, kind: 'cycle', label: S.rowLabel(NAMES[key], v) })
  const link = (key: SettingsKey, v: string): SettingsRow => ({ key, name: NAMES[key], value: v, kind: 'link', label: S.linkLabel(NAMES[key], v) })
  return [
    cycle('learning', value.learning(l.learning)), cycle('native', value.native(l.native)), cycle('level', value.level(l.level)),
    cycle('nativeLine', value.nativeLine(l.nativeLine)), cycle('autoPause', value.autoPause(l.autoPause)), cycle('cueSize', value.cueSize(l.cueScale)),
    link('pair', S.pairValue(phoneName)), link('plus', S.plusValue(l.plus)), link('about', S.open),
  ]
}

function change(key: SettingsKey, dir: -1 | 1, l: LearnerDto, wrapEnds: boolean): SettingsAction | null {
  switch (key) {
    case 'learning': {
      const learning = other(l.learning)
      if (l.native !== learning) return { kind: 'patch', patch: { learning }, announce: say(key, value.learning(learning)) }
      const notice = S.nativeSwapped(value.native(l.learning))
      return { kind: 'patch', patch: { learning, native: l.learning }, announce: `${say(key, value.learning(learning))}. ${notice}`, notice }
    }
    case 'native': {
      const codes: string[] = SUPPORTED_NATIVES.filter((c) => c !== l.learning)
      if (!codes.length) return null
      // A stored value outside the supported list (e.g. Türkçe from an earlier build) moves onto the list: ► to its start, ◄ to its end.
      const native = codes.includes(l.native) ? step(codes, l.native, dir) : dir === 1 ? codes[0]! : codes[codes.length - 1]!
      return native === l.native ? null : { kind: 'patch', patch: { native }, announce: say(key, value.native(native)) }
    }
    case 'level': {
      const level = step(LEVELS, l.level, dir, wrapEnds)
      return level === l.level ? null : { kind: 'level', level, announce: say(key, value.level(level)) }
    }
    case 'nativeLine': {
      const nativeLine = step(LINES, l.nativeLine, dir)
      return { kind: 'patch', patch: { nativeLine }, announce: say(key, value.nativeLine(nativeLine)) }
    }
    case 'autoPause': return { kind: 'patch', patch: { autoPause: !l.autoPause }, announce: say(key, value.autoPause(!l.autoPause)) }
    case 'cueSize': {
      const cueScale = step(SIZES, l.cueScale as (typeof SIZES)[number], dir, wrapEnds)
      return cueScale === l.cueScale ? null : { kind: 'patch', patch: { cueScale }, announce: say(key, value.cueSize(cueScale)) }
    }
    default: return null
  }
}
/** ◄► on a cycle row; level and cue size stop at the ends (null), the rest wrap. Link rows → null. */
export function cycleSetting(key: SettingsKey, dir: -1 | 1, l: LearnerDto): SettingsAction | null { return change(key, dir, l, false) }
/** Select: a cycle row steps forward, wrapping for level and cue size too; a link row opens its screen. */
export function selectSetting(key: SettingsKey, l: LearnerDto): SettingsAction | null {
  if (key === 'pair' || key === 'plus' || key === 'about') return { kind: 'open', route: key }
  return change(key, 1, l, true)
}
