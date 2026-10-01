import { backspace, emptyBoxes, typeInto } from '../src/lib/codeInput'

describe('code boxes', () => {
  it('typing one valid character fills the box and moves focus to the next', () => {
    expect(typeInto(emptyBoxes(), 0, 'A')).toEqual({ boxes: ['A', '', '', '', '', ''], focus: 1, complete: null, rejected: false })
  })
  it('lower case is upper-cased', () => {
    expect(typeInto(emptyBoxes(), 2, 'k').boxes[2]).toBe('K')
  })
  it('0, O, 1 and I are rejected and leave the boxes unchanged', () => {
    const b = ['A', 'B', '', '', '', '']
    for (const c of ['0', 'O', 'o', '1', 'I', 'i', '-']) expect(typeInto(b, 2, c)).toEqual({ boxes: b, focus: 2, complete: null, rejected: true })
    expect(typeInto(b, 2, '').rejected).toBe(false)
  })
  it('pasting a full code into any box fills all six and completes', () => {
    for (const i of [0, 3, 5]) expect(typeInto(emptyBoxes(), i, ' abc234 ')).toEqual({ boxes: ['A', 'B', 'C', '2', '3', '4'], focus: 5, complete: 'ABC234', rejected: false })
  })
  it('pasting a joinUrl fills all six and completes with its code', () => {
    expect(typeInto(emptyBoxes(), 1, 'lingo://join/XYZ789').complete).toBe('XYZ789')
  })
  it('several characters typed into a middle box spill into the following boxes and drop the overflow', () => {
    expect(typeInto(emptyBoxes(), 3, 'KLMNP')).toEqual({ boxes: ['', '', '', 'K', 'L', 'M'], focus: 5, complete: null, rejected: false })
  })
  it('the sixth character completes the code; five do not', () => {
    const five = ['A', 'B', 'C', '2', '3', '']
    expect(typeInto(['A', 'B', 'C', '2', '', ''], 4, '3').complete).toBeNull()
    expect(typeInto(five, 5, '4')).toEqual({ boxes: ['A', 'B', 'C', '2', '3', '4'], focus: 5, complete: 'ABC234', rejected: false })
  })
  it('backspace on a filled box clears it; on an empty box clears and focuses the previous one', () => {
    expect(backspace(['A', 'B', 'C', '', '', ''], 2)).toEqual({ boxes: ['A', 'B', '', '', '', ''], focus: 2 })
    expect(backspace(['A', 'B', 'C', '', '', ''], 3)).toEqual({ boxes: ['A', 'B', '', '', '', ''], focus: 2 })
    expect(backspace(emptyBoxes(), 0)).toEqual({ boxes: emptyBoxes(), focus: 0 })
  })
})
