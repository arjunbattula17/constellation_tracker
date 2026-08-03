# Session State — 2026-08-03

**Branch:** master

## Done
- Phase 3 (Real Location Input) and Phase 4 (Visual Mini Chart) complete, committed, pushed
  (5605edf), including post-inspection fixes (stale manual-location-error clear in
  `showManualFallback()`, CSS for `#location-controls`/`#manual-location`).
- Phase 4 fix-round (separate session, this one): label-clipping fix, a11y sr-only list,
  pure label logic moved to chart.js, label/tick offset + galaxy color nits — committed
  (a839777), pushed, ADR-004 recorded.
- ADR-005 (stale-render request-id guard in `fetchSkySnapshot`) and ADR-006 (client/server
  coordinate validation duplication + parity test) recorded in `docs/decisions.md`, pushed
  (cf51e40, 14ffe43).

## Next step
- Phase 3's manual browser verification checklist (docs/plan.md Phase 3) had no prior evidence
  of being run live (only jsdom-mocked coverage). User ran all 6 steps live in a real browser
  this session — demo load, geolocation grant (label + snapshot both updated), geolocation
  deny (fallback + message shown, demo stayed), invalid manual coord (inline error, no
  request), valid manual coord/Tokyo (snapshot updated, error cleared), reload-still-demo.
  All passed. Phase 3 is now fully verified.
- Run /construct 5 — Phase 5: Polish & Harden.

## Open questions
- None blocking.

## Landmines
- Don't reintroduce __dirname-relative paths for data/public assets — process.cwd() is
  required for npm start (dist/) to work; verify with a real npm run build && npm start.
- `data/stars.json`'s `con` field is unused by design (ADR-003) — don't switch to it without
  re-checking that reasoning.
- `reports/` (session-audit.log, phase*-change-list.md) holds local session artifacts with
  absolute local machine paths — not committed; check contents before adding to git.
- This repo sometimes has multiple concurrent Claude Code sessions running against it under
  the same git identity — this file itself changed underneath this edit. Merge, don't blindly
  overwrite, and treat unexpected git/doc state as a live sibling session, not a bug.
