import React from 'react'
import { About } from '../src/screens/About'
import { strings } from '../src/strings'
import { labels, render, texts } from './helpers'

describe('About & attributions (device test 2026-10-23)', () => {
  it('shows a loading line under Clips while the credits load, never an empty page', () => {
    const r = render(<About credits={null} onBack={vi.fn()} />)
    expect(texts(r)).toEqual(expect.arrayContaining([strings.about.clips, strings.about.clipsLoading]))
    expect(labels(r)).toEqual([strings.about.backLabel])
  })
  it('says the credits cannot load when they failed and nothing is cached', () => {
    const r = render(<About credits={null} failed onBack={vi.fn()} />)
    expect(texts(r)).toContain(strings.about.clipsOffline)
  })
  it('lists every credit and skips clips without an attribution', () => {
    const r = render(<About credits={[{ slug: 'a', title: 'A', attribution: 'By a' }, { slug: 'b', title: 'B', attribution: '' }]} onBack={vi.fn()} />)
    const t = texts(r)
    expect(t).toContain('A — By a')
    expect(t.some((x) => x.startsWith('B —'))).toBe(false)
    expect(t).not.toContain(strings.about.clipsLoading)
  })
})
