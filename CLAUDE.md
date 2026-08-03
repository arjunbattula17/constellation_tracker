# constellation_tracker — Project

## What This Is
Sky Snapshot is a public web app that shows what's currently visible in the sky (constellations, famous stars, naked-eye planets, and a few famous galaxies) for a given place, computed server-side and rendered as a simple horizontal strip/mini chart. See `docs/spec.md` for the full specification.

## Key Files
- `docs/spec.md` — What we're building and why
- `docs/plan.md` — Phased build plan
- `docs/decisions.md` — Architecture decisions with rationale
- `docs/learnings.md` — What Claude learns across sessions

## Build / Run / Test
- `npm run dev` — start the server (Express + static frontend) at http://localhost:3000, auto-reload via `tsx watch`
- `npm run build` — type-check and compile to `dist/`
- `npm start` — run the compiled server from `dist/`
- `npm test` — run the Vitest suite
- `node scripts/build-star-catalog.js` — regenerate `data/stars.json` from `scripts/hygdata_v41.csv` (the raw CSV is gitignored; re-download from the HYG Database repo if missing)

## Project Rules
<!-- Accumulated over time -->
