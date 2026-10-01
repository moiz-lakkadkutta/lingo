import React from 'react'
import { act } from 'react-test-renderer'
import { AccessibilityInfo } from 'react-native'
import type { LibraryWord } from '@lingo/contracts'
import { createRemoteBus } from '../src/remote/types'
import { Words, type WordsProps } from '../src/screens/Words'
import { strings } from '../src/strings'
import { byLabel, is, labels, preferred, press, pressBack, pressables, render, rerender, texts } from './helpers'

vi.mock('../src/components/MiniPlayer', async (orig) => ({ ...(await orig<object>()), MiniPlayer: (p: object) => React.createElement('MiniPlayer', p) }))

const now = new Date(2026, 9, 1, 10)
const w = (id: string, due: Date, o: Partial<LibraryWord> = {}): LibraryWord => ({
  savedWordId: id, word: id, lemma: `lemma-${id}`, gloss: `gloss ${id}`, due: due.toISOString(), intervalD: 0, reps: 1, learned: false,
  clip: { slug: 'zug', title: 'Der Zug', manifestUrl: 'https://cdn.example/zug.m3u8' }, cue: { index: 2, startS: 4, endS: 6.5, text: 'Der Zug\nfährt ab.', native: 'n' }, ...o,
})
const words = [w('a', new Date(2026, 8, 30)), w('b', new Date(2026, 9, 2, 9)), w('c', new Date(2026, 9, 20), { learned: true, intervalD: 30, clip: { slug: 'x', title: 'X', manifestUrl: null } })]
const props = (over: Partial<WordsProps> = {}): WordsProps => ({ words: { state: 'ready', data: words }, filter: 'all', onFilter: vi.fn(), remote: createRemoteBus(), now, onReload: vi.fn(), onFindClip: vi.fn(), onFocusId: vi.fn(), ...over })
const rowLabel = (x: LibraryWord, due: string) => strings.words.rowLabel(x.lemma, x.gloss, due, x.clip.title)

describe('Words', () => {
  it('lists lemma, gloss, due label and clip per row with a purpose label', () => {
    const r = render(<Words {...props()} />)
    expect(labels(r)).toEqual([rowLabel(words[0]!, strings.words.dueToday), rowLabel(words[1]!, strings.words.dueTomorrow), rowLabel(words[2]!, strings.words.dueIn(19))])
    const row = byLabel(r, rowLabel(words[0]!, strings.words.dueToday))
    expect(texts(row)).toEqual(['lemma-a', 'gloss a', strings.words.dueToday, 'Der Zug'])
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([rowLabel(words[0]!, strings.words.dueToday)])
    expect(texts(r)).toContain(strings.words.hint)
  })
  it('right and left keys change the filter without wrapping and announce it', () => {
    const remote = createRemoteBus(); const onFilter = vi.fn()
    const spy = vi.mocked(AccessibilityInfo.announceForAccessibility); spy.mockClear()
    const r = render(<Words {...props({ remote, onFilter })} />)
    act(() => remote.emit({ eventType: 'left' }))
    expect(onFilter).not.toHaveBeenCalled()
    act(() => remote.emit({ eventType: 'right' }))
    expect(onFilter).toHaveBeenLastCalledWith('due')
    expect(spy).toHaveBeenLastCalledWith(strings.words.filterLabel('Due today', 1))
    rerender(r, <Words {...props({ remote, onFilter, filter: 'learned' })} />)
    onFilter.mockClear()
    act(() => remote.emit({ eventType: 'right' }))
    expect(onFilter).not.toHaveBeenCalled()
    act(() => remote.emit({ eventType: 'left' }))
    expect(onFilter).toHaveBeenLastCalledWith('due')
    // the current pill carries a check and the selected ring
    const pill = r.root.find((n) => n.props.testID === 'pill-learned')
    expect(pill.findAll((n) => is(n, 'View') && n.props.testID === 'check')).toHaveLength(1)
    expect(labels(r)).toEqual([rowLabel(words[2]!, strings.words.dueIn(19))])
  })
  it('Select plays the cue span in the mini player; a word without a manifest shows the not-available line', async () => {
    const r = render(<Words {...props()} />)
    await press(byLabel(r, rowLabel(words[0]!, strings.words.dueToday)))
    const mp = r.root.find((n) => (n.type as unknown) === 'MiniPlayer')
    expect(mp.props).toMatchObject({ manifestUrl: 'https://cdn.example/zug.m3u8', startS: 4, endS: 6.5, caption: 'Der Zug fährt ab.', playKey: 1 })
    await press(byLabel(r, rowLabel(words[0]!, strings.words.dueToday)))
    expect(r.root.find((n) => (n.type as unknown) === 'MiniPlayer').props.playKey).toBe(2)
    await press(byLabel(r, rowLabel(words[2]!, strings.words.dueIn(19))))
    expect(r.root.findAll((n) => (n.type as unknown) === 'MiniPlayer')).toHaveLength(0)
    expect(texts(r)).toContain(strings.words.noLine)
  })
  it('each filter has its own empty message with a Find a clip action', async () => {
    const onFindClip = vi.fn()
    const empty = (filter: WordsProps['filter'], data: LibraryWord[] = []) => render(<Words {...props({ filter, onFindClip, words: { state: 'ready', data } })} />)
    expect(texts(empty('all'))).toContain(strings.words.empty)
    expect(texts(empty('due', [words[2]!]))).toContain(strings.words.emptyDue)
    const l = empty('learned', [words[0]!])
    expect(texts(l)).toContain(strings.words.emptyLearned)
    expect(preferred(l).map((p) => p.props['aria-label'])).toEqual([strings.words.findClip])
    await press(byLabel(l, strings.words.findClip))
    expect(onFindClip).toHaveBeenCalled()
    expect(pressables(render(<Words {...props({ words: { state: 'loading' } })} />))).toHaveLength(0)
    expect(texts(render(<Words {...props({ words: { state: 'error', error: 'offline' } })} />))).toContain(strings.offline)
  })
  it('Back closes the mini player before leaving', async () => {
    const r = render(<Words {...props()} />)
    expect(pressBack()).toBe(false)
    await press(byLabel(r, rowLabel(words[0]!, strings.words.dueToday)))
    expect(r.root.findAll((n) => (n.type as unknown) === 'MiniPlayer')).toHaveLength(1)
    expect(pressBack()).toBe(true)
    expect(r.root.findAll((n) => (n.type as unknown) === 'MiniPlayer')).toHaveLength(0)
    expect(pressBack()).toBe(false)
    expect(r.root.findAll((n) => is(n, 'Text') && n.props.children === strings.words.title)).toHaveLength(1)
  })
})
