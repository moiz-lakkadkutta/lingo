import { SESSION_CODE_RE } from '@lingo/contracts'
import { joinUrlFor, newCode } from '../src/routes/sessions'

describe('newCode', () => {
  const samples = Array.from({ length: 1000 }, () => newCode())
  it('is 6 characters from the unambiguous alphabet', () => { for (const c of samples) expect(c).toMatch(SESSION_CODE_RE) })
  it('never contains 0, O, 1 or I', () => { for (const c of samples) expect(c).not.toMatch(/[0O1I]/) })
  it('is not obviously repetitive', () => { expect(new Set(samples).size).toBeGreaterThanOrEqual(990) })
})

describe('joinUrlFor', () => {
  const prev = process.env.PHONE_URL
  afterEach(() => { if (prev === undefined) delete process.env.PHONE_URL; else process.env.PHONE_URL = prev })
  it('defaults to lingo://join/<code>', () => { delete process.env.PHONE_URL; expect(joinUrlFor('ABC234')).toBe('lingo://join/ABC234') })
  it('uses PHONE_URL when set', () => { process.env.PHONE_URL = 'https://phone.lingo.example/join'; expect(joinUrlFor('ABC234')).toBe('https://phone.lingo.example/join/ABC234') })
})
