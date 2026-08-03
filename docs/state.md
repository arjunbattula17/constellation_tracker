# Session State — 2026-08-02

**Branch:** master

## Done
- Phase 1 (vertical slice sky data pipeline) complete and committed, plus a fix-now bug
  (npm start broken under compiled dist/) and an AI-slop cleanup pass
- ADR-001 recorded: full IAU-88 + full star catalog over a curated subset

## Next step
- Run /construct 2 — Phase 2: constellation visibility. Plan was pre-verified this session:
  astronomy-engine's Constellation() already has the IAU-88 data built in, no external
  dataset needed. Full algorithm + 2 verified gotchas are in docs/plan.md Phase 2 — read
  it before starting, don't re-derive.

## Open questions
- None blocking; spec.md's remaining Open Questions are deferred to build time as planned

## Landmines
- Don't reintroduce __dirname-relative paths for data/public assets — process.cwd() is
  required for npm start (dist/) to work; verify with a real npm run build && npm start
