import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Lang } from './types'

/** Letters, inner apostrophes and hyphens only: drops digits, punctuation-only rows and clitics like 's. */
export const FREQ_TOKEN = /^\p{L}[\p{L}'’-]*$/u

const here = dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = resolve(here, '..', 'data')

/** One lemma per line, rank = line number; blanks and '#' comments ignored. */
export function parseFreqList(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
}

/** Case-insensitive rank lookup (1-based). */
export function rankFn(list: string[]): (lemma: string) => number | undefined {
  const m = new Map<string, number>()
  list.forEach((l, i) => { const k = l.toLowerCase(); if (!m.has(k)) m.set(k, i + 1) })
  return (lemma) => m.get(lemma.toLowerCase())
}

export async function loadFreqList(lang: Lang, dataDir = DATA_DIR): Promise<string[]> {
  return parseFreqList(await readFile(resolve(dataDir, `freq-${lang}.txt`), 'utf8'))
}

/** Sum counts per lemma (lowercased); order by count desc, then first seen. Pure. */
export function mergeByLemma(rows: Array<{ word: string; count: number; lemma: string }>): Array<{ lemma: string; count: number }> {
  const totals = new Map<string, { lemma: string; count: number; order: number }>()
  rows.forEach((r, i) => {
    const key = r.lemma.toLowerCase()
    const cur = totals.get(key)
    if (cur) cur.count += r.count
    else totals.set(key, { lemma: key, count: r.count, order: i })
  })
  return [...totals.values()].sort((a, b) => b.count - a.count || a.order - b.order).map(({ lemma, count }) => ({ lemma, count }))
}
