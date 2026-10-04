import { tvFocusProps } from '../src/tvFocus'

describe('tvFocusProps', () => {
  it('passes the given node handles through and drops absent ones', () => {
    expect(tvFocusProps({ nextFocusUp: 12, nextFocusDown: undefined })).toEqual({ nextFocusUp: 12 })
    expect(tvFocusProps({})).toEqual({})
    expect(tvFocusProps({ nextFocusLeft: 1, nextFocusRight: 2, nextFocusDown: 3 })).toEqual({ nextFocusLeft: 1, nextFocusRight: 2, nextFocusDown: 3 })
  })
})
