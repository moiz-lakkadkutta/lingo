# Corrected target cues

Hand-corrected target-language WebVTT files for `prepare --cues` (docs/decisions/0007), one per clip: `<slug>.<lang>.vtt`.
Reference one from `content/clips.json` as `"cues": "cues/<slug>.<lang>.vtt"` (paths in the manifest resolve against `content/`).

How a file gets here: the batch reports `gate: fail` for a clip → fix `packages/pipeline/work/<slug>/<lang>.vtt` in a subtitle
editor → copy it here → set `cues` → `pnpm pipeline batch content/clips.json --phase draft --only <slug>`.
Cue files of BY-SA clips are adaptations under the same licence (docs/content.md §5).
