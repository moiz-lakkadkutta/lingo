import { strings } from '../src/strings'

describe('strings.explain.saved', () => {
  it('uses the singular for one word', () => { expect(strings.explain.saved(1)).toBe('Saved. 1 word this clip.') })
  it('uses the plural for more than one', () => {
    expect(strings.explain.saved(2)).toBe('Saved. 2 words this clip.')
    expect(strings.explain.saved(12)).toBe('Saved. 12 words this clip.')
  })
})
