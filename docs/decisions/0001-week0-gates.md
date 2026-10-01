# 0001 — Week-0 gates

Status: pending (fill in Sept 17)

- Gate A (media pipeline tests 1–6): PASSED 2026-10-02 — real Transcribe + Translate on two clips (feat/ling-001-pipeline de13b25, --reuse). terra-x-friedlaender (de→en): gate 0 findings, 54 cues, B1, 15 highlights. what-to-do-on-a-date-1950 (en→de): segmenter output fails 9 findings (fast acted dialogue); passes after a --cues retiming pass (0007 correction path): 122 cues, A2, 20 highlights. Decisions 0007, 0008.
- Gate B (Vega blocks > 1 day):
- Gate C (AI quality): pending — LING-002 spot check on the two REAL clips: terra-x-friedlaender (de → en) and the English clip (what-to-do-on-a-date-1950, swapped in for VOA 2026-10-02). 15 glosses each = 30, accept ≥ 27; quiz ≥ 90 % of items; ≥ 2 G5 fails = stop. Scored sheet: docs/spot-checks/LING-002-<date>.md. Prompt versions: gloss v2, quiz v1. First real run 2026-10-02 (Nova Lite v1, $0.0024, sheet docs/spot-checks/2026-10-02-gate-c.md): en rows provisionally ≈ 6/15 glosses and ≈ 7/10 quiz items — NOT passing; de rows await human scoring. Prompt/highlight fixes in progress.

Decision:
