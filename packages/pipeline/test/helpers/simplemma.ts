import { pythonHasSimplemma } from '../../src/lemmatize'

/**
 * Whether the simplemma-dependent tests can run (LINGO_PYTHON → a venv with simplemma 2.0.0, docs/decisions/0004). Locally they are skipped
 * without it; in CI (env CI set) a missing LINGO_PYTHON or simplemma throws, so those tests fail loudly instead of silently skipping.
 * .github/workflows/ci.yml builds .venv-lemma (pip install simplemma==2.0.0) and sets LINGO_PYTHON for `pnpm test`.
 */
export async function simplemmaAvailable(env: Record<string, string | undefined> = process.env, probe: () => Promise<boolean> = () => pythonHasSimplemma()): Promise<boolean> {
  if (!env.CI) return probe()
  if (!env.LINGO_PYTHON || !(await probe())) throw new Error('CI: the simplemma tests need LINGO_PYTHON pointing at a Python with simplemma==2.0.0 (see .github/workflows/ci.yml)')
  return true
}
