# LING-008 — Twelve clips, Vega build, polish, docs, feedback, friction logs · freeze Oct 15

Planner: opus, 2026-10-01. Ticket: TASKS.md LING-008. Inputs read: CLAUDE.md, docs/ORCHESTRATOR.md, TASKS.md, docs/PLAN.md and the
full plan + runbook artifacts it links, docs/content.md, docs/aws.md, docs/feedback.md, docs/feature-requests.md, docs/friction/*,
scripts/new-friction.mjs, decisions 0001/0003/0004/0007/0008, docs/spot-checks/2026-10-02-gate-c.md, packages/pipeline (cli.ts,
prepare.ts, steps/*, ai/cost.ts, vtt.ts), apps/vega/*, apps/expo (App.tsx, README, metro.config.js, app.json), infra/*, README.md,
.github/workflows/ci.yml, ../vega-media-kit (README, docs/decisions 0001/0002, device-matrix, fire-os-and-vega-one-codebase).

**No AWS calls are made by this plan or by the implementer sessions it describes.** Every step that touches AWS is a command for
the human, listed in §2.9 and §10. developer.amazon.com and aws.amazon.com could not be opened from this session (egress proxy
refused them), so every Amazon/AWS price and Vega doc statement below is either quoted from the repo (with its source) or marked
**verify**. Facts about Vega packages come from the public npm registry and Amazon's sample repos on raw.githubusercontent.com,
read on 2026-10-01 (URLs in §13).

## 0. Scope, ownership, order

| WP | What | Role · model | Depends on | Can start now |
|---|---|---|---|---|
| A | Clip batch manifest + runner (`pnpm pipeline batch`), BY-SA `NOTE` in VTTs, posters, cost estimate, human runbook | Implementer · opus | nothing (Phase 2 of the human run waits for Gate C) | yes |
| B | `apps/vega` as a buildable RNV project consuming shared-ui; static checks without the SDK; VVD checklist | Implementer · opus | small shared-ui change (§3.4) agreed with LING-005 owner | yes |
| C | Polish: fonts (Noto Sans, Manrope) on Fire OS and Vega | Implementer · opus (with WP-B) | none | yes |
| D | Docs: README, docs/aws.md, docs/feedback.md, docs/feature-requests.md, friction index | Scribe · opus | placeholders for LING-005/006/007 | yes |
| E | Friction logs: audit the 10 existing, write the new ones that have evidence today, list the conditional ones | Scribe · opus | — | yes |
| F | Design QA screenshot procedure + sheet template | Scribe · opus; capture by the human | LING-005/006/007 merged for the capture itself | procedure yes, capture no |

Review each WP with a Reviewer (fable) per docs/ORCHESTRATOR.md. Suggested sessions: (1) WP-A; (2) WP-B + WP-C; (3) WP-D + WP-E + WP-F.
Each implementer runs `pnpm typecheck && pnpm test && pnpm lint:words` before returning (known baseline failure:
`apps/expo/RemoteBridge.tsx` TS2305, see §6.2 N6 — do not fix it inside LING-008 unless the orchestrator says so).

Not taken over (separate items, §8): Gate C prompt fixes and human scoring (LING-002), the highlight dictionary check
(ASR `sal` became a highlight), the segmenter's fast-acted-dialogue failure without `--cues`, the learner-band filter in
`GET /clips/:slug` (LING-005 follow-up), Lingo screens (LING-005), phone (LING-006), IAP and platform bindings (LING-007).

Dates: today 2026-10-01; kill date Oct 8; **freeze Oct 15**; submission Oct 22. WP-A code and the human's Phase 1 run (no AI) should
land by Oct 6 so `--cues` corrections fit before the freeze; Phase 2 (AI + publish) runs the day Gate C passes.

---

## 1. Files touched (all WPs)

New
- `content/clips.json` — the batch manifest (12 rows, §2.3)
- `content/cues/` — committed corrected target VTTs from `--cues` passes (start with `what-to-do-on-a-date-1950.en.vtt`, copied by the human from the Gate A run)
- `packages/pipeline/src/batch/manifest.ts` — Zod schema + loader + validation
- `packages/pipeline/src/batch/plan.ts` — builds the step list; `renderStep()` for dry-run
- `packages/pipeline/src/batch/run.ts` — executes steps, resume rules, report
- `packages/pipeline/src/batch/licence.ts` — licence re-check (archive.org metadata, Commons extmetadata, manual)
- `packages/pipeline/src/batch/estimate.ts` — cost estimate constants and function
- `packages/pipeline/test/batch.*.test.ts` — tests (§2.10)
- `apps/vega/{package.json,manifest.toml,app.json,index.js,babel.config.js,metro.config.js,tsconfig.json,.gitignore}`
- `apps/vega/src/App.tsx` (from `App.template.tsx`), `apps/vega/src/config.ts`, `apps/vega/types/lingo-shared-ui.d.ts`
- `apps/vega/assets/image/lingo-icon.png` (placeholder icon; human replaces), `apps/vega/scripts/copy-fonts.mjs`
- `scripts/check-vega.mjs` — static checks of the Vega project (no SDK)
- `packages/shared-ui/assets/fonts/{NotoSans-Regular.ttf,NotoSans-SemiBold.ttf,Manrope-ExtraBold.ttf,OFL-NotoSans.txt,OFL-Manrope.txt}`
- `docs/design-qa/README.md` — procedure (§7) and `docs/design-qa/TEMPLATE.md` — the sheet
- new friction logs (§6.2), via `pnpm friction "<title>"`

Changed
- `packages/pipeline/src/cli.ts` (+ `batch` command), `packages/pipeline/src/prepare.ts` + `types.ts` (+ `vttNote`), `packages/pipeline/src/vtt.ts` (`cuesToVtt` note)
- `pnpm-workspace.yaml` (`!apps/vega`), root `package.json` (`check:vega` script; `smol-toml` devDependency), `.gitignore`
- `packages/shared-ui/src/platformCaps.ts` (+ `playback`), `packages/shared-ui/src/screens/Player.tsx` (playback-off message), `packages/shared-ui/src/strings.ts`
- `apps/expo/app.json` (expo-font plugin fonts)
- `apps/vega/README.md` (rewrite), delete `apps/vega/App.template.tsx` and `apps/vega/metro.config.template.js` once their content lives in the real files
- `README.md`, `docs/aws.md`, `docs/feedback.md`, `docs/feature-requests.md`, `docs/friction/README.md`, `.env.example` (bucket name note)
- `.github/workflows/ci.yml` (+ `pnpm check:vega`)

---

## 2. WP-A — Clip batch

### 2.1 Why a runner and not twelve hand-typed commands

docs/content.md §8 is a 13-step checklist per clip (licence re-check, download, probe, cut, upload, prepare, warnings review, BY-SA
`NOTE`). Twelve clips × two phases is ~300 manual commands. The runner encodes the checklist, resumes where it stopped, never pays
Transcribe twice (`--reuse` when `work/<slug>/transcript.json` exists), and prints the exact commands in `--dry-run` so the human can
read them before any spend.

### 2.2 Manifest schema (`packages/pipeline/src/batch/manifest.ts`)

```ts
import { z } from 'zod'
export const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
export const Timecode = z.string().regex(/^\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?$/) // mm:ss or hh:mm:ss[.mmm]
export const LicenceCheck = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ia'), id: z.string() }),                 // https://archive.org/metadata/<id> → metadata.licenseurl
  z.object({ kind: z.literal('commons'), file: z.string() }),           // "File:<name>" → extmetadata.LicenseShortName
  z.object({ kind: z.literal('manual'), url: z.string().url(), verifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }), // schule.zdf.de etc.
])
export const BatchClip = z.object({
  slug: Slug,
  title: z.string().min(1),
  lang: z.enum(['de', 'en']),
  natives: z.array(z.string().min(2).max(5)).min(1),                    // first = gloss/quiz language
  formality: z.enum(['FORMAL', 'INFORMAL']).default('INFORMAL'),
  license: z.string().min(1),                                           // short label exactly as docs/content.md §8: "CC BY 4.0", "CC BY-SA 4.0", "Public domain (US)"
  licenseUrl: z.string().url(),
  attribution: z.string().min(1),                                       // character for character from docs/content.md
  sourceUrl: z.string().url(),                                          // the page that states the licence
  downloadUrl: z.string().url().nullable(),                             // null when sourceS3 is given
  sourceS3: z.string().regex(/^s3:\/\//).nullable().default(null),      // an already-uploaded cut (skips fetch/cut/upload)
  segment: z.object({ in: Timecode, out: Timecode, confirmed: z.boolean() }),
  expectedDurationS: z.number().min(180).max(480),                      // 3–8 min (docs/content.md "What qualifies")
  cues: z.string().nullable().default(null),                            // content/cues/<slug>.<lang>.vtt → prepare --cues
  posterAtS: z.number().nonnegative().nullable().default(null),         // default 10 % of duration
  licenceCheck: LicenceCheck,
  editorialNote: z.string().nullable().default(null),                   // e.g. friedlaender: testimony, handle glosses with care
})
export const BatchManifest = z.object({
  version: z.literal(1),
  gateC: z.enum(['pending', 'passed']),                                 // the human flips this; final phase refuses 'pending'
  bucketEnv: z.literal('S3_BUCKET_MEDIA'),
  clips: z.array(BatchClip).length(12),                                 // reserve swaps keep the count at 12 (8 is acceptable per PLAN §14: use --only)
})
```

Extra validation in `loadManifest(path)` (each a test in §2.10), errors collected and printed together:
- slugs unique; `out > in`; `|(out − in) − expectedDurationS| ≤ 2`;
- `attribution` and `title` contain no `…`, `TBD` or `TODO` (catches the cut-off ZDF credit, docs/content.md [^g5]);
- `license` matches `/^(CC BY(-SA)? \d\.\d( [a-z]{2})?|Public domain \((US|VOA)\))$/` (labels in docs/content.md §5);
- `natives` never contains `lang`; every native has a Shaka `HLS_NAMES` entry (de, en, tr, ar, uk) — `steps/package.ts`;
- `downloadUrl === null` iff `sourceS3 !== null`;
- `cues`, when set, exists on disk and its file name ends in `.${lang}.vtt`.

`isShareAlike(clip) = /BY-SA/.test(clip.license)` (docs/content.md §5 also says to treat `cosmos-laundromat` as BY-SA: its manifest `license` is `CC BY-SA 3.0`'s stricter reading — see §2.3 row 10).

### 2.3 The 12 rows (`content/clips.json`)

Copy `title`, `license`, `licenseUrl`, `attribution`, `sourceUrl`, `downloadUrl` **verbatim** from docs/content.md §2 (do not retype from
this table; it is abbreviated). Defaults: `natives = ["en"]` for German clips and `["de"]` for English clips (the pair Gate A/C ran;
see open question 3), `formality = "INFORMAL"` unless listed.

| # | slug | lang | segment (in–out) · confirmed | expected s | licence label | licenceCheck | notes for the implementer |
|---|---|---|---|---|---|---|---|
| 1 | jung-naiv-drogen | de | 02:00–08:00 · **false** | 360 | CC BY 3.0 | commons `Drogen_-_Jung_&_Naiv_Folge_81_-_YouTube.webm` | 799.7 MB source; two speakers, back-channel overlap (0007) |
| 2 | openhpi-vandalismus | de | 00:00–07:00 · **false** | 420 | CC BY-SA 4.0 | commons (file name from the Direct file URL) | `formality: FORMAL` (LING-001-quality §14: openHPI rows FORMAL); BY-SA → NOTE |
| 3 | terra-x-friedlaender | de | 00:00–03:46 · true | 226 | CC BY 4.0 | manual (schule.zdf.de page, docs/content.md §7) | Gate A clip; work dir exists on the human's machine → `--reuse`; `editorialNote` (testimony) |
| 4 | terra-x-klimafaktoren | de | 00:00–07:14 · true | 434 | CC BY 4.0 | manual (schule.zdf.de) | narration |
| 5 | terra-x-becker-interview | de | 00:00–04:49 · true | 289 | CC BY-SA 4.0 | manual (schule.zdf.de) | BY-SA → NOTE |
| 6 | terra-x-so-trinken-baeume | de | 00:00–04:19 · true | 259 | CC BY 4.0 | manual (schule.zdf.de) | **attribution TBD by human** (credit cut at "Jochen …", [^g5]) — validation must fail until fixed |
| 7 | what-to-do-on-a-date-1950 | en | 00:16–07:55 · true | 459 | Public domain (US) | ia `WhattoDo1950` | `sourceS3` = the cut already in the media bucket (docs/content.md row 7); `downloadUrl: null`; `cues: content/cues/what-to-do-on-a-date-1950.en.vtt` (Gate A needed a `--cues` pass) |
| 8 | sprite-fright | en | 00:00–06:00 · **false** | 360 | CC BY 4.0 | commons `Sprite_Fright_-_Blender_Open_Movie-full_movie.webm` | use the IA mp4 (60.6 MB) as `downloadUrl`; acted dialogue → expect `--cues` |
| 9 | shy-guy-1947 | en | 00:00–07:00 · **false** | 420 | Public domain (US) | ia `ShyGuy1947` | acted dialogue → expect `--cues`; IA Whisper .srt to compare |
| 10 | cosmos-laundromat | en | 00:00–05:30 · **false** | 330 | CC BY-SA 3.0 (see notes) | ia `CosmosLaundromatFirstCycle` | docs/content.md §5: "treat as at least BY-SA" → label `CC BY-SA 3.0`, NOTE on; rated 13+ |
| 11 | tears-of-steel | en | 00:00–04:30 · **false** | 270 | CC BY 3.0 | ia `Tears-of-Steel` | the content.md row is shifted one column: the direct file is `https://archive.org/download/Tears-of-Steel/tears_of_steel_1080p.mp4` (76 MB) |
| 12 | duck-and-cover | en | 01:00–07:30 · true | 390 | Public domain (US) | ia `DuckandC1951` | song + SFX at the start (in-point 01:00 skips them) |

Total 4 217 s = 70.3 min; new Transcribe minutes (rows 3 and 7 already transcribed) = 58.9 min.

`confirmed: false` rows are the "confirm by listening/viewing" segments (docs/content.md §6). The runner refuses to cut them unless
`--allow-unconfirmed`; the human listens to the first and last 10 s of the cut, edits `segment`, sets `confirmed: true`.

### 2.4 Stages and the exact commands they run

Per clip, in order. `W = work` (`--work`), `S = work/_sources`, `C = work/_cuts`, `B = $S3_BUCKET_MEDIA` (bucket name has the account
suffix: `lingo-media-dev-<account>`; take it from the stack output, §2.9).

| stage | skipped when | command(s) (rendered verbatim by `--dry-run`) |
|---|---|---|
| `verify` | `licenceCheck.kind === 'manual'` with `verifiedOn` set (prints the URL as a reminder) | ia: `GET https://archive.org/metadata/<id>` → `metadata.licenseurl` must equal `licenseUrl` after normalising scheme, `www.` and trailing `/`; commons: `GET https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=File:<file>` → `extmetadata.LicenseShortName.value` must equal the label's licence part (`CC BY 4.0` etc.). Uses `fetch`; no AWS. A mismatch fails the clip ("licence changed — update docs/content.md first", content.md §8). manual with `verifiedOn: null` fails. |
| `fetch` | `sourceS3` set, or `S/<slug>.<ext>` exists with size > 0 | `curl -L --fail --retry 3 -o S/<slug>.<ext> "<downloadUrl>"` then `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 S/<slug>.<ext>` → duration ≥ `out` |
| `cut` | `sourceS3` set, or `C/<slug>.mp4` exists | `ffmpeg -hide_banner -loglevel error -nostats -y -ss <in> -to <out> -i S/<slug>.<ext> -c:v libx264 -preset veryfast -crf 18 -c:a aac -b:a 192k -ac 2 -movflags +faststart C/<slug>.mp4`, then ffprobe → `|duration − (out−in)| ≤ 1 s`. Always re-encode (frame-accurate, one container for Transcribe; content.md §8 notes `-c copy` drifts to keyframes). `-ss` before `-i` with re-encoding is accurate: https://trac.ffmpeg.org/wiki/Seeking |
| `upload` | `sourceS3` set | `aws s3 cp C/<slug>.mp4 s3://B/clips/<slug>.mp4 --content-type video/mp4 --only-show-errors` |
| `prepare` | — | in-process `prepare()`; rendered as `AWS_REGION=eu-central-1 pnpm pipeline prepare --clip <slug> --source <s3> --lang <lang> --native <natives> --formality <f> [--reuse] [--cues <file>] [--no-ai --no-publish]` — see §2.5 for phase flags. `--reuse` when `W/<slug>/transcript.json` and `W/<slug>/mezz.mp4` exist. `vttNote` passed for BY-SA (§2.8). |
| `poster` | `W/<slug>/poster.jpg` exists | `ffmpeg -hide_banner -loglevel error -nostats -y -ss <posterAtS ?? 0.1·duration> -i W/<slug>/mezz.mp4 -frames:v 1 -vf scale=1280:-2 -q:v 3 W/<slug>/poster.jpg` (local only) |
| `publish-extra` | phase `draft` | `aws s3 cp W/<slug>/poster.jpg s3://B/published/<slug>/poster.jpg --cache-control public,max-age=60 --content-type image/jpeg` (prepare's own publish covers HLS, VTTs and clip.json — `steps/publish.ts`) |

`<s3>` = `sourceS3 ?? s3://B/clips/<slug>.mp4`. Commands run through the same `exec` seam as `PrepareDeps.exec` (execa,
stderr inherited) so tests use a recorder.

### 2.5 CLI

```
pnpm pipeline batch <manifest.json>
  --phase <draft|final>      draft (default): prepare --no-ai --no-publish (Transcribe + Translate only, Gate C independent)
                             final: AI glosses + quiz + publish (+ poster upload); refused while manifest.gateC is "pending" unless --force-ai
  --dry-run                  validate, show resume state per stage, print every command and the cost estimate; no network, no AWS, no ffmpeg, exit 0
  --only <slug,slug>         subset (also how a reserve row is processed after a swap)
  --stages <list>            default verify,fetch,cut,upload,prepare,poster,publish-extra
  --work <dir>               default work
  --allow-unconfirmed        cut rows whose segment.confirmed is false
  --fail-fast                stop at the first failed clip (default: continue, exit 1 at the end if any failed)
  --report <path>            default work/batch-report.{json,md}
```

Wire into `cli.ts` with `program.command('batch')` and an `addHelpText('after', …)` block that shows the four human commands of §2.9.
Exported API: `planBatch(manifest, opts, fsState) → BatchStep[]`, `renderStep(step) → string`, `runBatch(manifest, opts, deps) → BatchReport`,
`estimateBatch(manifest, fsState, opts) → CostEstimate`. `fsState` is a plain object (`{ exists(path): boolean }`) so planning is pure.

```ts
type BatchStep =
  | { slug: string; stage: 'verify'; check: LicenceCheck; expect: string }
  | { slug: string; stage: 'fetch' | 'cut' | 'upload' | 'poster' | 'publish-extra'; cmd: string; args: string[]; skip?: string }
  | { slug: string; stage: 'prepare'; input: PrepareInput; skip?: string }
interface BatchRow { slug: string; status: 'ok' | 'failed' | 'skipped'; failedStage?: string; error?: string; level?: string; cues?: number; highlights?: number; quiz?: number; warnings: string[]; dropped?: number; gate: 'pass' | 'fail' | 'n/a'; costUsd?: number; seconds: number }
interface BatchReport { phase: 'draft' | 'final'; at: string; rows: BatchRow[]; estimate: CostEstimate }
```

### 2.6 Resume and safety rules

- A failed stage stops that clip only; the next run resumes from the first stage whose output is missing.
- The prepare gate failure (0007) is a normal outcome: the row shows `gate: fail` and the hint `edit work/<slug>/<lang>.vtt, copy it to
  content/cues/<slug>.<lang>.vtt, set "cues" in content/clips.json, re-run --only <slug>`.
- Never delete `transcript.json`; the report prints "Transcribe will run for: <slugs>" before any real run so the spend is visible.
- `--phase final` requires `S3_BUCKET_MEDIA` and `CLOUDFRONT_DOMAIN` (prepare already checks) and `gateC: "passed"`.
- `warnings` containing `no highlights:` mark the row `status: 'failed'` with "swap for a reserve row" (content.md §8 says reject).
- The report lists every `review:` warning per clip so the human does the content.md §8 review in one place.

### 2.7 Report

`work/batch-report.json` (`BatchReport`) and `work/batch-report.md` (one table row per clip: slug, status, level, cues, highlights, quiz,
warnings count, review count, gate, cost, seconds; then a "Needs a human" list: unconfirmed segments, gate failures, `no highlights`,
`review:` lines). Printed to stdout at the end. Values are read from `work/<slug>/clip.json` and `gate.json` after prepare.

### 2.8 BY-SA `NOTE` in derived VTTs (small pipeline change)

docs/content.md §5: derived VTTs of BY-SA clips carry a `NOTE` with licence and attribution at the top. The kit's `serializeVtt`
has no NOTE support (`../vega-media-kit/src/core/vtt.ts:227`), so do it in Lingo:
- `types.ts` `PrepareInput.vttNote?: string`; CLI `prepare --vtt-note <text>`.
- `vtt.ts` `cuesToVtt(cues, trackId, note?)`: insert `NOTE <text>\n\n` after the `WEBVTT\n\n` header (single line; newlines in the
  note replaced by spaces; reject `-->` in the note).
- `prepare.ts` passes `input.vttNote` to every `cuesToVtt` call that writes a published track (target, natives; not `dropped.vtt`).
- Batch sets `vttNote = "<license> <licenseUrl> — <attribution>. Subtitles and translations by Lingo, same licence."` for BY-SA rows.
- `loadCuesVtt` already skips NOTE blocks (kit `parseVtt`), so the `--cues` round trip is unaffected.
- Risk: Shaka Packager reading a VTT with a NOTE block is untested here (packager is not installed in this sandbox). The first BY-SA
  clip in the human's Phase 1 run proves it; if packager rejects it, drop the note from the packaged copy and keep it in the
  whole-file VTTs that publish uploads (`steps/publish.ts`).

### 2.9 Human runbook (the exact commands; nothing here runs in an agent session)

Phase 0 — once
```
cd ~/hackathon/lingo && git pull && pnpm i && pnpm db:generate
python3 -m venv .venv-lemma && .venv-lemma/bin/pip install simplemma==2.0.0
which ffmpeg ffprobe packager aws curl                       # all five must print a path
aws sts get-caller-identity                                  # the profile you deploy with (not root keys: docs/friction/2026-10-01-cdk-deploy-as-root-user-…)
aws cloudformation describe-stacks --stack-name lingo-media-dev --region eu-central-1 --query "Stacks[0].Outputs" --output table
export S3_BUCKET_MEDIA=<MediaBucket output> CLOUDFRONT_DOMAIN=<CdnDomain output> AWS_REGION=eu-central-1 LINGO_PYTHON=$PWD/.venv-lemma/bin/python
cp <gate-A work dir>/what-to-do-on-a-date-1950/en.vtt content/cues/what-to-do-on-a-date-1950.en.vtt   # the corrected VTT from Gate A (location TBD by human)
```
Edit `content/clips.json`: fix row 6's attribution from the ZDF page; set `verifiedOn` for the four manual rows after opening each
schule.zdf.de page; listen to the seven `confirmed: false` segments (after `fetch`+`cut` with `--allow-unconfirmed`, below) and confirm.

Phase 1 — no AI, no publish (Transcribe + Translate only; any day)
```
pnpm pipeline batch content/clips.json --dry-run                                   # read every command and the estimate
pnpm pipeline batch content/clips.json --stages verify,fetch,cut --allow-unconfirmed   # local only (network downloads, no AWS)
#   watch the first and last 10 s of each work/_cuts/<slug>.mp4, adjust segment, set confirmed: true, delete that cut, re-run the line above
pnpm pipeline batch content/clips.json --phase draft                               # upload + prepare --no-ai --no-publish for all 12
cat work/batch-report.md
```
For each `gate: fail` row: fix `work/<slug>/<lang>.vtt` in a subtitle editor, copy it to `content/cues/<slug>.<lang>.vtt`, set `cues`,
run `pnpm pipeline batch content/clips.json --phase draft --only <slug>` (no Transcribe spend: `--cues` + reused mezzanine).
For each `no highlights` row: swap in a reserve row (docs/content.md §3), re-run `--only <new-slug>`.

Phase 2 — after Gate C passes (set `"gateC": "passed"` in content/clips.json)
```
pnpm pipeline batch content/clips.json --phase final --dry-run
pnpm pipeline batch content/clips.json --phase final                              # glosses + quiz + publish + posters; Transcribe reused
curl -sI https://$CLOUDFRONT_DOMAIN/published/terra-x-friedlaender/master.m3u8 | head -1   # HTTP/2 200
```
Then: commit `content/clips.json`, `content/cues/*`, `work/batch-report.md` → `docs/content-runs/2026-10-xx.md` (copy, it is small);
update docs/content.md (final timecodes, `status`), docs/aws.md "Actual spend" line (sum of `clip.json.cost.usd` + Transcribe minutes).
Importing `clip.json` + manifest metadata into Postgres is not part of this WP (open question 6).

### 2.10 Tests (vitest, no network, no AWS; fake `exec`, fake `fetch`, temp dirs)

`batch.manifest.test.ts`
- it('accepts the committed content/clips.json except the documented TBD rows') — load the real file; expected errors exactly: row 6 attribution while it still contains `…` (flip the expectation when the human fixes it)
- it('rejects duplicate slugs, out <= in, and a segment that disagrees with expectedDurationS by more than 2 s')
- it('rejects attribution or title containing …, TBD or TODO')
- it('rejects a natives list containing the clip language or a code without an HLS name')
- it('requires exactly one of downloadUrl and sourceS3')
- it('reports all problems at once, not the first')
`batch.plan.test.ts`
- it('plans verify, fetch, cut, upload, prepare, poster in order for a fresh clip')
- it('skips fetch, cut and upload when sourceS3 is set')
- it('adds --reuse when transcript.json and mezz.mp4 exist, and --cues when the manifest sets cues')
- it('renders the draft prepare as --no-ai --no-publish and the final prepare without them')
- it('refuses phase final while gateC is pending unless forceAi')
- it('refuses to cut an unconfirmed segment unless allowUnconfirmed')
- it('sets vttNote only for BY-SA licences')
- it('renders every command as a copy-pasteable shell line (quotes URLs with & and %)')
- it('dry-run makes no exec and no fetch calls') — spies stay at 0 calls
`batch.run.test.ts`
- it('continues after a failed clip and exits non-zero at the end; --fail-fast stops')
- it('marks a gate failure as gate: fail with the --cues hint, not as a crash')
- it('marks no highlights as failed with the swap hint')
- it('writes batch-report.json and .md with one row per clip') — prepare via `fixtureDeps` (`--fixture` path), so it runs the real prepare offline
- it('resumes from the first missing output')
`batch.licence.test.ts`
- it('passes when archive.org licenseurl matches after normalising http/https and trailing slash')
- it('fails when Commons LicenseShortName differs')
- it('fails a manual check without verifiedOn')
`batch.estimate.test.ts`
- it('charges Transcribe only for clips without transcript.json')
- it('multiplies Translate by natives and by phases')
`vtt.test.ts` (extend)
- it('cuesToVtt puts a single-line NOTE after the header and parseVtt skips it')
- it('rejects a note containing -->')

Acceptance for WP-A: tests above pass; `pnpm pipeline batch content/clips.json --dry-run` exits 0 offline and prints 12 clips, every
command, "Transcribe will run for: 10 clips (58.9 min)" and the estimate; `pnpm --filter @lingo/pipeline typecheck && test` green.

### 2.11 Cost estimate (printed by `--dry-run`; prices are the repo's, **unverified**)

Constants in `estimate.ts`, each with a `// verify: <pricing URL>` comment: Transcribe `$0.024/min` (docs/aws.md); Translate
`$15 / M chars` (docs/aws.md); speech chars per second `15` (upper estimate; replace with the measured mean of Phase 1 cue text);
Bedrock `$0.005` per clip upper bound (Gate C run measured `$0.0010` for 16 calls and `$0.0014` for 21 calls,
docs/spot-checks/2026-10-02-gate-c.md; prices in `ai/cost.ts` are themselves unverified).

| item | basis | estimate |
|---|---|---|
| Transcribe | 58.9 new min × $0.024 | **$1.41** (all 70.3 min re-run: $1.69) |
| Translate, one native | 4 217 s × 15 ch/s = 63 k chars × 2 phases × $15/M | **$1.90** |
| Translate, natives en/de + tr, ar, uk (if chosen) | + 3 × 63 k in phase final | +$2.85 |
| Bedrock Nova Lite | 12 × ≤ $0.005 | **≤ $0.06** |
| S3 storage | ≈ 1.2 GB cuts + ≈ 2.4 GB HLS (estimate) | cents per month |
| S3 → laptop (prepare downloads its own cut), CloudFront demo traffic | a few GB | cents; free-tier coverage **verify** |
| **Total** | one native | **≈ $3.4**; with four natives ≈ $6.3 — below the ~$10 per-run escalation line (docs/KICKOFF.md) |

Pricing pages to verify against: https://aws.amazon.com/transcribe/pricing/ · https://aws.amazon.com/translate/pricing/ ·
https://aws.amazon.com/bedrock/pricing/ · https://aws.amazon.com/s3/pricing/ · https://aws.amazon.com/cloudfront/pricing/
(Transcribe bills per second with a minimum per request; check the eu-central-1 rate, which may differ from us-east-1.)

---

## 3. WP-B — Vega app (`apps/vega`)

### 3.1 Facts the design rests on (verified 2026-10-01 unless marked)

- Gate B: the Vega SDK was never installed; Fire OS primary, Vega experimental (`../vega-media-kit/docs/decisions/0001-week0-gates.md`).
  The kit's Vega adapter does not play video as written (it renders the `VideoPlayer` class as a component; rewrite KIT-010 deferred,
  kit decision 0002). Its Vega platform bindings are no-ops (KIT-007 deferred).
- Two React Native tracks exist for Vega. npm: `@amazon-devices/react-native-kepler` dist-tag `latest` = `4.0.1`, peer `react ^19.2.0`
  (built on RN 0.83: deps `@react-native/codegen 0.83.0`, `metro-runtime ^0.83.3`); `2.1.0` peers `react 18.2.0`, `react-native 0.72.0`;
  dist-tags `rn83-alpha` = `4.0.0-rn-83`, `rn83-alpha-old` = `4.0.0`. `@amazon-devices/kepler-cli-platform` latest `0.22.14`.
  `@amazon-devices/react-native-svg` has `2.0.9000000001` (RN 0.72 line) and `3.0.9000000001` (RN 0.83 line).
- Amazon's samples disagree. `react-native-multi-tv-app-sample/apps/vega`: react 18.2.0, react-native 0.72.0, kepler `^2.0.0`,
  manifest `runtime-module = "/com.amazon.kepler.keplerscript.runtime.loader_2@IKeplerScript_2_0"`, yarn workspace with shared-ui.
  `vega-video-sample` (3.24.0): react 19.2.0, react-native 0.83.0, kepler `~4.0.0+rn0.83.0`, `@react-native/*` 0.83.0,
  `engines.node >= 22`, manifest `runtime-module = "/com.amazon.kepler.runtime.react_native_kepler_4@IReactNativeKepler_0"`,
  `[os.version] min = target = "1.2"`, `icon = "@image/VideoApp.png"` (required), npm (not yarn/pnpm).
- vega-video-sample's manifest comment: "Existing FireTV app developers with apps on FireOS devices must reuse their existing application
  id to ensure existing Amazon integrations, viz. IAP, continue to work." Fire OS package here is `dev.moizp.lingo` (apps/expo/app.json).
- The multi-tv sample's `metro.config.js`: `unstable_enableSymlinks`, `watchFolders` with the shared package, `extraNodeModules` pinning
  `react`/`react-native` to the app, mapping `react-native-*` to `@amazon-devices/*` ports, `sourceExts` with `vega.ts(x)` first.
- shared-ui is written and typed against react-native-tvos 0.81 / React 19.1 (packages/shared-ui/package.json); the root
  `pnpm.overrides.react = 19.1.0` would force React 19.1 into any workspace member, which satisfies neither kepler line (`^19.2.0` or `18.2.0`).
- Fonts on Vega: "Add your font files to `<app_package_root>/assets/fonts`" (vega-video-sample README, react-native-vector-icons section).

### 3.2 Decisions (planner defaults; the human confirms in open questions 1–2)

1. **RN for Vega 0.83 track** (react 19.2.0, react-native 0.83.0, kepler ~4.0.1, svg ~3.0.9000000001, `@react-native/*` 0.83.0,
   kepler-cli-platform ~0.22.14): closest to the React 19 code in shared-ui, npm `latest`, and the track of Amazon's video sample. The
   earlier runbook advice was "stay on 0.72 unless the spike is clean"; the human decides after `vega project create` (VVD step 1) shows
   what SDK 0.24 generates. The 0.72 alternative is spelled out in §3.3 so the switch is mechanical.
2. **`apps/vega` is not a pnpm workspace member** (`pnpm-workspace.yaml`: add `'!apps/vega'`). It is an npm project with its own
   `package-lock.json`, like vega-video-sample. Reasons: the root React override; CI stays independent of the SDK and of a second RN
   copy; Vega CLI tooling is documented with npm. shared-ui is **not** declared as an npm dependency (its `workspace:*` deps would fail
   under npm); Metro reaches it through `watchFolders` + `extraNodeModules`, and its own dependencies resolve from
   `packages/shared-ui/node_modules` (installed by the root `pnpm i`).
3. **Shaka is stubbed, playback is off on Vega.** The kit's Vega adapter `require('shaka-player')`; Metro resolves requires statically, so
   without the vendored build the bundle fails. Until KIT-010, bundle `shaka-player` as an empty module for importers in the kit's
   adapters directory (same rule as apps/expo/metro.config.js) and set `caps.playback = false` on `kepler` so the Player never mounts
   `KitPlayer` on Vega (§3.4). Every other screen runs.
4. **API URL** from `src/config.ts` (`export const API_BASE_URL = 'http://192.168.1.10:4000'` placeholder + comment "set to your API's LAN
   address; the VVD's route to the host is TBD — record it in VVD step 5"). No dotenv plugin (one constant is enough).

### 3.3 Files and their content

`apps/vega/package.json`
```json
{
  "name": "@lingo/vega", "version": "0.1.0", "private": true,
  "scripts": {
    "start": "react-native start",
    "typecheck": "tsc --noEmit",
    "copy-fonts": "node scripts/copy-fonts.mjs",
    "prebuild:release": "node scripts/copy-fonts.mjs",
    "build:release": "react-native build-kepler --build-type Release",
    "build:debug": "react-native build-kepler --build-type Debug",
    "bundle:check": "react-native bundle --platform kepler --dev false --entry-file index.js --bundle-output build/check/index.bundle --assets-dest build/check"
  },
  "dependencies": {
    "@amazon-devices/react-native-kepler": "~4.0.1",
    "@amazon-devices/react-native-svg": "~3.0.9000000001",
    "@amazon-devices/react-native-w3cmedia": "<the version vega-video-sample pins: ~2.3.2>",
    "react": "19.2.0",
    "react-native": "0.83.0"
  },
  "devDependencies": {
    "@amazon-devices/kepler-cli-platform": "~0.22.14",
    "@babel/core": "^7.25.2", "@babel/runtime": "^7.25.0",
    "@react-native-community/cli": "^20.0.0",
    "@react-native/babel-preset": "0.83.0", "@react-native/metro-config": "0.83.0", "@react-native/typescript-config": "0.83.0",
    "@types/react": "^19.2.0", "typescript": "5.8.3"
  },
  "engines": { "node": ">=22" },
  "kepler": { "projectType": "application", "appName": "Lingo", "targets": ["tv"], "os": ["vega"], "api": 0.1 }
}
```
(Versions copied from vega-video-sample's package.json except the Lingo-specific fields; `socket.io-client`, `qrcode-generator`,
`@lingo/contracts` and the kit come from shared-ui's node_modules. 0.72 alternative: react 18.2.0, react-native 0.72.0, kepler `~2.1.0`,
svg `~2.0.9000000001`, `@react-native/metro-config ^0.72.6`, `metro-react-native-babel-preset ^0.76.5`, runtime-module loader_2 — the
multi-tv sample's set.)

`apps/vega/manifest.toml`
```toml
schema-version = 1

[package]
id = "dev.moizp.lingo"          # reuse the Fire OS application id (IAP continuity, vega-video-sample manifest comment) — confirm, open question 7
title = "Lingo"
version = "0.1.0"
icon = "@image/lingo-icon.png"

[os.version]
min = "1.2"
target = "1.2"

[components]
[[components.interactive]]
id = "dev.moizp.lingo.main"
runtime-module = "/com.amazon.kepler.runtime.react_native_kepler_4@IReactNativeKepler_0"
launch-type = "singleton"
categories = ["com.amazon.category.main", "com.amazon.category.kepler.media"]

[processes]
[[processes.group]]
component-ids = ["dev.moizp.lingo.main"]

[wants]
# copy the [[wants.service]] list of react-native-multi-tv-app-sample/apps/vega/manifest.toml (input, media server, media
# controls, audio, network, accessibility privilege) and leave a comment that LING-007 adds IAP / Content Launcher entries
```
`apps/vega/app.json` — `{ "name": "dev.moizp.lingo.main", "displayName": "Lingo" }` (name must equal the component id).
`apps/vega/index.js` — `AppRegistry.registerComponent(appName, () => App)` from `./app.json` and `./src/App` (sample shape; no `LogBox.ignoreAllLogs`).
`apps/vega/babel.config.js` — `presets: ['module:@react-native/babel-preset']` (no reanimated plugin: shared-ui does not use it).
`apps/vega/tsconfig.json` — extends `@react-native/typescript-config`, `types: ["@amazon-devices/react-native-kepler"]`, `include: ["src", "types"]`,
`paths: { "@lingo/shared-ui": ["./types/lingo-shared-ui.d.ts"] }`.
`apps/vega/types/lingo-shared-ui.d.ts` — declares only what the entry imports (`Root`, `RootProps`, `createRemoteBus`, `RawRemoteEvent`),
copied from `packages/shared-ui/src/index.tsx` and `remote/types.ts`. Reason: typechecking shared-ui's source against RN 0.83 types
would report tvos-only props (`nextFocus*`); shared-ui is typechecked in its own package. A comment says so.
`apps/vega/src/App.tsx` — the current `App.template.tsx` with `API_BASE_URL` from `./config` and `scale={1}`.
`apps/vega/metro.config.js` — merge of `metro.config.template.js`, the multi-tv sample config and apps/expo's kit rules:
```js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const fs = require('fs'), path = require('path')
const root = path.resolve(__dirname, '../..')
const sharedUi = path.join(root, 'packages/shared-ui')
const kitLink = path.join(sharedUi, 'node_modules/@moizp/vega-media-kit')
if (!fs.existsSync(kitLink)) throw new Error('metro.config.js: run `pnpm i` at the repo root first (shared-ui and the kit link resolve from there)')
const kit = fs.realpathSync(kitLink)
const app = (m) => path.join(__dirname, 'node_modules', m)
const singletons = { react: app('react'), 'react-native': app('react-native'), 'react-native-svg': app('@amazon-devices/react-native-svg') }
const vegaAdapterDir = path.join(kit, 'src/player/adapters') + path.sep
module.exports = mergeConfig(getDefaultConfig(__dirname), {
  watchFolders: [sharedUi, path.join(root, 'packages/contracts'), kit, path.join(root, 'node_modules')],
  resolver: {
    unstable_enableSymlinks: true,
    nodeModulesPaths: [path.join(__dirname, 'node_modules'), path.join(sharedUi, 'node_modules'), path.join(root, 'node_modules')],
    extraNodeModules: { '@lingo/shared-ui': sharedUi },
    resolveRequest: (ctx, name, platform) => {
      if (name === 'shaka-player' && ctx.originModulePath.startsWith(vegaAdapterDir)) return { type: 'empty' } // KIT-010 deferred; playback off on Vega (caps.playback)
      const base = Object.keys(singletons).find((s) => name === s || name.startsWith(`${s}/`))
      if (base) return ctx.resolveRequest(ctx, singletons[base] + name.slice(base.length), platform)
      return ctx.resolveRequest(ctx, name, platform)
    },
  },
})
```
(The implementer adapts the resolve trick if Metro 0.83 needs `originModulePath` pinning as in apps/expo instead; the bundle check in §3.5
decides.) Header comment cites the multi-tv sample config, the Expo monorepo guide and Metro `resolveRequest` docs, as apps/expo does.
`apps/vega/scripts/copy-fonts.mjs` — copies `packages/shared-ui/assets/fonts/*.ttf` to `apps/vega/assets/fonts/` (gitignored target).
`apps/vega/.gitignore` — `node_modules/`, `build/`, `assets/fonts/`, `.kepler/`.
`apps/vega/assets/image/lingo-icon.png` — placeholder generated with ffmpeg (`ffmpeg -f lavfi -i color=c=0x0F151B:s=512x512 -frames:v 1 …`;
ground colour from tokens). Icon size requirements: **verify** in the Vega manifest docs; the human replaces the art.
`apps/vega/README.md` — rewrite: status line "Experimental: built and checked without the Vega SDK; not run on a Vega device (Gate B,
kit decision 0001). Video playback is off on Vega until the kit's Vega adapter is rewritten (KIT-010)."; the npm-not-pnpm note; setup
commands; the static and bundle checks; the VVD checklist (§3.6) or a link to it.

Root changes: `pnpm-workspace.yaml` `- '!apps/vega'`; root `package.json` `"check:vega": "node scripts/check-vega.mjs"` and devDependency
`smol-toml` (MIT, TOML parser; Node 22 has none); `.github/workflows/ci.yml` step `- run: pnpm check:vega` after `pnpm lint:words`.

### 3.4 shared-ui change (coordinate with the LING-005 owner before editing; additive)

- `platformCaps.ts`: `Caps` gains `playback: boolean`; `capsFor('kepler' | 'vega')` → `playback: false`; others `true`. Update the doc comment
  ("KIT-010: the kit's Vega adapter does not play video yet; flip when it does").
- `Player.tsx`: when `!caps.playback`, render a `Screen` with one body line and a focusable Back action instead of `KitPlayer`; string in
  `strings.ts`: `playbackUnavailable: 'Video plays on Fire TV with Fire OS for now. Vega support is experimental.'` (passes `pnpm lint:words`).
- Tests: extend `test/caps.test.ts` — it('kepler has playback false'); extend `test/render.test.tsx` — it('Player shows the playback message
  and no KitPlayer when caps.playback is false').

### 3.5 What can be checked without the Vega SDK (acceptance for WP-B)

1. `pnpm check:vega` (CI) — `scripts/check-vega.mjs` exits non-zero with a list of failures:
   - `manifest.toml` parses; `schema-version = 1`; `package.id`, `title`, `version`, `icon` present; the icon file exists under `assets/image/`;
   - exactly one interactive component; its id === `app.json.name` === `${package.id}.main`; `processes.group[0].component-ids` contains it;
   - `runtime-module` matches the RN track of `package.json` (`0.83.x` → `react_native_kepler_4@IReactNativeKepler_0`; `0.72.x` → `loader_2@IKeplerScript_2_0`);
   - `package.json` `react` satisfies the `react-native-kepler` peer for that track (19.2.x / 18.2.0) — table in the script, citing npm;
   - `kepler.projectType === 'application'`, `targets` includes `tv`;
   - `index.js` imports `./app.json` and registers `appName`;
   - `src/**/*.tsx` imports only from: `react`, `react-native`, `@lingo/shared-ui`, `@amazon-devices/react-native-kepler`, `./*`;
   - `pnpm-workspace.yaml` excludes `apps/vega`.
   Test it with two fixture directories (one valid, one with each failure) in `scripts/check-vega.test.mjs` run by `node --test`
   (wire `node --test scripts/` into the root `test` script only if it does not disturb turbo; otherwise run it from `check:vega`).
2. `cd apps/vega && npm install` (public npm; no SDK) — record whether it succeeds and how long it takes; commit `package-lock.json`.
3. `cd apps/vega && npx tsc --noEmit` — the entry typechecks against kepler 4.0.1 types.
4. `cd apps/vega && npm run bundle:check` — Metro bundles `index.js` for `--platform kepler` with shared-ui, the kit and the Shaka stub.
   This may fail without the SDK if the CLI platform plugin needs SDK tools; if so, record the exact error in the PR and in the Vega
   friction log (N5) and continue — it is not a blocker. If `kepler` is not a known platform, try `--platform android` once to at least
   prove resolution, and say which was used.
5. `pnpm typecheck && pnpm test && pnpm lint:words` at the root still green (apps/vega excluded from turbo).

### 3.6 VVD checklist (human, on the Mac; Vega SDK 0.24; record each result)

| # | Step | Expected | Record |
|---|---|---|---|
| 0 | Install Vega SDK 0.24 per https://developer.amazon.com/docs/vega/0.23/install-vega-sdk.html (Rosetta 2 on Apple Silicon); `vega --version` | version prints | SDK version, disk used, minutes (friction log N5) |
| 1 | In a temp dir: `vega project create` (exact flags per the SDK doc; hello-world template) | a project is generated | its `react-native`, `react`, `react-native-kepler`, runtime-module; diff its package.json / manifest.toml / metro / babel against apps/vega and reconcile (track choice, open question 1) |
| 2 | Repo root `pnpm i`; `cd apps/vega && npm install` | no errors | warnings worth noting |
| 3 | `npm run build:release` | `build/<arch>-release/lingo_<arch>.vpkg` (file name derived from `kepler.appName`; record the real one) | path, size, minutes |
| 4 | `vega virtual-device start`; `vega run-app build/aarch64-release/lingo_aarch64.vpkg` (x86_64 on Intel) | app launches, Home renders in Noto Sans on the dark ground | photo/screenshot |
| 5 | Set `src/config.ts` to the API host as seen from the VVD (find the route: host LAN IP first) and `pnpm api` on the host | catalog loads | the address that worked |
| 6 | D-pad around Home, rail, cards | focus = outline + 1.04 scale, 150 ms; Back works | pass/fail per item |
| 7 | Pair screen | QR renders (react-native-svg alias) and the phone joins over websocket | pass/fail |
| 8 | Open a clip | playback-unavailable message, no crash; Back returns | pass/fail |
| 9 | Quiz (TV) | options focus, correct/incorrect states | pass/fail |
| 10 | Spike S2 questions (a)–(e), docs/plans/LING-003.md §Spikes (TVEventHandler events and repeats, chip focus, `playbackRate`, preferred focus after remount, FF/Rewind names) | as written there | logs |
| 11 | Logs | app logs visible (command per the SDK docs; the plan does not know it) | the command used |

Afterwards: fill the Vega column of `../vega-media-kit/docs/device-matrix.md` rows that apply, the Gate B line in docs/decisions/0001,
and friction logs for anything that differed from the docs. A clean run reopens kit Gate B and un-defers KIT-010 (kit decision 0001).

---

## 4. WP-C — Fonts (polish named in docs/plans/LING-003.md Risks: "text falls back to the system font until LING-008")

- Add static TTFs: `NotoSans-Regular.ttf`, `NotoSans-SemiBold.ttf` (Noto Sans, OFL 1.1 — https://github.com/notofonts/latin-greek-cyrillic
  releases, or Google Fonts), `Manrope-ExtraBold.ttf` (OFL 1.1 — https://github.com/sharanda/manrope static fonts; Google Fonts ships only
  the variable file). File basenames must equal the families in `packages/shared-ui/src/theme/tokens.ts` (`NotoSans-Regular`,
  `NotoSans-SemiBold`, `Manrope-ExtraBold`). Commit the OFL texts next to them; record sha256 + source URL in a `README.md` in that folder.
- Fire OS: `apps/expo/app.json` `["expo-font", { "fonts": ["../../packages/shared-ui/assets/fonts/NotoSans-Regular.ttf", …] }]`
  (config plugin embeds them at prebuild: https://docs.expo.dev/versions/latest/sdk/font/). Needs `EXPO_TV=1 npx expo prebuild --clean`.
- Vega: `copy-fonts.mjs` (§3.3) → `apps/vega/assets/fonts/`.
- Phone: same change in `apps/phone/app.json` — LING-006 owns that file; hand it over as a note, do not edit.
- README credits: "Fonts: Noto Sans and Manrope, SIL Open Font License 1.1".
- Known gaps to record, not fix here: Noto Sans (Latin/Greek/Cyrillic) has no Arabic glyphs; an `ar` native line needs Noto Sans Arabic
  (open question 3). `tokens.ts` pairs `NotoSans-SemiBold` with `fontWeight: '700'`; Android may synthesise bold on top — a design-QA
  check (§7), not a token change in this WP.
- Acceptance: files present, plugin configured, `EXPO_TV=1 npx expo export --platform android` (JS-only check from apps/expo/README.md)
  succeeds, and the human sees Noto Sans on the stick (design QA row "type").

---

## 5. WP-D — Docs

Rules for all four files: engineers writing to engineers; every claim has a source in the repo (file, decision, friction log, spot-check
sheet, device matrix) or says **TBD by human**; features owned by LING-005/006/007 appear as placeholders
`<!-- LING-00x: fill when merged -->` plus a "pending" status, never as done.

### 5.1 README.md

Sections, in order:
1. Title + one-paragraph pitch (keep the current one; add "Vega OS: experimental" after "on Fire TV").
2. **Status** table: Fire OS app (Player done in LING-003, device spike S1 pending → "pending" until the human records S1); Vega
   (experimental, §3); pipeline (Gate A passed; Gate C state from docs/decisions/0001 at the time of writing); phone (LING-006
   placeholder); IAP + Content Launcher + Personalization + Media Controls (LING-007 placeholder, each with a "screenshot or log" slot —
   runbook DoD); clips (N of 12 published, from `work/batch-report.md`).
3. **Run it (10 steps)** — each step one line of commands, verified in a fresh clone by the implementer except steps marked (device)/(AWS):
   1. Prerequisites: Node 22 (`.nvmrc`), pnpm 9.15.9 via corepack, Docker, Python 3; clone `lingo` and `vega-media-kit` side by side;
      `cd vega-media-kit && pnpm i && pnpm build`.
   2. `cd lingo && pnpm i && pnpm db:generate`.
   3. `cp .env.example .env && pnpm db:up && pnpm db:migrate`.
   4. `python3 -m venv .venv-lemma && .venv-lemma/bin/pip install simplemma==2.0.0` then `pnpm typecheck && pnpm test && pnpm lint:words`.
   5. Pipeline without AWS: `pnpm pipeline prepare --clip demo-de --source s3://unused --lang de --native en --fixture --no-publish` → `work/demo-de/`.
   6. `pnpm api` (http://localhost:4000/health) — clip import placeholder `<!-- LING-005 -->`.
   7. (device) Fire OS: `cd apps/expo && EXPO_TV=1 npx expo prebuild --clean && EXPO_PUBLIC_API_URL=http://<lan-ip>:4000 pnpm --filter @lingo/expo android` with the stick on `adb connect <ip>`.
   8. (device) Phone: `pnpm --filter @lingo/phone start` — placeholder `<!-- LING-006: EAS build / dev client -->`.
   9. (device) Vega, experimental: apps/vega/README.md.
   10. (AWS) Real clips: deploy `pnpm --filter @lingo/infra exec cdk deploy lingo-media-dev --exclusively`, then `pnpm pipeline batch content/clips.json --dry-run` and §2.9; costs in docs/aws.md. IAP sandbox: placeholder `<!-- LING-007 -->`.
4. **Architecture** — ASCII diagram (renders everywhere), updated from the current one: TV (apps/expo Fire OS · apps/vega experimental) →
   shared-ui → vega-media-kit; phone; api (Express, Prisma/Postgres, pg-boss, Socket.IO); pipeline steps with services and regions
   (Transcribe + Translate + S3 in eu-central-1, Bedrock Nova Lite in us-east-1 via `us.` profile, CloudFront); infra (CDK, two stacks).
   Mark Polly, IAP/RVS, Content Launcher as "LING-00x" placeholders.
5. **What's new since Aug 31, 2026** — "Everything. The repository was created on 2026-09-14 (first commit `3f87a00`), during the
   hackathon window; so was `@moizp/vega-media-kit`." Then a dated list from `git log` (one line per ticket: LING-004 2026-09-18;
   LING-001 Gate A 2026-10-02; LING-002, LING-003 code 2026-10-01/02; LING-005–009 placeholders).
6. **Built with Amazon and AWS** — two lines linking docs/aws.md and docs/feedback.md; friction log count and link.
7. **Licences** — code MIT (LICENSE); frequency and name lists CC BY-SA 4.0 (packages/pipeline/data/README.md); fonts OFL 1.1; clips per
   clip (content/clips.json, docs/content.md), shown in-app under About & attributions (LING-005 placeholder).

Acceptance: ≤ 10 numbered setup steps; every non-device, non-AWS command run once in a fresh clone (`git clone` to a temp dir + sibling
kit) with results noted in the PR; links resolve (`grep -o '](docs/[^)]*)' README.md` → files exist).

### 5.2 docs/aws.md — every call, purpose, cost

Rewrite the top table as one row per **call**, with columns: Service · API / command · Code · Region · When · Purpose · Approx. cost.

| Service | Call | Code | When |
|---|---|---|---|
| S3 | `aws s3 cp <cut> s3://$S3_BUCKET_MEDIA/clips/<slug>.mp4` | batch `upload` stage | once per clip |
| S3 | `aws s3 cp <source> work/<slug>/source.*` | `steps/normalize.ts` | each prepare without `--reuse`/`--cues` |
| Transcribe | `StartTranscriptionJob` (de-DE/en-US, `ShowSpeakerLabels`, `MaxSpeakerLabels: 6`), `GetTranscriptionJob` every 5 s (≤ 30 min), HTTPS GET of `TranscriptFileUri` | `steps/transcribe.ts` | once per clip (reused afterwards) |
| Translate | `TranslateText` per cue × native, `Settings.Brevity ON`, `Formality` for supported targets; two-speaker cues per line; spelled letters not sent | `steps/translate.ts` | every prepare (draft and final) |
| Bedrock | `Converse`, forced tool use, `us.amazon.nova-lite-v1:0`, us-east-1; one per highlight (gloss) + one per clip (quiz plan); file cache | `src/ai/*` | final phase and spot checks; cached repeats free |
| S3 | `aws s3 sync` HLS + `cp` master, VTTs, clip.json | `steps/publish.ts` | final phase |
| S3 | `aws s3 cp poster.jpg` | batch `publish-extra` | final phase |
| CloudFront | serves `published/*` from the media bucket (OAC, HTTPS only, PriceClass 100) | `infra/lib/media-stack.ts` | app playback |
| CloudFormation via CDK | `lingo-media-dev` (eu-central-1); `lingo-nova-dev` (us-east-1) | `infra/` | deploys |
| IAM | `PipelineRole` (assumable by the account; S3, Transcribe, Translate, Polly, Bedrock) | `media-stack.ts` | defined; whether the pipeline runs under it is **TBD by human** (the root-keys friction log says deploys ran as root) |

Then: "Declared but not called by Lingo today": `@aws-sdk/client-polly` (planned "tap to hear" pronunciation — placeholder LING-005/006);
`lingo-nova-dev` bucket and `NOVA_PRO_MODEL_ID`/`S3_BUCKET_NOVA_INGEST` (Nova Pro video ingest, a Described pattern; no Lingo code reads
them — open question 8). Amazon Appstore RVS (`POST /iap/verify`): placeholder LING-007.
Then: per-clip cost formula and the 12-clip estimate from §2.11, labelled unverified, with the pricing URLs; an "Actual spend" line the
human fills after Phase 2 (sum of `clip.json.cost.usd`, Transcribe minutes from the batch report, and Cost Explorer for the month — TBD).
Then: data flow note (subtitle text of CC/PD clips goes to us-east-1 for Bedrock; EU switch = `BEDROCK_REGION=eu-central-1` +
`NOVA_LITE_MODEL_ID=eu.amazon.nova-lite-v1:0`, docs/plans/LING-002.md), the bucket naming note (`lingo-media-<stage>-<account>`; fix
`.env.example`'s `S3_BUCKET_MEDIA=lingo-media-dev` comment accordingly; write `<account>` in docs rather than the number), keep the
Sources and Bedrock sections as they are. Move "Dev tooling: Claude Code, Kiro Crew, Amazon Devices Builder Tools MCP" under a
"Tooling" heading and keep only what the human confirms was used (**TBD by human**; the repo records Claude Code only).

### 5.3 docs/feedback.md — the five answers (drafts from the record; the human edits and signs off)

1. **Tools, APIs and SDKs used, and why** — one line each, from docs/aws.md and the code: Amazon Transcribe (word timestamps + speaker
   labels for cues), Amazon Translate (native line, Formality/Brevity), Amazon Bedrock Nova Lite via Converse (glosses, quiz plans), S3 +
   CloudFront (HLS delivery), AWS CDK (two-region infra); Fire OS on the Fire TV Stick via Expo SDK 54 + react-native-tvos 0.81
   (Amazon's multi-TV sample pattern); Vega SDK docs, `@amazon-devices/react-native-kepler`, w3cmedia (read and planned against;
   experimental, §3); Amazon Appstore IAP + App Tester, Content Launcher, Personalization, Media Controls (placeholders LING-007);
   third party: Shaka Packager, ffmpeg, simplemma, react-native-video (ExoPlayer), Socket.IO. Polly: list only if LING-005/006 ships it.
2. **What worked well** — only measured or recorded facts:
   - Transcribe's batch output (word timings, punctuation items, `speaker_label` on every item) was precise enough to build 42×2 / 20 cps
     cues; Gate A passed on two real clips (terra-x-friedlaender: 54 cues, 0 gate findings) — docs/decisions/0001, 0007.
   - Translate's `Formality` and `Brevity` settings are documented with exact language-pair tables; one setting removed `du`/`Sie` drift —
     decision 0008 §11, friction log `translate-per-cue-register…`.
   - Bedrock Converse with forced tool use and Zod validation: the first real Gate C run cost $0.0024 for 37 calls —
     docs/spot-checks/2026-10-02-gate-c.md. (Quality is answer 3, not here.)
   - Fire OS via the shared kit on the Fire TV Stick (AFTSS, Fire OS 7.7.1.6): own HLS from CloudFront, two text tracks at once, seek to a
     cue start with the first cue 10 ms later, 0.75× measured 15.43 s of media in 20.18 s wall — ../vega-media-kit/docs/device-matrix.md
     (Described's package; Lingo's own stick run is S1 — add it when recorded).
   - CDK: two stacks in two regions from one app; the media stack deployed (friction log `cdk-deploy-as-root…` notes the caveat).
   - Amazon's two sample repos gave working project shapes for both OSes (multi-TV sample, vega-video-sample).
3. **What needs improvement** — one bullet per friction log, linked (§6 list), grouped Vega / Fire OS / AWS AI services / AWS infra /
   third party. Include Gate C quality only once the human has scored it (§6.2 N8).
4. **Onboarding quality** — "Time from zero to first app on device: **TBD by human** hours." Facts to place around it: repo created
   2026-09-14; first Fire OS playback on the stick via the kit 2026-09-26 (device matrix); the Vega SDK was not installed (Gate B,
   2026-09-26) — say why in one sentence from kit decision 0001; if the VVD run in §3.6 happens, add its hours.
5. **Would you build with these tools again?** — **TBD by human** (Yes/No is the human's call). Offer the record the rationale can
   draw on: AWS AI services were cheap and documented, with quality work needed around Transcribe punctuation and Nova glosses; Fire OS
   worked through community react-native-tvos; Vega's version story and SDK size kept it experimental.

### 5.4 docs/feature-requests.md — with priorities

Priority scale (write it at the top): **P1** blocked a feature or cost a planning/implementation cycle; **P2** cost hours, workaround
exists; **P3** papercut. Columns: Priority · Platform · Request · Why (link to friction log). Rows (derived from the logs' Suggestion
fields; add rows for new logs as they land):

| P | Platform | Request | From |
|---|---|---|---|
| P1 | Vega | Publish one version matrix (SDK ↔ RN for Vega ↔ `react-native-kepler` ↔ React ↔ runtime-module) and name the default for new projects; align the samples | N1 |
| P1 | Vega | `playbackRate` on `@amazon-devices/react-native-w3cmedia` | `vega-playbackrate-…` |
| P1 | Vega | Shaka Player for Vega as an installable package instead of a postinstall that clones v4.8.5 and applies a 44-patch series | N4 |
| P1 | Vega | A way to typecheck and bundle a Vega app in CI without the full SDK | N5 |
| P1 | AWS Transcribe | Mark disfluency stops vs sentence ends (or a punctuation confidence); option to suppress non-speech tokens | `transcribe-punctuation-…` |
| P1 | AWS Translate | A context field (untranslated neighbouring segments) for subtitle translation; keep-as-is pattern for spelled letters | `translate-per-cue-…` |
| P2 | Vega | `useTVEventHandler` option to consume a key; `BackHandler` events while a `Modal` is open | `vega-playbackrate-…` |
| P2 | Fire OS | Starter on react-native-tvos + `@react-native-tvos/config-tv`, or a doc line that plain RN gets no media keys | `fire-os-expo-template-…` |
| P2 | Fire OS | A documented way to take a screenshot of the Fire TV Stick screen (adb screencap returns black) | N2 |
| P2 | Bedrock / Nova | Structured outputs for Nova Lite; one temperature minimum across the tool-use and request-schema pages; current lifecycle date on the Nova Lite v1 card | `bedrock-nova-lite-…` |
| P2 | AWS CDK | Fail (or require `--force`) when deploying as root; require a stack selector with `--require-approval never` in multi-stack apps | two CDK logs |
| P3 | Shaka Packager | INFO logging off by default for non-interactive use | `shaka-packager-…` |
| P3 | pnpm | Document that `link:` overrides resolve from the workspace root (breaks in worktrees) | `pnpm-worktrees-…` |

### 5.5 docs/friction/README.md

Add an index table (date · title · platform · severity · file) of every log, regenerated by hand when logs are added, and the line
"Format: the hackathon rules' fields (Task attempted, Steps, Expected, Actual, Severity, Workaround, Suggestion, Environment) plus Links."

---

## 6. WP-E — Friction logs

### 6.1 Audit of the 10 existing logs (2026-10-01)

All ten have the required fields. Count already meets "≥ 8". Edits allowed: fix the slug-style `#` titles into sentence titles (e.g.
"# Bedrock Nova Lite: temperature, structured outputs and lifecycle unclear") and add the platform to each Environment line. Do not
change facts. Note for feedback.md: three of the ten are not Amazon/AWS tools (pnpm worktrees, VOA source page, ffmpeg/Shaka Packager
output); keep them, but list the Amazon/AWS ones first.

### 6.2 New logs — real incidents with evidence in the repo or verified today

Create each with `pnpm friction "<title>"`, fill every field, cite the evidence in Links. Where only the human knows a value (minutes
lost, exact device behaviour), write **TBD by human**. Before writing N2–N4, check `../described/docs/friction` (not in this sandbox)
for the same incident; if Described already filed it, link it instead of duplicating.

| id | Title | Evidence | Facts for "Actual" | Write now? |
|---|---|---|---|---|
| N1 | Vega: which React Native version? Docs, npm and Amazon's samples disagree | npm view of `@amazon-devices/react-native-kepler` (latest 4.0.1 → peer react ^19.2.0; 2.1.0 → react 18.2.0 + RN 0.72.0; dist-tags `rn83-alpha`, `rn83-alpha-old`); multi-TV sample vega app (RN 0.72, runtime loader_2) vs vega-video-sample (RN 0.83, runtime react_native_kepler_4); docs/plans/LING-003.md S2 ("docs say RN for Vega 0.72 … typings labelled rn0.83"); runbook "0.83 is early-access" | the RN line, React version, runtime-module and svg package line all change together; the monorepo React override (19.1.0) fits neither | yes (Severity Medium; minutes TBD by human) |
| N2 | Fire TV Stick: `adb screencap` returns a black image | ../vega-media-kit/docs/decisions/0001 consequence 6 and device-matrix footnote ("screencap is black on this stick"; evidence is photos) | AFTSS, Fire OS 7.7.1.6; whether UI-only screens are also black: TBD by human | yes |
| N3 | Fire OS: react-native-video needed `useExoplayerHls=true` and a native rebuild; the multi-TV sample ships it off | device-matrix Playback row | as recorded there | yes, unless Described filed it |
| N4 | Vega: Shaka is a postinstall build of a patched fork, and `VideoPlayer` is a class, not a component | ../vega-media-kit/docs/decisions/0002 (Shaka v4.8.5, 44 patch files numbered 0001–0045 without 0016, `build/all.py`; `KeplerVideoSurfaceView` + `setSurfaceHandle`) | the kit's adapter was written to the wrong shape and must be rewritten (KIT-010) | yes, unless Described filed it |
| N5 | Vega: no way to build, typecheck or bundle without the full SDK; SDK footprint pushed Vega to experimental | kit decision 0001 Gate B (human chose not to spend the ~20 GB install with the kill date close); this ticket's §3.5 results | append the §3.5 results (npm install / tsc / bundle outcome) | after WP-B §3.5 runs |
| N6 | react-native-tvos 0.81.5-2: TV APIs missing from `react-native` types under TypeScript | `pnpm --filter @lingo/expo typecheck` → `RemoteBridge.tsx(2,10): error TS2305: Module '"react-native"' has no exported member 'useTVEventHandler'` (and `HWEvent`); `node_modules/react-native/types/index.d.ts:161` `export * from './public/ReactNativeTVTypes'`, whose content is a `declare module 'react-native'` augmentation; tsconfig `moduleResolution: Bundler` | CI typecheck red since LING-003 G3 (known baseline); Workaround: TBD (not fixed) | yes |
| N7 | Nova Lite glosses describe the phrase, not the word, on the first Gate C run | docs/spot-checks/2026-10-02-gate-c.md rows: `tennis` → "Tennisschläger", `swell` → "eine tolle Frau" with grammar "Komparativ besser", `Eiserne` → "Iron Cross (military decoration)", `angeguckt` grammar "angegucken", ASR `sal` glossed "der Sal"; 0001 Gate C "en ≈ 6/15 provisionally, NOT passing" | wait for the human's scores and the LING-002 fix, then record both | **conditional** (after Gate C scoring) |
| N8 | Fire OS: long press needs `ReactFeatureFlags.enableKeyDownEvents`, set by a custom config plugin | decision 0006 §3; apps/expo/plugins/withKeyDownEvents.js; S1 checklist | key-up only by default; result on the stick: S1 | **conditional** (after S1) |
| — | S1 result (Fire OS remote and chip focus) | docs/spikes/S1-fire-os-remote.md says to log it either way | — | owned by the LING-003 spike, not LING-008 |
| — | IAP sandbox / App Tester / RVS, Content Launcher, Personalization, Media Controls | — | — | owned by LING-007 |

Not to be turned into friction logs: content-source issues (docs/content.md §7 says they stay there by decision); our own process
items (unverified prices, sandbox egress limits).

Acceptance: N1, N2, N4 (or links to Described's), N6 written now → 13–14 logs; N3/N5/N7/N8 follow their triggers. Every new log passes a
reviewer check that each sentence in Actual is backed by a cited file, command output or URL.

---

## 7. WP-F — Design QA screenshot procedure (`docs/design-qa/README.md` + `TEMPLATE.md`)

When: after LING-005/006/007 merge and before the Oct 15 freeze; repeat for screens changed by fixes. Owner of capture: the human.

Capture, in this order of preference (the stick's `adb screencap` is reported black — N2):
1. **Fire TV Stick**: try `adb exec-out screencap -p > shot.png` once per session on a UI-only screen; if it is black, fall back.
2. **Android TV emulator** running the same Fire OS APK: AVD "Television (1080p)", Android 9 / API 28 (Fire OS 7 is Android 9),
   `adb -s emulator-5554 exec-out screencap -p > tv-<screen>-<state>.png` (https://developer.android.com/tools/adb). Pixel-exact for layout
   and colour; label the sheet "emulator" — it is not device evidence.
3. **Photo on a tripod** of the TV for device evidence (also video B-roll).
4. **Vega**: VVD window (method from VVD step 11; TBD).
5. **Phone**: `adb exec-out screencap -p` (Android) or the OS screenshot.

Files: `docs/design-qa/2026-10-<dd>/<platform>-<screen>-<state>.png` (platform = `fireos`, `emu`, `vega`, `phone`); keep each ≤ 400 KB
(`ffmpeg -i in.png -compression_level 9 out.png`, or JPEG q 85 for photos); total ≤ 15 MB per round.

Screen × state matrix (from the plan §8/§9; rows for LING-005/006/007 screens are filled when those land):
- TV: First run P1–P4 (incl. "phone connected"); Home (loaded with focus on hero Watch; rail open; skeleton; offline; Continue hidden when
  empty); Clip (normal; "Preparing subtitles"); Player (playing with dual cue + marker; Challenge mode with Menu reveal; status line;
  settings sheet; auto-pause bar); Explain (focus on Save; focus on a word chip; saved; 20/day limit); Summary (words; no words); Quiz TV
  (question; correct; incorrect); Words (list; empty; each filter); Settings; Lingo Plus; About & attributions; Vega playback message.
- Phone: Join; Live (chips; "Quiz me now"); Quiz (front; back with four grades); Progress; Welcome back.

Per-screenshot checks (sheet columns, pass/fail + note):
1. Target cue bright `#EFF1EE` above-size, native cue `#9FC9D8` smaller and above it; ≤ 2 lines each.
2. Marker `#E3C77A` only on words to learn, dark text on it; never on buttons or errors.
3. Exactly one focused element; focus = 4 px off-white outline, 3 px offset, visible scale (words in a cue: 3 px outline, no scale).
4. No pure white: eyedropper on the brightest text reads `#EFF1EE`, not `#FFFFFF`.
5. Safe zone: nothing interactive or textual within 96 px (left/right) and 54 px (top/bottom) of a 1920×1080 frame (5 %, kit defaults).
6. Smallest text ≥ 24 px at 1080p (label token 28 px); type is Noto Sans (display Manrope); no synthetic-bold look on SemiBold (§4).
7. State never by colour alone (quiz correct has a check; incorrect shows the right answer; level chips use surface-2, not colour per level).
8. Wording: "Welcome back", no "wrong"/"failed", levels say "approximate" where shown.
9. Empty/error/offline state designed (text present, focus lands somewhere).
VoiceView/TalkBack (not a screenshot): per screen, the spoken label of the focused element is a purpose ("Save word: warten"); record text.

Findings: one line per failure in the sheet with the owning ticket; the orchestrator files them in TASKS.md; fix before freeze.
The same captures feed the README platform-integration slots and the video (LING-009).

---

## 8. Separate items noted, not taken over

1. **Gate C** (LING-002): prompt fixes in progress; human scores the de rows; Phase 2 of the batch waits for `gateC: passed`.
2. **Highlight dictionary check** (TASKS LING-001 follow-up): ASR errors such as `sal` reach highlights. Until fixed, the batch report's
   `review: rare highlight` list is the human's backstop; suggest a ticket that drops highlights whose lemma simplemma does not know and
   that have no frequency rank (decision needed by LING-001's owner).
3. **Segmenter on fast acted dialogue** (TASKS LING-001 follow-up; Gate A en clip needed `--cues`): expect manual `--cues` passes for
   rows 7–11; the batch makes that loop cheap but does not fix the segmenter.
4. **Learner-band filter in `GET /clips/:slug`** (TASKS LING-005 follow-up, decision 0007 M5).
5. **Clip import into Postgres** (title/licence/attribution from content/clips.json + clip.json + poster key) — owner to be named (open question 6).
6. **Fonts on the phone** (`apps/phone/app.json`) — LING-006.
7. **Kit friction index** (`../vega-media-kit/docs/friction.md` "add links as they land") — link N1/N2/N4 there in a kit PR (kit repo, not this ticket).

---

## 9. Acceptance checks (LING-008 done when)

- WP-A: §2.10 tests pass; offline `--dry-run` output as in §2.10; the human's Phase 1 report exists; after Gate C, Phase 2 published
  ≥ 8 clips (PLAN §14: 12 target, 8 acceptable) and `curl -sI …/master.m3u8` returns 200 for each.
- WP-B: `pnpm check:vega` green in CI; §3.5 items 2–4 attempted with results in the PR; VVD checklist present in apps/vega/README.md;
  shared-ui caps/render tests pass.
- WP-C: fonts committed with licences; expo-font configured; JS export check passes.
- WP-D: README ≤ 10 steps verified in a fresh clone; aws.md lists every call in §5.2 with cost and placeholders; feedback.md has all five
  answers with sources and TBDs; feature-requests.md has priorities and links.
- WP-E: ≥ 8 logs in the rules' format (already 10; target 13–14 with N1, N2, N4, N6), index table updated.
- WP-F: procedure and template committed; first capture round recorded by the human before Oct 15.
- Root `pnpm typecheck && pnpm test && pnpm lint:words` green apart from the known baseline (§0).

## 10. Manual steps (human only)

1. §2.9 Phase 0–2 (AWS spend ≈ $3–6, §2.11), including the corrected Gate A VTT copy, row 6 attribution, `verifiedOn` dates, segment confirmation.
2. §3.6 VVD checklist (SDK install) — or decide to skip it and keep "experimental" wording.
3. Fire OS prebuild after the font change; design QA capture round (§7).
4. Fill every **TBD by human** in feedback.md, aws.md (actual spend, tooling used), friction logs (minutes, device details).
5. Flip `gateC` in content/clips.json when docs/decisions/0001 records Gate C passing.

## 11. Risks

- **Gate C may not pass before Oct 15.** Then Phase 2 cannot run with honest glosses. Fallback options for the human: publish Phase-1
  outputs (`--no-ai` cues + highlights, no glosses/quiz) so the Player and dual cues work, and show the Explain card without a gloss —
  needs a decision and LING-005 support (open question 5).
- **Manual `--cues` effort** for acted dialogue (rows 7–11): unknown minutes each; start Phase 1 early.
- **`no highlights`** on easy English clips (as VOA lesson 1 did): swap from the reserve; keeps the count at 12.
- **Downloads**: row 1 is 800 MB; Commons/IA can be slow; the runner resumes.
- **Licence drift / content register errors** (row 11's shifted columns, row 6's cut credit): the manifest validation and `verify` stage
  catch them; content.md stays the source of truth.
- **Vega unverified end to end**: every Vega file is written blind; the RN track may differ from what SDK 0.24 generates; Metro config
  for a pnpm-linked shared package under an npm app may need iteration; `react-native-svg` mapping untested. Vega stays "experimental";
  playback is off there by design until KIT-010.
- **React override**: if the human prefers apps/vega inside the pnpm workspace, the root `react` override must become per-app, which
  touches Fire OS and phone installs — out of scope unless chosen (open question 2).
- **NOTE blocks and Shaka Packager**: untested here (§2.8).
- **Fonts**: Arabic needs another family; SemiBold + weight 700 may render too heavy on Android.
- **Screenshots**: stick capture may be impossible (N2); emulator captures are not device evidence.
- **Prices unverified**: estimates could be off by the regional difference; still far below the $10 escalation line.
- **Ownership overlap**: shared-ui caps change touches Player (LING-003 code) while LING-005 edits shared-ui; keep the change small and
  agree it first. README/aws.md must not describe LING-005/006/007 features as done.

## 12. Open questions (defaults chosen so work is not blocked)

1. Vega RN track: 0.83 (default) or 0.72? Decide after VVD step 1 shows what `vega project create` generates.
2. apps/vega outside the pnpm workspace with npm (default) or inside with per-app React pins?
3. Natives per clip: one (default: en for German clips, de for English clips), or also tr/ar/uk for the integration-course story
   (+$2.85 Translate, and `ar` needs Noto Sans Arabic)?
4. Formality: openhpi row FORMAL (default per LING-001-quality §14); Terra X narrations and Blender/Coronet films INFORMAL — confirm.
5. If Gate C is not passing by Oct 13: ship `--no-ai` clips, delay the freeze for content, or drop to the clips that pass a spot check?
6. Who imports clips into Postgres (LING-005?), and is `published/<slug>/poster.jpg` the agreed `posterKey`?
7. Vega package id: reuse `dev.moizp.lingo` (default, for IAP continuity) — LING-007 to confirm.
8. `lingo-nova-dev` stack, `NOVA_PRO_MODEL_ID`, `S3_BUCKET_NOVA_INGEST` and `@aws-sdk/client-polly` are unused by Lingo: delete, or keep
   and document as unused? Was `lingo-nova-dev` deployed?
9. Were Kiro Crew and the Amazon Devices Builder Tools MCP actually used (docs/aws.md lists them)?
10. Where is the corrected `what-to-do-on-a-date-1950` VTT from Gate A, and may the corrected VTTs and Transcribe outputs of the 12
    clips be committed (BY-SA share-alike; earlier question in docs/plans/LING-001-quality.md §14)?
11. German-first demo vs the English-as-target fallback (docs/content.md §6 open question) — affects which clips get polish first.

## 13. Sources

Repo: files named inline. Amazon/AWS docs cited (not opened from this session; the egress proxy refused developer.amazon.com and
aws.amazon.com — the implementer or human opens them before relying on them):
- Vega SDK install: https://developer.amazon.com/docs/vega/0.23/install-vega-sdk.html
- Vega supported libraries: https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html
- Vega TVEventHandler: https://developer.amazon.com/docs/react-native-vega/0.72/using_tveventhandler.html
- Vega IAP: https://developer.amazon.com/docs/vega/0.22/appstore-integrations-overview.html
- Transcribe input/output formats: https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html
- Pricing: https://aws.amazon.com/transcribe/pricing/ · https://aws.amazon.com/translate/pricing/ · https://aws.amazon.com/bedrock/pricing/ · https://aws.amazon.com/s3/pricing/ · https://aws.amazon.com/cloudfront/pricing/
- CDK deploy options: https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-deploy.html
Read on 2026-10-01 (public npm registry and raw GitHub):
- https://www.npmjs.com/package/@amazon-devices/react-native-kepler (versions, dist-tags, peer deps via `npm view`)
- https://www.npmjs.com/package/@amazon-devices/react-native-svg · https://www.npmjs.com/package/@amazon-devices/kepler-cli-platform
- https://raw.githubusercontent.com/AmazonAppDev/react-native-multi-tv-app-sample/main/apps/vega/{package.json,metro.config.js,manifest.toml,babel.config.js,tsconfig.json,index.js,app.json}
- https://raw.githubusercontent.com/AmazonAppDev/vega-video-sample/main/{package.json,manifest.toml,metro.config.js,babel.config.js,tsconfig.json,index.js,app.json,README.md}
Other:
- Internet Archive metadata API: https://archive.org/developers/md-read.html · MediaWiki imageinfo/extmetadata: https://www.mediawiki.org/wiki/API:Imageinfo
- ffmpeg seeking: https://trac.ffmpeg.org/wiki/Seeking · adb screencap: https://developer.android.com/tools/adb
- Expo font config plugin: https://docs.expo.dev/versions/latest/sdk/font/ · Expo monorepos: https://docs.expo.dev/guides/monorepos/ · Metro resolution: https://metrobundler.dev/docs/resolution/
- Noto Sans: https://github.com/notofonts/latin-greek-cyrillic · Manrope: https://github.com/sharanda/manrope · OFL: https://openfontlicense.org

## 14. Implementation notes (2026-10-01, implementer session; orchestrator decisions applied)

Orchestrator decisions on §12: Vega RN 0.83 and apps/vega outside the pnpm workspace (open questions 1–2) — **pending human confirmation
after `vega project create`** (apps/vega/README.md "Decisions"); natives en and de only, tr/ar/uk a documented, costed option (docs/aws.md);
Gate C fallback left to the human (batch final-phase guard message, README status); unused AWS resources documented as "declared, not
used by Lingo" (docs/aws.md), nothing deleted; `caps.playback` only in `platformCaps.ts`.

Follow-ups for TASKS.md (the orchestrator files them; not implemented here):
- [ ] LING-005 (or new) · import processed clips into Postgres: Clip row from `content/clips.json` (title, license, attribution, sourceUrl)
  + `work/<slug>/clip.json` (level, cues, highlights, quiz, durationS, publishedBase) + poster key `published/<slug>/poster.jpg` (open question 6)
  - follow-up from LING-008: the Player renders a playback-unavailable message (and no `KitPlayer`) when `caps.playback === false`;
    string per §3.4; render test. Until then, opening a clip on Vega reaches the kit's Vega adapter without Shaka (VVD step 8).
  - follow-up from LING-008: make `Caps.playback` required once the Caps literals in shared-ui tests are updated (it is optional today to
    keep the change inside platformCaps.ts).
- [ ] LING-006 · fonts on the phone: the same `expo-font` plugin entry in `apps/phone/app.json` (`../../packages/shared-ui/assets/fonts/*.ttf`).

Deviations from §2–§4 (each deliberate, recorded here and in the commit messages):
- `cues` paths in the manifest resolve against the manifest's directory: `"cues": "cues/<slug>.<lang>.vtt"` (not `content/cues/…`), because
  `pnpm pipeline` runs inside packages/pipeline; the manifest path itself resolves from `INIT_CWD` (where the human typed it).
- A manifest problem tied to one clip blocks that clip only (others run); `--dry-run` lists the problems and still exits 0. Problems without
  a slug (duplicate slugs) stop a real run. `loadManifest` returns `{ manifest, problems }` instead of throwing on the documented TBD rows.
- `sourceS3` may contain the literal `$S3_BUCKET_MEDIA` (row 7), expanded from the environment, so no account number is committed.
- Row 10 `cosmos-laundromat` re-checks the **Commons** tag (`CC BY-SA 3.0`, the label) instead of archive.org (which says CC BY 4.0 and would
  never match the stricter label).
- Row 2 `openhpi-vandalismus` downloads from the Commons title in its Source URL; the register's direct URL does not match its md5 upload
  path (docs/content.md footnote `[^dl2]`). Not fetched from the sandbox (Commons and archive.org are unreachable here).
- Rows 3–5 use the Commons file page as the manual-check URL (the register has no per-clip schule.zdf.de URL for them); row 6 uses the
  zdf.de credit page. All four have `verifiedOn: null` until the human opens them.
- Resume markers: `_cuts/<slug>.uploaded`, `<slug>/.batch-<phase>.json` (prepare inputs + sha256 of the cues file, `--reuse` excluded),
  `<slug>/.poster-published`; a failed stage removes its half-written output.
- Dry run in this sandbox says "Transcribe will run for: 11 clips (62.6 min)": row 3's Gate A work dir exists only on the human's machine,
  where it is 10 clips (58.9 min) as planned.
- `smol-toml` is BSD-3-Clause (the plan said MIT).
- `check:vega` runs its own `node --test` file first, then the check; fixtures are generated from the committed apps/vega files in a temp dir.

§3.5 results (feed N5 when its trigger is met): npm install OK (771 packages, 34 s, 425 MB); `tsc` OK; `react-native bundle --platform kepler`
OK without the SDK (1 287 modules, one React 19.2.0, 90 s cold). So "typecheck and bundle without the SDK" works; the open part is building
the `.vpkg` and running. Friction logs written: N1, N2, N4, N6 (N6 records the fix in f67fd9e). N3, N5, N7, N8 stay on the trigger list.
