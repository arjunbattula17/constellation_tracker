# Session State — 2026-08-03

**Branch:** master

## Done
- Phase 2 (constellation visibility) complete and committed: `src/sky/constellations.ts`
  (`computeVisibleConstellations`, `classifyStarConstellation`, `resolveConstellationName`),
  `FamousStar` type, star tagging in `src/sky/stars.ts`, wired into `src/sky/snapshot.ts`,
  frontend renders constellations + per-star constellation tag.
- Verified live against 3 place/time combos (London winter evening, Sydney southern-hemisphere
  summer evening, London summer-solstice noon) plus a jsdom frontend render check.

## Next step
- Run /construct 3 — Phase 3: Real Location Input (Geolocation API + manual lat/long fallback).
  Depends only on Phase 1 (already done), not on Phase 2.

## Open questions
- None blocking.

## Landmines
- Don't reintroduce __dirname-relative paths for data/public assets — process.cwd() is
  required for npm start (dist/) to work; verify with a real npm run build && npm start.
- `data/stars.json`'s `con` field (raw HYG constellation abbreviation) is unused by design —
  constellation tagging goes through `classifyStarConstellation` (astronomy-engine's own
  IAU-88 boundaries) instead, so it stays consistent with `computeVisibleConstellations`.
  Don't "simplify" by switching to the `con` field later without checking this reasoning.
