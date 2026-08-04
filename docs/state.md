# Session State — 2026-08-03

**Branch:** master (pushed, clean — `69a37fe`)

## Done
- Immersive sky map shipped: circular all-sky + pannable landscape views behind a
  toggle, pan+zoom, constellation figures, ~4,400-star starfield, Moon w/ phase,
  Milky Way band. Committed and pushed. ADR-013 through ADR-017 recorded.
- Gates green: 190 tests / 31 files, `tsc` clean, ~52 ms/request.

## Next step
- **Visual pass — the only thing blocking "done."** Nothing has ever been *looked at*:
  the Chrome extension was disconnected all session and there's no headless browser or
  native `canvas` lib, so rendering was verified only via a recording-context stub.
  Run `npm run dev` → http://localhost:3000, check both views, then tune: star
  size/opacity curve (`magnitudeToRadius`/`magnitudeToAlpha` in `public/projection.js`),
  Milky Way opacity + the landscape hill silhouette (`skyview.js`), Moon-phase glyph
  terminator math, and pan/zoom feel.
- The live Render deploy still serves the OLD dashboard until this is redeployed.

## Open questions
- Three reversible defaults never visually validated: circular view on load,
  azimuthal-equidistant projection, no starfield magnitude cap.

## Landmines
- `data/constellation-lines.json` + `data/milkyway.json` (vendored d3-celestial, BSD-3)
  MUST ship with the deploy — committed, unlike the gitignored HYG CSV.
- Canvas can't be verified in jsdom; cross-file client globals must be `var`/`function`,
  not `const` — see [[reference-jsdom-node-fetch]] in memory.
- `.claude/worktrees/` holds a sibling session's worktree — never stage it.
- Multiple concurrent Claude Code sessions sometimes run against this repo.
