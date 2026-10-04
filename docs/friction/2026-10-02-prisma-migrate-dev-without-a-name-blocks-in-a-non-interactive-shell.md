# Prisma: `migrate dev` without `--name` blocks on a prompt in a non-interactive shell

Task attempted: Generate the LING-005/006/007 migrations from an agent shell, as the plans say
(`pnpm --filter @lingo/api exec prisma migrate dev --name … [--create-only]`, docs/plans/LING-005.md §2 A2, LING-006.md G1,
LING-007.md G1).
Steps (reproduced on 2026-10-02 against a scratch database, which was dropped afterwards):
  1. `prisma migrate dev --create-only </dev/null` (no `--name`, stdin closed, no TTY).
  2. The same with `CI=1`.
  3. `prisma migrate dev --create-only --name probe </dev/null`.
Expected: A command that cannot prompt fails at once and says which flag it needs.
Actual:
  1. Prisma applies the pending migrations, then prints `? Enter a name for the new migration: ›` and waits. It never returns; `timeout 40` ended it (exit 124).
  2. With `CI=1` it does not ask and does not fail: it writes a migration directory with no name suffix (`20261002003107/`).
  3. With `--name` it works without a prompt (`Prisma Migrate created the following migration without applying it 20261002002606_probe`).
  The empty probe migrations were deleted.
Severity: Low. An agent or script that forgets `--name` hangs until its tool timeout; with `CI` set it commits an unnamed migration.
Minutes lost by the implementers: TBD by human.
Workaround: Always pass `--name`, and `--create-only` when the migration drops data (LING-005 drops `Learner.knownRank`); review the SQL,
then `prisma migrate deploy`.
Suggestion: Fail fast with "pass --name" when stdin is not a TTY, and never write a nameless migration.
Environment: Third party (Prisma). prisma 6.19.3, PostgreSQL (local), Node 22.22.0; Claude Code cloud container.
Links:
  - https://www.prisma.io/docs/orm/reference/prisma-cli-reference
  - `apps/api/prisma/migrations/` (the six migrations on the branch)
