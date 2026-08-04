# Session State — 2026-08-04

**Branch:** master (pushed, clean — `d101095`)

## Done
- Immersive sky map (circular all-sky + pannable landscape, pan/zoom, constellation
  figures, ~4,400-star starfield, Moon w/ phase, Milky Way) is **live on Render**.
- Milky Way payload cut 17x (648 -> 37 KB) by simplifying its outlines at the source's
  own 0.1-deg sampling granularity and rounding coords; also 33% faster requests.
- Gates green: 194 tests / 32 files, `tsc` clean. ADR-013 through ADR-017 recorded.

## Next step
- **Visual pass — still the only thing blocking "done," and now overdue.** Nothing has
  ever been looked at: the Chrome extension was disconnected and there's no headless
  browser or native `canvas` lib, so rendering was only verified via a recording-context
  stub. The Milky Way geometry has since been changed sight-unseen. Open
  https://sky-snapshot.onrender.com (or `npm run dev`), check both views, then tune star
  size/opacity (`magnitudeToRadius`/`magnitudeToAlpha` in `public/projection.js`), band
  opacity + hill silhouette (`skyview.js`), and the Moon-phase glyph terminator.
- Optional perf follow-up: `starfield` is now 83% of the payload (375 KB). The same
  coordinate rounding would roughly halve it; a magnitude cap would cut more.

## Open questions
- Three defaults never visually validated: circular view on load, azimuthal-equidistant
  projection, no starfield magnitude cap.

## Landmines
- Vendored `data/constellation-lines.json` + `data/milkyway.json` MUST ship with the
  deploy. The Milky Way rings cross the RA 0/360 seam — see [[reference-d3-celestial-data]].
- Canvas can't be verified in jsdom; client globals shared across files must be
  `var`/`function`, not `const` — see [[reference-jsdom-node-fetch]].
- `.claude/worktrees/` is a sibling session's worktree — never stage it.
