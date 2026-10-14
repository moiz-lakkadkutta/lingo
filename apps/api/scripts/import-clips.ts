/**
 * Import processed clips into Postgres (src/lib/clipImport.ts):
 *   pnpm clips:import [--manifest content/clips.json] [--work packages/pipeline/work] [--dry-run] [--status draft|published]
 * Exit 1 when no clip was imported (or would be, with --dry-run); 2 on a usage or manifest error.
 */
import { runImportCli } from '../src/lib/clipImport'

const dryRun = process.argv.includes('--dry-run')
runImportCli(process.argv.slice(2))
  .then(async (code) => {
    if (!dryRun) await (await import('../src/lib/db')).db.$disconnect()
    process.exit(code)
  })
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(2)
  })
