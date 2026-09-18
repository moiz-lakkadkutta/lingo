# Tickets (build order) — docs/PLAN.md §11

- [ ] LING-001 · week 2 · Pipeline steps 1–6 on two clips (Transcribe → segment → Translate → lemmatize+rank → highlights) + segmenter fixtures
- [ ] LING-002 · week 2 · Explanations + quiz generation (Nova Lite, Zod-validated JSON), caching, spot check 30
- [ ] LING-003 · week 2 · Player with dual cues + marker rendering + word focus; cue-wise seek; long-press replay; 0.75×
- [x] LING-004 · week 3 · Socket.IO session (POST /sessions idempotent per TV, join validation, QR via react-native-svg, phone join/Live, word:saved < 1 s integration test) — done 2026-09-18, docs/decisions/0005. Explain-card anatomy + Save UI land with LING-003's Player rewrite.
- [ ] LING-005 · week 3 · Home, Clip, Summary, Quiz(TV), Words, Settings, First run (placement)
- [ ] LING-006 · week 3 · Phone app: Join (QR/code), Live, Quiz (SM-2 server-side), Progress; EAS build
  - follow-up from LING-004: resolve `learner()` from an `x-session-code` header so the phone's `GET /me/words?due=today` sees the TV's saved words (phone uses its own x-device-id today)
- [ ] LING-007 · week 3 · IAP sandbox on both OSes; Content Launcher; Personalization; Media Controls
- [ ] LING-008 · week 4 · Twelve clips, Vega build, polish, docs, feedback, ≥ 8 friction logs · freeze Oct 15
- [ ] LING-009 · week 5 · Video (Save-word-to-phone moment with both screens in frame) + submission
