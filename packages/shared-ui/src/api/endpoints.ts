import { Catalog, ClipResponse, LearnerDto, LevelResult, LibraryWord } from '@lingo/contracts'
import type { HighlightDto, LearnerSettingsPatch, LevelPut, ProgressPut } from '@lingo/contracts'
import type { Api } from './client'

export interface Endpoints {
  me(): Promise<LearnerDto>
  patchMe(p: LearnerSettingsPatch): Promise<LearnerDto>
  catalog(): Promise<Catalog>
  clip(slug: string): Promise<ClipResponse>
  putProgress(b: ProgressPut): Promise<void>
  putLevel(b: LevelPut): Promise<LevelResult>
  library(): Promise<LibraryWord[]>
  saveWord(highlightId: string, sessionCode?: string): Promise<{ limit: boolean; saved: { highlight: HighlightDto } | null }>
}
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })
/** Typed calls; responses are parsed with the contracts (extra server fields stripped). */
export function endpoints(api: Api): Endpoints {
  return {
    me: async () => LearnerDto.parse(await api('/me')),
    patchMe: async (p) => LearnerDto.parse(await api('/me', json('PUT', p))),
    catalog: async () => Catalog.parse(await api('/catalog')),
    clip: async (slug) => ClipResponse.parse(await api(`/clips/${encodeURIComponent(slug)}`)),
    putProgress: async (b) => { await api('/me/progress', json('PUT', b)) },
    putLevel: async (b) => LevelResult.parse(await api('/me/level', json('PUT', b))),
    library: async () => LibraryWord.array().parse(await api('/me/library')),
    saveWord: (highlightId, sessionCode) => api('/me/words', json('POST', { highlightId, sessionCode })),
  }
}
