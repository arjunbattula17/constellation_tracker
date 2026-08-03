# Architecture Decision Log
<!-- Run /decide to record decisions -->

## ADR-001: Full standard star/constellation catalog over a curated subset

**Status:** Accepted
**Date:** 2026-08-02

**Context:** During `/discover`, given the "days, not months" timeline goal, I asked whether it was OK to ship v1 with a curated subset (~50-100 well-known named stars and the most recognizable constellations) instead of the full standard astronomical data set, to reduce data-prep and implementation work.

**Alternatives Considered:**

### Curated subset (~50-100 named stars, hand-picked recognizable constellations)
- Pros: Much less data-prep work; avoids implementing full IAU-88 boundary-polygon horizon math (a star-sampling approximation would suffice); faster path to a working v1.
- Cons: Incomplete coverage — a constellation with no famous star currently above the horizon wouldn't be detected by star-based classification alone; "visible constellations" would be an approximation, not an accurate answer; doesn't credibly serve a "serious amateur astronomer" audience.
- Rejected: explicitly, in favor of correctness over speed.

### Full standard set (IAU-88 constellations via boundary-polygon math, HYG catalog filtered to naked-eye magnitude)
- Pros: Accurate constellation determination across all 88 IAU constellations, not just a hand-picked list; comprehensive famous-star coverage (358 named stars from the real HYG database, not an arbitrary curated list); credible for both the casual and serious-amateur audiences named in `/discover`.
- Cons: Requires precise boundary-polygon/horizon intersection math and sourcing a full IAU-88 boundary vertex dataset — a meaningfully bigger implementation lift, directly in tension with the "days, not months" timeline goal.
- Rejected: no — this is the chosen option.

**Decision:** Ship the full standard set — IAU-88 constellations (Phase 2, via boundary-polygon horizon math) and the full HYG star catalog filtered to naked-eye magnitude (≤6.5, Phase 1, already built as `data/stars.json` via `scripts/build-star-catalog.js`) — over a curated subset, prioritizing correctness and completeness over the fastest possible build.

**Consequences:**
- Enables accurate "visible constellations" output for any of the 88 IAU constellations and comprehensive named-star coverage, without needing to revisit the data model later to add missing constellations or stars.
- Constrains Phase 2 to the harder boundary-polygon horizon algorithm rather than a simpler star-sampling approximation — already flagged in `docs/spec.md` Open Questions and `docs/plan.md` Phase 2 as the single biggest risk to the timeline goal.
- Follow-up: Phase 2 needs to source and integrate a full IAU-88 boundary vertex dataset, following the same data-prep pattern already established for the star catalog (download raw data, filter/transform with a one-off script, bundle the small result). If the boundary math proves too slow to get right, the documented fallback (per `docs/plan.md` Phase 2) is a conscious, called-out descope to star-sampling visibility — not a silent one.

## ADR-002: Hybrid grid resolution for visible-constellation sampling

**Status:** Accepted
**Date:** 2026-08-03

**Context:** Phase 2 determines visible constellations by sampling the visible sky hemisphere on an altitude/azimuth grid and classifying each point against astronomy-engine's IAU-88 boundary data (`Astronomy.Constellation`), rather than hand-rolling polygon-edge/horizon intersection math (the approach chosen in ADR-001). The open question was grid resolution: fine enough to be faithful to the spec's "precise IAU-88 boundary polygons intersected with the local horizon" requirement, cheap enough for a per-request public API. Planning verified a uniform 2° grid matched a 0.5° grid for one London fixture and recorded it as "proven sufficient." The Phase 2 `/inspect` pass tested that claim across the input space and found it did not generalize: a 162-observer sweep (lat −80..80 × lon −180..120 × 3 dates) showed a uniform 2° grid under-reports a near-horizon constellation in ~20% of cases vs 0.5°, always as a thin sliver just above alt=0 that the coarse grid steps over (always a miss, never a false positive) [sourced: /inspect grid sweep 2026-08-03].

**Alternatives Considered:**

### Uniform 2° grid (as-planned)
- Pros: Cheapest (~5ms/request); matches 0.5° for many observers.
- Cons: Misses a genuinely-visible near-horizon constellation in ~20% of observer/time cases — a correctness gap against the spec's "precise" bar and ADR-001's correctness-over-speed stance.
- Rejected: fails the spec fidelity bar the project deliberately set.

### Uniform 0.5° grid
- Pros: Faithful reference resolution; closes the gap.
- Cons: ~80ms/request (16× the 2° cost) for a per-request public endpoint — most of it spent finely sampling high-altitude sky that a 2° grid already resolves perfectly.
- Rejected: pays a large uniform cost to fix an error that is entirely concentrated near the horizon.

### Hybrid grid (chosen)
- 2° over the full hemisphere + a dense 0.5° band over the lowest 5° of altitude, where every observed miss lives.
- Pros: Matches the 0.5° reference in 0/162 sweep cases at ~9.7ms (max 24.4ms observed) — ~2× the 2° cost, vs 16× for uniform 0.5° [sourced: /inspect grid-cost timing 2026-08-03]. Same single boundary source of truth as star classification.
- Cons: Still a grid-sampling approximation, not exact polygon intersection — could in principle miss a constellation sliver narrower than 0.5°; unverified below the 0.5° reference.

**Decision:** Sample the visible hemisphere at 2° everywhere plus a 0.5° dense band over altitude 0–5°, because the constellation-detection error is entirely concentrated near the horizon, so densifying only that band recovers full fidelity (0/162 misses vs 0.5°) at ~2× cost instead of 16×.

**Consequences:**
- Visible-constellation output now matches the 0.5° reference across the swept input space, honoring the spec's "precise" requirement and ADR-001's correctness-over-speed choice without a 16× cost.
- Guards the choice: `test/constellations.test.ts` asserts a near-horizon constellation (Lepus, lat 40 / lon −60) that a pure-2° grid misses; `docs/plan.md` Phase 2 wording is corrected from "proven sufficient" to reflect the sweep.
- Residual limitation: 0.5° is the verification reference, not ground truth. If sub-0.5° near-horizon fidelity ever matters, the exact fix is the polygon-edge/horizon intersection deferred in ADR-001 — not a finer uniform grid.

## ADR-003: Classify stars via astronomy-engine, not the HYG catalog's own `con` field

**Status:** Accepted
**Date:** 2026-08-03

**Context:** Phase 2 needed to tag each famous star with its constellation. `data/stars.json` (built from the HYG database in Phase 1) already carries a `con` field per star — a 3-letter constellation abbreviation populated straight from the raw CSV, HYG's own precomputed classification. Phase 2 separately needed `Astronomy.Constellation(ra, dec)` (astronomy-engine's IAU-88 boundary data) to grid-sample the visible-constellation list (ADR-001, ADR-002). The question: classify stars from the existing `con` field (already there, no extra computation), or recompute via `Astronomy.Constellation` for every star?

**Alternatives Considered:**

### Use HYG's own `con` field directly
- Pros: Zero extra computation — the value is already sitting in the catalog data; no extra function call per star.
- Cons: HYG's constellation assignment is a separate calculation from astronomy-engine's own IAU-88 boundary lookup (possibly different source data, epoch, or edge-case handling). A star could be tagged into a constellation that astronomy-engine's grid-sample doesn't currently list as visible for that observer/time — a "famous star in Foo" showing up when "Foo" isn't in the visible-constellations list. Also doesn't match the spec's wording (§Sky Calculation: "classify each catalog star's constellation membership using its right ascension/declination against the IAU-88 boundaries" — implying the same boundary source used elsewhere).
- Rejected: risks a visible inconsistency between two parts of the same API response, and doesn't match the spec's stated method.

### Recompute via `Astronomy.Constellation(raHours, decDeg)` per star (chosen)
- Pros: Single source of truth — a star's tagged constellation and the grid-sampled visible-constellation list always agree, since both go through the same boundary lookup (plus the same `resolveConstellationName` misspelling correction). Matches the spec's wording exactly.
- Cons: One extra function call per named star (a few hundred, not the full ~8,920-row catalog, since only stars with a `proper` name are output) — negligible next to the constellation grid-sample, which already dominates per-request cost (ADR-002).
- Rejected: no — this is the chosen option.

**Decision:** Classify every famous star's constellation via `Astronomy.Constellation(raHours, decDeg)` (`src/sky/constellations.ts`'s `classifyStarConstellation`), not via the HYG catalog's precomputed `con` field, so stars and the visible-constellation list share one boundary source of truth.

**Consequences:**
- Guarantees internal consistency: whenever a famous star is above the horizon, its tagged constellation is guaranteed to appear in that same request's visible-constellations list.
- The HYG `con` field remains in `data/stars.json` and the `CatalogStar` type but is unused by the running app — noted in `docs/learnings.md` so a future session doesn't "simplify" by switching to it without re-deriving this reasoning.
- No follow-up work: negligible performance cost given current catalog size and request-time budget.
