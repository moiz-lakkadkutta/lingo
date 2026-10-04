import { acceptsSku, isActive } from '../src/lib/entitlement'

describe('entitlement', () => {
  it('isActive is true for a null cancelDate and for a cancelDate in the future, false for one in the past', () => {
    const now = new Date('2026-10-01T12:00:00Z')
    expect(isActive({ cancelDate: null }, now)).toBe(true)
    expect(isActive({ cancelDate: new Date('2026-10-02T00:00:00Z') }, now)).toBe(true)
    expect(isActive({ cancelDate: Date.parse('2026-10-02T00:00:00Z') }, now)).toBe(true)
    expect(isActive({ cancelDate: new Date('2026-09-30T00:00:00Z') }, now)).toBe(false)
    expect(isActive({ cancelDate: Date.parse('2026-09-30T00:00:00Z') }, now)).toBe(false)
    expect(isActive({ cancelDate: now }, now)).toBe(false)
  })

  it('acceptsSku accepts the term SKU or the parent SKU and rejects anything else', () => {
    expect(acceptsSku({ productId: 'lingo.plus', termSku: 'lingo.plus.monthly' })).toBe(true)
    expect(acceptsSku({ productId: 'lingo.plus', termSku: null })).toBe(true)
    expect(acceptsSku({ productId: 'lingo.plus.monthly' })).toBe(true)
    expect(acceptsSku({ productId: 'something', termSku: 'lingo.plus.monthly' })).toBe(true)
    expect(acceptsSku({ productId: 'other.plus', termSku: 'other.plus.monthly' })).toBe(false)
    expect(acceptsSku({ productId: 'lingo.plus.yearly', termSku: null })).toBe(false)
  })
})
