import { focusOverhang, oneLine, WORDS_GAP, wordsLayout } from '../src/screens/words/layout'
import { tokens } from '../src/theme/tokens'

// Device geometry: design px × scale, rounded to whole device units like px() (Fire OS 0.5, Vega 1).
const at = (n: number, scale: number) => Math.round(n * scale)

describe('Words layout (QA #17)', () => {
  it('closed: rows keep their 1100 px and there is no panel', () => {
    expect(wordsLayout(false)).toMatchObject({ contentW: 1728, listW: tokens.layout.rowW, panelX: null })
  })
  it('open: list 992 px + 48 px gap + 688 px panel fill the 1728 px safe width', () => {
    expect(wordsLayout(true)).toEqual({ contentW: 1728, listW: 992, panelX: 1040, panelW: 688 })
  })
  it.each([0.5, 1])('open at scale %s: a focused row never reaches the panel, and the panel stays inside the safe area', (scale) => {
    const l = wordsLayout(true)
    const listW = at(l.listW, scale)
    const listRight = listW + (listW * (tokens.motion.focusScale - 1)) / 2 + tokens.focus.width * scale
    expect(listRight).toBeLessThan(at(l.panelX!, scale))
    expect(at(l.panelX!, scale) + at(l.panelW, scale)).toBeLessThanOrEqual(at(l.contentW, scale))
    // the 640 px video plus padding fits the panel exactly
    expect(at(tokens.layout.miniW + 2 * tokens.layout.panelPad, scale)).toBe(at(l.panelW, scale))
    // a focused row's left edge stays inside the screen's safe padding
    expect(focusOverhang(l.listW) * scale).toBeLessThan(at(tokens.layout.safeX, scale))
  })
  it('the gap covers a focused row of any width up to the content width', () => {
    expect(focusOverhang(1728)).toBeLessThan(WORDS_GAP)
  })
  it('oneLine replaces every line break, not only the first', () => {
    expect(oneLine('Der Zug\nfährt\nab.')).toBe('Der Zug fährt ab.')
    expect(oneLine('a \n b\r\nc')).toBe('a b c')
    expect(oneLine('kein Umbruch')).toBe('kein Umbruch')
  })
})
