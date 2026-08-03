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

## ADR-004: Chart label layout lives in chart.js, not app.js — with a width-clamped placement algorithm

**Status:** Accepted
**Date:** 2026-08-03

**Context:** A review of the Phase 4 mini chart found a reproducible bug: `layoutLabelPositions` in `public/app.js` only nudged colliding labels rightward with no bound, so a cluster of labeled items in one azimuth region (a realistic case — the brightest stars/planets often cluster toward one horizon) pushed labels past the chart's right edge (repro: 16 clustered items, max label x=480 vs width=360, 12/16 clipped off-canvas). The same review separately noted that `selectLabeledItems`, `layoutLabelPositions`, and `anchorForX` were pure functions with no DOM dependency, but lived in `app.js` where only a slow jsdom smoke test could exercise them — the smoke test asserted label *count* but never checked bounds, which is exactly why the clipping bug shipped unnoticed.

**Alternatives Considered:**

### Patch the clamp in place, leave the functions in app.js
- Pros: Smallest possible diff — just cap the pushed-right value at `width`.
- Cons: Leaves the label-layout logic reachable only through a full jsdom render (`test/chartRender.test.ts`), the same blind spot that let the original bug through unnoticed; a future change to the placement algorithm has no fast, direct unit test to catch a regression.
- Rejected: fixes today's symptom but leaves the review's second finding (untestable pure logic) in place.

### Move the pure label-layout functions into chart.js (chosen)
- `chart.js` already has a UMD guard (`if (typeof module !== "undefined") module.exports = {...}`) used by `computeChartLayout`/`azimuthToX`, loaded as a plain `<script>` in the browser (no bundler, no ES modules) and via `require()` in Node tests — the same pattern extends cleanly to the label functions.
- Pros: `selectLabeledItems`, `layoutLabelPositions`, `anchorForX` become directly unit-testable (`test/chart.test.ts`) without jsdom; establishes `chart.js` as the home for all pure chart-layout math, `app.js` as DOM rendering/wiring only.
- Cons: Touches more lines than a minimal patch (moves ~60 lines across files).
- Rejected: no — this is the chosen option.

**Decision:** Move `selectLabeledItems`, `layoutLabelPositions`, `anchorForX`, and their constants (`LABEL_LIMIT`, `EDGE_MARGIN`, `MIN_LABEL_GAP`) from `app.js` into `chart.js`'s existing UMD-guarded module, and give `layoutLabelPositions` a second backward pass that clamps every position to `width - EDGE_MARGIN` after the forward gap-preserving nudge — so when a cluster is too dense to satisfy both the minimum gap and the chart bound, the bound wins and labels overlap rather than run off-canvas.

**Consequences:**
- `chart.js` is now the single home for pure chart-layout math (`computeChartLayout`, `azimuthToX`, and the label-placement functions); `app.js` owns DOM construction and event wiring only — future chart features (e.g. a legend layout algorithm) should follow the same split.
- `test/chart.test.ts` unit-tests the label functions directly (selection cutoff, gap-preserving nudge, width-clamp on a dense cluster); `test/chartRender.test.ts` keeps an integration-level jsdom check as a backstop, so the bug class (bounds violation) is now caught at both levels.
- Accepted tradeoff: in a cluster too dense for the chart width, labels overlap each other rather than clip off-canvas — no further follow-up planned unless a future chart layout needs true collision-free placement (would require reducing label count or font size, not just repositioning).

## ADR-005: Request-id guard against stale-render races in `fetchSkySnapshot`

**Status:** Accepted
**Date:** 2026-08-03

**Context:** Phase 3 added a second and third caller of `fetchSkySnapshot` (geolocation success and manual-entry submit) alongside Phase 1's page-load default fetch. The function is called fire-and-forget (not awaited by its callers) and is `async`, so two overlapping calls — e.g. the automatic demo-load fetch still in flight when a user immediately clicks "Use my location" — can have their underlying `fetch` promises resolve in either order. Reproduced live: without a guard, a slower, older response could resolve after a faster, newer one and overwrite the just-rendered current-location snapshot with stale demo data [sourced: `docs/learnings.md` "Phase 3 hardening" 2026-08-03].

**Alternatives Considered:**

### `AbortController` — cancel the in-flight request when a newer one starts
- Pros: Stops wasted network/server work for a superseded request, not just its rendered effect.
- Cons: More moving parts (store and abort a controller per call, handle the resulting `AbortError` in the `catch` path without surfacing it as a real failure) for a benefit — saving one in-flight demo-load fetch — that doesn't matter at this app's request volume.
- Rejected: added complexity not justified by the actual cost being solved.

### Module-scoped `latestRequestId` counter (chosen)
- Each call captures `++latestRequestId` at entry (`public/app.js:174`); after both the success and error paths' `await`, it checks `requestId !== latestRequestId` and bails before touching `statusEl`/`renderSnapshot` if a newer call has since superseded it (`public/app.js:185,192`).
- Pros: Minimal — a single counter and two guard checks; correctly discards a stale response by recency regardless of resolve order; the property being protected (what's currently rendered) is inherently "last request wins," not an accumulation that needs full serialization.
- Cons: Doesn't cancel the superseded request's underlying network call — it still completes, just its result is discarded. Only guards this one function; a future caller of `fetchSkySnapshot` that skips the pattern (e.g. by reading `statusEl` directly instead of going through this function) would reintroduce the race.

**Decision:** Guard `fetchSkySnapshot` with a module-scoped `latestRequestId` counter that each call snapshots at entry and re-checks after each `await`, discarding its own result if a newer call has since started — because the rendered snapshot only ever needs to reflect the most recently *requested* location, not first-to-resolve, and a counter is the simplest mechanism that gives that guarantee.

**Consequences:**
- Overlapping `fetchSkySnapshot` calls (demo load vs. geolocation vs. manual entry, in any resolve order) now always leave the UI showing the result of whichever call started last.
- Guarded by a jsdom test using manually-resolved fetch promises to force the exact resolve-out-of-order sequence (a standard `mockResolvedValue` resolves everything immediately and can't reproduce the race) — see `docs/learnings.md` "Phase 3 hardening."
- Follow-up: any new caller of `fetchSkySnapshot` gets this protection for free; any code that renders a snapshot *without* going through `fetchSkySnapshot` would not, and should route through it instead of duplicating the guard.

## ADR-006: Duplicate client/server coordinate validation, guarded by a parity test — not a shared module

**Status:** Accepted
**Date:** 2026-08-03

**Context:** Phase 3 needed the manual-entry form to reject an out-of-range latitude/longitude client-side, with no request sent (per `docs/plan.md` Phase 3). The server already validates the same ranges in `src/sky/validate.ts` (`GET /api/sky-snapshot`'s 400 path). The frontend (`public/app.js` etc.) is plain `<script>` tags with no bundler and no ES modules (established in Phase 1/4 — see ADR-004's note on `chart.js`'s UMD guard), so `src/sky/validate.ts` can't be `import`ed directly into the browser. The question was whether to keep one validation implementation (accepting some form of build step or runtime sharing) or accept two independent ones.

**Alternatives Considered:**

### Add a build/bundling step so the browser can import `src/sky/validate.ts` directly
- Pros: One implementation, zero duplication risk.
- Cons: The project has deliberately stayed bundler-less for the frontend through Phases 1-4 (plain `<script>` tags, `tsx watch` only for the server); introducing a bundler solely to share one small range check is a disproportionate build-system change for this project's "days, not months" scope.
- Rejected: cost far exceeds the problem being solved.

### Client validates nothing; only the server's 400 response surfaces the error
- Pros: Zero duplication — only one implementation exists.
- Cons: Directly contradicts the spec/plan requirement that an out-of-range manual coordinate shows an inline error with **no request sent** — a round trip for a check this cheap is also a worse UX (a visible delay for feedback that could be instant).
- Rejected: fails an explicit plan requirement.

### Two independent implementations (`public/validate.js` client-side, `src/sky/validate.ts` server-side), guarded by a parity test (chosen)
- `public/validate.js` re-implements the same range check behind the same UMD guard pattern already used by `chart.js` (`if (typeof module !== "undefined" && module.exports) module.exports = {...}`), so it's a plain `<script>` for the browser and `require()`-able from Vitest.
- `test/validateParity.test.ts` imports both `validateCoordinates` implementations and asserts they agree across a shared table of boundary/invalid inputs (in-range, exactly on each boundary, one unit past each boundary, `NaN` for each axis).
- Pros: No build-system change; instant client-side feedback with no request; the parity test converts "two implementations could silently drift" from a latent risk into a caught-at-CI failure the moment either side's range check changes without the other.
- Cons: A genuine maintenance cost — any future change to the valid coordinate range must be applied in both files, and would only be caught by remembering to update the parity test's expectations too (not automatically enforced beyond "both files must agree with each other," not "both files must be correct").

**Decision:** Keep `public/validate.js` and `src/sky/validate.ts` as two independent implementations of the same coordinate-range check, sharing only the UMD dual-consumption pattern already established for `chart.js` (not the logic itself), and guard against them drifting apart with `test/validateParity.test.ts` running both against a shared input table — because the project's bundler-less frontend makes true code-sharing disproportionately expensive for one small pure function, and a parity test converts the resulting duplication risk into an explicit, tested contract instead of an implicit assumption.

**Consequences:**
- Any future change to the valid latitude/longitude range (e.g. if the spec's bounds ever changed) must be made in both `public/validate.js` and `src/sky/validate.ts`, or `test/validateParity.test.ts` fails immediately — the drift risk is caught at test time, not discovered live via mismatched client/server behavior.
- Establishes the UMD-guarded, dual-consumption `public/*.js` module (browser `<script>` + Vitest `require()`) as the project's standing pattern for any future pure frontend logic that also needs direct unit tests (first used by `chart.js` in Phase 4, now confirmed with a second instance) — see also ADR-004.
- No further follow-up: the parity test already covers the boundary cases (exact bounds, one unit past, `NaN`) that would most likely diverge between two hand-written implementations.

## ADR-007: Correct the spec's Sun/Moon computation line rather than add Sun/Moon output

**Status:** Accepted
**Date:** 2026-08-03

**Context:** Phase 5's final line-by-line EARS walkthrough (`docs/plan.md` Phase 5) found that `docs/spec.md`'s Sky Calculation section required the system to "compute the current altitude/azimuth of the Sun, Moon, naked-eye planets, and catalog stars," but Sun/Moon appeared nowhere else in the spec — not in MVP Scope's Output list (constellations, famous stars, naked-eye planets, curated galaxies only), not in User Flows, not in Data Model, and not in Out of Scope — and no code anywhere computed them (`grep` for `Astronomy.Body.Sun`/`Astronomy.Body.Moon` across `src/` found zero matches). The only other Sun/Moon mentions in the spec were in External Dependencies and Technical Decisions, both describing `astronomy-engine`'s general capabilities as a rationale for choosing that library, not a requirement on this app's output. The question: is this a real, unmet requirement to build now, or a spec/code mismatch to correct?

**Alternatives Considered:**

### Add Sun/Moon altitude/azimuth to the API response and chart (treat as a real gap)
- Pros: Makes the EARS bullet literally true; Sun altitude could in principle inform a future "is this actually naked-eye visible given daylight" refinement (a separate, already-flagged simplification — see Phase 5 Inspection in `docs/learnings.md`).
- Cons: Real scope growth this late in the build, with no corresponding Output/User-Flow/Data-Model spec text to define what "Sun/Moon in the output" would even look like (a dot on the chart? a separate field? included in "visible" filtering?); Out of Scope lists no such deferral, so if this were a deliberate MVP requirement it's unclear why the rest of the spec never mentions it at all.
- Rejected: building undefined new scope from a single stray line, when every other part of the spec is silent on it, risks inventing a requirement that was never actually intended.

### Correct the spec text to match the actual, consistently-scoped requirement (chosen)
- The EARS bullet's mention of Sun/Moon reads as leftover drafting residue from justifying `astronomy-engine` (which does handle Sun/Moon math generically) rather than a deliberately scoped requirement — a genuine cut would normally show up in Out of Scope, and this one doesn't.
- Pros: Brings the spec back into internal consistency (EARS requirements now match Output list, User Flows, and Data Model exactly); zero code risk; the user confirmed this reading directly when asked.
- Cons: If Sun/Moon output turns out to be wanted later, it'll need a fresh spec pass (Output list, Data Model, possibly a new EARS bullet) rather than "already half-specified."

### Leave the mismatch in place, just record it (no spec or code change)
- Pros: Zero effort, no risk of misjudging intent.
- Cons: Leaves the spec self-contradictory indefinitely — a future session reading the EARS section in isolation would reasonably conclude Sun/Moon output is required and either build unwanted scope or waste time re-investigating a question already answered this session.
- Rejected: cheaper to fix the one line now than to leave a known contradiction for someone else to re-discover.

**Decision:** Corrected `docs/spec.md`'s Sky Calculation EARS bullet to read "the system shall compute the current altitude/azimuth of naked-eye planets and catalog stars," dropping Sun/Moon — confirmed with the user this was spec drafting residue, not a deferred requirement, since every other part of the spec (Output, User Flows, Data Model, Out of Scope) is and remains silent on Sun/Moon.

**Consequences:**
- `docs/spec.md`'s Requirements section is now internally consistent with its own MVP Scope Output list — a future spec walkthrough won't re-flag this.
- No code change; Sun/Moon remain entirely out of this app's computation and output, matching every other section of the spec.
- If Sun/Moon output is ever wanted (e.g. for a future "not naked-eye visible in daylight" refinement), it needs a real spec addition (Output list, Data Model) — not a resurrection of this now-corrected line.
