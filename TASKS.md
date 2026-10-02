# Tickets (build order) — docs/PLAN.md §11

- [x] LING-001 · week 2 · Pipeline steps 1–6 on two clips (Transcribe → segment → Translate → lemmatize+rank → highlights) + segmenter fixtures — done 2026-10-02, Gate A in docs/decisions/0001; decisions 0003, 0004, 0007, 0008. Follow-ups: segmenter still fails fast acted dialogue without a --cues pass; highlights not checked against the dictionary (ASR 'sal' became a highlight).
- [ ] LING-002 · week 2 · Explanations + quiz generation (Nova Lite, Zod-validated JSON), caching, spot check 30
- [ ] LING-003 · week 2 · Player with dual cues + marker rendering + word focus; cue-wise seek; long-press replay; 0.75× — code done 2026-10-02 (decision 0006); waiting on device spikes S1 (docs/spikes/S1-fire-os-remote.md) and S2
- [x] LING-004 · week 3 · Socket.IO session (POST /sessions idempotent per TV, join validation, QR via react-native-svg, phone join/Live, word:saved < 1 s integration test) — done 2026-09-18, docs/decisions/0005. Explain-card anatomy + Save UI land with LING-003's Player rewrite.
- [ ] LING-005 · week 3 · Home, Clip, Summary, Quiz(TV), Words, Settings, First run (placement)
  - follow-up from LING-001 (docs/decisions/0007 M5): GET /clips/:slug returns only highlights with rank ≥ BANDS[NEXT[learner.level]][0] and builds wordsYoullMeet from that set; move BANDS/NEXT to @lingo/contracts; derive or drop Learner.knownRank
- [ ] LING-006 · week 3 · Phone app: Join (QR/code), Live, Quiz (SM-2 server-side), Progress; EAS build
  - follow-up from LING-004: resolve `learner()` from an `x-session-code` header so the phone's `GET /me/words?due=today` sees the TV's saved words (phone uses its own x-device-id today)
  - [ ] follow-up from the LING-006 review (M1): the session code is still a long-lived bearer credential for the phone's read and review routes. Rotate the code when the TV selects "Pair a new phone" (and on "Use another TV"), or have the socket `join` issue a per-phone token that `/me/*` accepts instead of the code. The per-IP miss limiter is in-memory (one API process); move it to a shared store before running more than one instance, and set `trust proxy` behind a load balancer so `req.ip` is the client.
- [ ] LING-007 · week 3 · IAP sandbox on both OSes; Content Launcher; Personalization; Media Controls
- [ ] LING-008 · week 4 · Twelve clips, Vega build, polish, docs, feedback, ≥ 8 friction logs · freeze Oct 15
- [ ] LING-009 · week 5 · Video (Save-word-to-phone moment with both screens in frame) + submission
