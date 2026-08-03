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
