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

## ADR-008: Deploy to Render via a committed Blueprint, with a new `/health` endpoint

**Status:** Accepted
**Date:** 2026-08-03

**Context:** `docs/spec.md`'s Boundaries explicitly require asking before "changing the hosting/deployment target." At the `/ship` pre-launch gate, the user had no host chosen yet; asked directly, they picked Render. Render's Blueprint mechanism (`render.yaml`) reads service configuration from the repo and can call for a `healthCheckPath`, but this app had no health-check endpoint — the `/ship` checklist had already flagged this as a gap, not spec-required but a reasonable pre-launch addition once an actual host needing one was chosen.

**Alternatives Considered:**

### Configure the Render service entirely through the dashboard (no `render.yaml`)
- Pros: No repo changes needed at all.
- Cons: Configuration (build/start commands, `TRUST_PROXY`, health check path) lives only in Render's UI, invisible to anyone reading the repo, and has to be manually re-entered if the service is ever recreated or a second environment is added.
- Rejected: repo-visible config is worth the one extra file, especially for `TRUST_PROXY`, where getting it wrong is a security-relevant mistake (see the trust-proxy fix earlier this phase) — a Blueprint makes the correct value ship with the code, not tribal dashboard knowledge.

### Skip the health-check endpoint (use `/` or `/api/sky-snapshot` as the check instead)
- Pros: Zero new code.
- Cons: `/api/sky-snapshot` requires valid `lat`/`lon` query params to return 200 — an unparameterized health check would 400, which most platforms would misread as "unhealthy." `/` serves the static frontend, a weaker signal (proves static file serving works, not that the Express process/routing is actually alive).
- Rejected: a dedicated, parameter-free endpoint is the correct signal and is cheap (one route, no dependencies).

### `render.yaml` Blueprint + a new `GET /health` endpoint (chosen)
- `render.yaml`: `type: web`, `runtime: node`, explicit `buildCommand`/`startCommand` (not relying on the `heroku-postbuild` convention, which is Heroku-specific and wouldn't fire on Render), `plan: free`, `healthCheckPath: /health`, and `envVars: [{key: TRUST_PROXY, value: "1"}]` — Render's edge is a single-hop proxy, matching the topology `TRUST_PROXY=1` is meant for (see the trust-proxy fix earlier this phase).
- `GET /health` returns `200 {"status": "ok"}` with no required params, added to `src/server.ts` ahead of the router/static middleware, tested (`test/health.test.ts`) and verified live.
- Pros: One-click "New > Blueprint" import in Render's dashboard with no manual field-filling; the security-relevant `TRUST_PROXY` value is correct by default for this specific host, not left to be configured correctly (or not) by hand later.
- Cons: `render.yaml` is Render-specific syntax; if a different host is chosen later, this file becomes dead config (harmless, but worth knowing it's not portable across providers the way the `Procfile` is).

**Decision:** Deploy to Render, configured via a committed `render.yaml` Blueprint, and add a dedicated `GET /health` endpoint as the health-check target — chosen after the user picked Render directly when asked (per the spec's "ask before changing deployment target" boundary), and because a repo-committed config file makes the security-relevant `TRUST_PROXY` value correct-by-default rather than a manual dashboard setting someone could get wrong or forget.

**Consequences:**
- Deploying now requires no manual Render dashboard configuration beyond connecting the repo via "New > Blueprint" — `render.yaml` supplies build/start commands, the free plan, the health check path, and the correct `TRUST_PROXY` value.
- `/health` is a permanent, minimal, dependency-free endpoint; any future change to `src/server.ts`'s middleware order should keep it ahead of anything that could make it slow or fail (rate limiting, sky calculation) — it exists specifically to answer "is the process alive" cheaply.
- If the project ever moves off Render, `render.yaml` stops being read (harmless dead file) but `Procfile`/`heroku-postbuild` and `/health` remain useful on most other Node-hosting platforms.

## ADR-009: Mission-dashboard redesign keeps rectangular chart coordinates, rejects polar/3D

**Status:** Accepted
**Date:** 2026-08-03

**Context:** The user asked to make the app "more interactive," citing a JPL/Eyes-on-Asteroids-style mission-dashboard feel as the reference (chosen explicitly over a 3D solar-system-orbit style when asked to pick between them) and said they were open to a bigger visual overhaul of the chart itself. The question was whether "bigger overhaul" should include changing the chart's underlying coordinate system (e.g. a radial/polar "compass rose" view, or a 3D scene) or stay within the existing rectangular altitude/azimuth strip established in Phase 4/ADR-004.

**Alternatives Considered:**

### Radial/polar or 3D chart (a bigger geometric overhaul)
- Pros: Visually closer to some real astronomy tools (e.g. a polar sky-dome view); matches "bigger overhaul" literally.
- Cons: `test/chart.test.ts` hard-codes exact pixel `x`/`y` values for the current linear `azimuthToX`/altitude-to-`y` mapping — changing the coordinate system would rewrite most of that file for a visual style the user didn't actually ask for (they picked the dashboard reference over the orbit-viewer one when asked directly); the existing label-placement logic (`selectLabeledItems`, `layoutLabelPositions`, `anchorForX`) is built entirely around a rectangular x-axis and would need a parallel implementation, not a reinterpretation, for polar coordinates.
- Rejected: real scope/risk for a visual style not actually requested — rectangular elevation/azimuth strips are also literally what real astronomy dashboards use, so it isn't a compromise.

### Keep the existing rectangular coordinates; put the "bigger overhaul" into presentation, interactivity, and rendering mechanics instead (chosen)
- Pros: Zero risk to `computeChartLayout`'s existing, well-tested output shape; the "mission dashboard" feel the user actually asked for comes from the dark theme, live panels, tooltips/focus interaction, and animated data-refresh transitions (ADR-010) — none of which require changing the coordinate system.
- Cons: None identified — this reads as strictly lower risk with no missed requirement.

**Decision:** Kept `chart.js`'s rectangular (linear azimuth→x, linear altitude→y) coordinate system unchanged through the whole Phase 6-10 redesign; all "bigger overhaul" work went into the dark theme, dashboard panels, tooltip/focus interactivity, and keyed-diff animated rendering instead of the chart's underlying geometry.

**Consequences:**
- `test/chart.test.ts`'s exact-pixel assertions for `computeChartLayout` needed no rewrite for this redesign (they were only extended, in ADR-010's related work, to include the new `altitude`/`azimuth`/`constellation` fields `describeItem` needs — not to change the coordinate math itself).
- A future radial/3D view, if ever wanted, is a genuinely new layout function alongside `computeChartLayout`, not a modification of it — this ADR is the record of why that wasn't attempted now.

## ADR-010: Animate dot transitions via keyed-diff rendering, despite often-imperceptible real motion

**Status:** Accepted
**Date:** 2026-08-03

**Context:** Part of the mission-dashboard redesign (ADR-009) was making chart refreshes feel "alive" instead of a hard cut. A design-review pass recommended against animating individual dots easing between positions: real sky objects move roughly 0.25°/minute, so over a realistic 30-60s poll interval a dot's position barely changes — there's often nothing perceptible to animate — and naively adding a fade to the existing full-teardown-and-rebuild render model would make *every* dot flash on *every* refresh (since rebuild recreates 100% of nodes regardless of whether they changed), which reads as worse than no animation at all. The recommended alternative was a live clock, stat-count flashes, and a single whole-panel refresh pulse instead of per-dot motion. Asked directly, the user still wanted dots to visibly animate.

**Alternatives Considered:**

### No per-dot animation — clock/stat-flash/panel-pulse only (the design review's recommendation)
- Pros: Cheaper to build; avoids animating a movement that's often physically imperceptible; sidesteps the full-rebuild-causes-flashing problem entirely by never touching per-dot rendering.
- Cons: Doesn't deliver what the user explicitly asked for (dots that visibly animate) — the "liveliness" signal is at the panel level, not the sky itself, which is the app's main content.
- Rejected: the user, informed of the imperceptible-motion tradeoff, chose to keep dot animation anyway — a legitimate product call favoring perceived polish over strict physical accuracy of the animation's magnitude.

### Per-dot animation on top of the existing full-teardown-and-rebuild render (naive approach)
- Pros: Minimal code change — just add a CSS transition/fade to newly-created dots.
- Cons: Every dot is destroyed and recreated on every render regardless of whether its data changed, so a naive fade would fire for *all* dots on every refresh — exactly the "flashes instead of animates" failure mode the design review flagged.
- Rejected: doesn't actually achieve smooth per-dot animation; recreates the problem it's meant to solve.

### Keyed-diff rendering (chosen)
- `chart.js`'s new `diffChartItems(prevItems, nextItems)` classifies items across two renders by stable identity (`${type}:${name}`) into entering/updating/exiting.
- `app.js`'s `renderChart` keeps a persistent `Map<key, {circle, item}>` across calls instead of clearing `#sky-chart` every time: unchanged items get their existing `<circle>`'s `cx`/`cy` updated in place (a CSS `transition` animates the move — a deliberately generous ~0.7s duration, since the point is communicating "this just refreshed," not literally tracking real-time celestial motion at true speed), new items fade in, removed items fade out before their node is detached.
- Labels are the deliberate exception: which items get labeled depends on the whole current item set's brightness ranking (`selectLabeledItems`), not any single item's identity, so labels are simplest rebuilt fresh every render rather than diffed — a targeted, documented scope reduction, not an oversight.
- Native SVG `<title>` elements are kept on every dot alongside the new custom hover tooltip (from the same redesign's tooltip/focus-panel work) — removing them would need deliberate work to preserve equivalent accessibility, for no visual benefit since the custom tooltip supersedes them on hover.
- Pros: Delivers what the user asked for (visible per-dot animation) without the full-rebuild flashing problem; `test/chart.test.ts`/`test/chartRender.test.ts` gained direct coverage of the diff classification and of DOM-node-identity persistence across two renders — a new regression class this architecture makes possible to test at all.
- Cons: The largest architectural change in the redesign; `requestAnimationFrame` (the first implementation of the entering-fade trigger) turned out not to be polyfilled by jsdom, unlike a real browser — caught by running the actual test suite, fixed by switching to `setTimeout(fn, 0)`, which achieves the same "let the initial state paint before transitioning" effect portably (see `docs/learnings.md`).

**Decision:** Built keyed-diff chart rendering (`diffChartItems` + a persistent per-key DOM node map in `renderChart`) so unchanged dots animate to new positions via CSS transitions and entering/exiting dots fade in/out, rather than settling for panel-level liveliness cues only — a deliberate choice to prioritize the user's explicit request for visible dot animation over strict physical-accuracy concerns about how much a dot's position actually changes per refresh.

**Consequences:**
- Every future change to `renderChart` must preserve the keyed persistent-node model — reverting to a full `container.innerHTML = ""` rebuild would silently reintroduce the exact "flashes on every refresh" problem this ADR exists to avoid.
- Labels remain non-animated/fully-rebuilt by design; if a future change makes label identity trackable per-item (e.g. a fixed label roster rather than a brightness-ranked top-N), revisit whether they should join the diffed/animated path too.
- `setTimeout(fn, 0)`, not `requestAnimationFrame`, is this codebase's established pattern for "defer to next tick so an initial CSS state can paint before transitioning" — matches both real browsers and the jsdom test environment.

## ADR-011: Test poll-tick logic via direct function invocation, not fake timers

**Status:** Accepted
**Date:** 2026-08-03

**Context:** Phase 10 added a 60-second auto-refresh poll (`pollTick`) as part of the mission-dashboard redesign. This project's jsdom-based frontend tests (`appGeolocation.test.ts`, `chartRender.test.ts`) construct their own `new JSDOM(...)` window and `dom.window.eval()` the real `app.js`/`chart.js`/etc. into it, rather than running app code in Vitest's own ambient jsdom environment. Testing a 60-second interval firing organically would mean either waiting 60+ real seconds per test (impractical) or using `vi.useFakeTimers()` to fast-forward it.

**Alternatives Considered:**

### `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(...)`
- Pros: The idiomatic Vitest way to test timer-driven code without real waits.
- Cons: Verified directly (via a failing test) that this does not work with this project's test harness pattern — `vi.useFakeTimers()` patches the *outer* Vitest/Node test environment's global `Date`/`setInterval`, but a manually-constructed `new JSDOM(...)` window has its own fully separate, independent `Date`/`setInterval` implementations. Code `eval`'d into that inner window (including `setInterval(pollTick, POLL_INTERVAL_MS)`) is entirely unaffected by fake timers activated in the outer scope — a real, confirmed incompatibility, not a hypothetical one.
- Rejected: doesn't work with this codebase's established jsdom-in-jsdom test pattern (itself already established for good reasons — see `docs/learnings.md`'s Phase 1 note on why frontend tests are verified this way).

### Wait out a real, shortened test-only poll interval
- Pros: Exercises the actual `setInterval` wiring end-to-end.
- Cons: Requires either a test-only interval duration (an environment-detection branch in production code purely to serve tests — the kind of test-specific pollution this project avoids elsewhere) or accepting a real 60-second wait per test (unacceptably slow for a test suite that otherwise runs in ~3 seconds).
- Rejected: both options are worse than just calling the tick logic directly.

### Call `pollTick()` directly, bypassing the `setInterval` wiring entirely (chosen)
- Since `app.js` is `eval`'d as a classic (non-module) script into the jsdom window's global scope, its top-level `function pollTick() {}` declaration is directly reachable as a property of that window (`dom.window.pollTick()`) — no export machinery needed.
- Tests call `dom.window.pollTick()` directly to exercise the meaningful logic (re-fetches the last-used location, respects `document.hidden`, doesn't flash the loading state, doesn't blank the dashboard on a silent failure) without needing to control real or fake time at all.
- The one-line `setInterval(pollTick, POLL_INTERVAL_MS)` wiring itself is treated as standard, low-risk browser API usage verified by live manual testing (per the plan's own "Verify" step), not by an automated test — matching how Phase 7's `setInterval(updateClock, 1000)` clock-tick wiring was handled the same way.
- Pros: Tests run in milliseconds; directly exercises the actual production `pollTick` function (not a reimplementation); also surfaced a real, separate jsdom quirk along the way — a freshly-constructed `new JSDOM(...)` window defaults `document.hidden` to `true` (`visibilityState: "prerender"`), requiring tests to explicitly set it to `false` to exercise the "should poll" path.
- Cons: Doesn't test the `setInterval` scheduling itself (mitigated by manual verification, matching this project's established split between automated and live-verified concerns for timer-driven UI).

**Decision:** Test `pollTick`'s logic via direct invocation (`dom.window.pollTick()`), not `vi.useFakeTimers()`, because fake timers don't reach into a separately-constructed `new JSDOM(...)` window's own timer implementation in this project's established test-harness pattern — confirmed by a failing test, not assumed.

**Consequences:**
- Any future timer-driven frontend logic in this codebase (another poll, a debounce, a delayed retry) should follow the same pattern: expose the tick/callback as a directly-callable top-level function and test it by direct invocation, not by trying to drive the wrapping `setInterval`/`setTimeout` through fake timers.
- `document.hidden` defaults to `true` in a freshly-constructed `new JSDOM(...)` window — any test exercising "visible tab" behavior must explicitly set it to `false`; this is now demonstrated in `test/appGeolocation.test.ts`'s polling tests for future tests to copy.

## ADR-012: Key the rate limiter on Cloudflare's `CF-Connecting-IP`, gated by `TRUST_CLOUDFLARE`

**Status:** Accepted
**Date:** 2026-08-03

**Context:** After the first live Render deploy, response headers showed `Server: cloudflare` and a `CF-RAY` id on every request — Render's public edge is Cloudflare, sitting in front of Render's own proxy. That's two hops, not the one `TRUST_PROXY=1` (ADR from the Phase 5 trust-proxy fix) assumed. Verified live with the same methodology as the original bug: 35 requests to the deployed `/api/sky-snapshot` each with a different spoofed `X-Forwarded-For` → 0 got 429'd (the limit is 30/min) — the exact bypass the Phase 5 fix was meant to close, reopened by a wrong hop-count assumption. Separately, three *unspoofed* consecutive requests showed `RateLimit-Remaining` jumping erratically (29 → 11 → 29), meaning the single-hop assumption was also picking an inconsistent "client IP" for legitimate traffic, not just failing to resist spoofing.

**Alternatives Considered:**

### Increase `TRUST_PROXY` to `2` (guess the new hop count)
- Pros: Smallest possible change — one config value.
- Cons: Express's numeric `trust proxy` mode trusts exactly that many hops of `X-Forwarded-For` from the right; Cloudflare's own edge network can itself introduce a variable number of internal hops depending on routing, so "2" is also a guess, not a verified constant — the same failure mode (wrong assumed topology) that caused this bug in the first place, just with a different wrong number.
- Rejected: replacing one guessed hop-count with another doesn't fix the underlying problem — an assumed number, not a verified guarantee.

### Key the limiter on Cloudflare's `CF-Connecting-IP` header, unconditionally
- Pros: Cloudflare's edge always sets this header to the true connecting client IP and overwrites any client-supplied value of the same name when a request genuinely passes through Cloudflare — sidesteps hop-counting entirely.
- Cons: That guarantee only holds when the request actually came through Cloudflare. Trusting the header unconditionally would let a client reaching the app *directly* (local dev, or a future non-Cloudflare host) simply set `CF-Connecting-IP` itself — reintroducing the identical spoofable-header bypass the Phase 5 ADR already fixed once, for a different header. Confirmed as a real risk, not hypothetical, by the same "trust proxy: 1 was a security-relevant default" lesson from that ADR.
- Rejected: correct only for one specific deployment, wrong (and dangerous) as a default for any other.

### `CF-Connecting-IP` gated behind a `TRUST_CLOUDFLARE` env var, defaulting to `false` (chosen)
- `rateLimitKey(req)` (`src/routes/skySnapshot.ts`) checks `CF-Connecting-IP` only when `TRUST_CLOUDFLARE === "1"`, falling back to the existing `TRUST_PROXY`-driven IP otherwise — the exact same safe-by-default shape as the Phase 5 `TRUST_PROXY` fix, applied to a second, independently-spoofable header.
- `render.yaml` sets `TRUST_CLOUDFLARE=1` (true for this specific deployment, verified live) alongside the existing `TRUST_PROXY=1`; any other host must opt in explicitly after confirming its own topology, exactly like `TRUST_PROXY`.
- Pros: Fixes the actual verified topology without guessing a hop count; doesn't introduce a new default-unsafe trust of a client-controllable-looking header; regression-tested both directions (`test/skySnapshot.integration.test.ts`, "rate-limit key source (Cloudflare)") — confirmed the *unconditional* version of this fix actually fails the default-safe test before gating it, mirroring the verification discipline from the original `TRUST_PROXY` fix.
- Cons: Two independent trust flags (`TRUST_PROXY`, `TRUST_CLOUDFLARE`) to keep straight for future deployment targets — mitigated by both being documented in `README.md`'s Configuration section with the same "leave unset unless you've confirmed the topology" framing.

**Decision:** Key `express-rate-limit` on Cloudflare's `CF-Connecting-IP` header when `TRUST_CLOUDFLARE=1` is explicitly set (true for the Render deployment, since Render's public edge is confirmed to be Cloudflare), falling back to the existing `TRUST_PROXY`-driven IP otherwise — because the real topology has two proxy hops, not the one hop `TRUST_PROXY=1` alone can correctly resolve, and because unconditionally trusting `CF-Connecting-IP` would repeat the exact "trust a spoofable-looking header without confirming the topology" mistake ADR-005/the Phase 5 fix already exists to prevent.

**Consequences:**
- The live deployment's rate limiting is now verified correct against its actual network topology, not an assumed one — re-run the same live spoofed-header test after any future change to Render's edge configuration or a move to a different host.
- Any future deployment target sitting behind Cloudflare (or a similar edge network with its own trusted "real IP" header) should follow the same pattern: a dedicated, explicitly-opt-in trust flag per trusted header source, never a header trusted unconditionally just because it looks authoritative.
- `docs/learnings.md`'s "Post-deploy live security check" entry records the generalizable lesson: a fix verified correct in local tests can still be wrong against the real deployment if the assumed network topology doesn't match reality — check actual response headers from the live deployment rather than trusting host documentation or general research alone.

## ADR-013: Replace the mission-dashboard with a full-immersive sky map (two toggleable views)

**Status:** Accepted
**Date:** 2026-08-03

**Context:** The shipped UI rendered visible objects as an abstract azimuth(0–360)×altitude(0–90) scatter strip plus stat tiles and a constellation text list (the "mission dashboard", ADR-009–011). Shown two reference images — a naturalistic horizon landscape and a circular all-sky planisphere — the user confirmed neither matched their intent: they wanted an actual picture of the sky, with constellation stick-figures, a starfield, the Moon, and a Milky Way band. This is a deliberate reversal of the spec's original "simple strip, not a full planetarium chart" choice (`docs/spec.md`).

**Decision:** Replace the dashboard with a full-viewport, immersive sky map offering two projections behind a toggle — a circular azimuthal all-sky chart (zenith center, horizon rim, N-up/E-left) and a pannable landscape horizon slice — both with full pan + zoom. Retire the stat tiles and constellation text list; keep only the location controls and a small hover/tap info overlay as chrome. Confirmed with the user via four scoping questions before building (view style, figure lines, dashboard replacement, Moon/Milky Way).

**Consequences:**
- Retired `public/stats.js` + `test/stats.test.ts`, `public/timeFormat.js` + `test/timeFormat.test.ts` (the "updated N ago" ticker is gone), and the strip-layout functions in `chart.js` (`computeChartLayout` et al.); `chart.js` now exports only `describeItem`, reused by the new renderer for the tooltip/info overlay.
- The circular view is the default on load (shows the whole sky, needs no facing choice). Azimuthal-equidistant projection (linear altitude→radius) was chosen for simplicity and to match the reference planisphere.
- Server response gained four fields (see ADR-015); existing fields (`stars`/`planets`/`galaxies`/`constellations`) are retained to feed the interactive overlay.

## ADR-014: Hybrid Canvas (starfield/lines/Milky Way) + SVG (interactive bodies) rendering

**Status:** Accepted
**Date:** 2026-08-03

**Context:** The immersive views draw ~4,400 above-horizon stars plus figure lines and a Milky Way band, all needing cheap full redraws on every pan/zoom frame — but a few hundred bodies (planets, Moon, named stars, galaxies) need hit-testing, hover tooltips, focus, and selection. A pure-SVG approach (the old chart's model) would mean thousands of diffed DOM nodes re-laid-out per drag frame; pure-Canvas would mean hand-rolling hit-testing for every interactive body.

**Decision:** Render a hybrid: a `<canvas>` layer for the dense, non-interactive content (gradient, Milky Way, figure lines, starfield, horizon/cardinals) redrawn each frame, and an `<svg>` overlay for the interactive bodies, both driven by one shared view transform so they stay aligned. Pan/zoom repositions only the ~few-hundred SVG nodes (cheap attribute writes) and triggers one canvas redraw; a snapshot refresh reconciles SVG nodes by stable `type:name` key so bodies persist across the 60s poll.

**Consequences:**
- All pure projection/styling math lives in `public/projection.js` (unit-tested in the node env); pixels, DOM, and canvas live in `public/skyview.js`.
- jsdom's `canvas.getContext()` returns `null`, so `drawCanvas` is guarded to no-op there — the SVG overlay, toggle, and interaction remain fully testable in jsdom (`test/skyview.test.ts`), and the canvas draw path is exercised separately via a recording-context stub + `Path2D` shim (`test/skyviewCanvas.test.ts`), since no headless canvas library is installed.
- Starfield dots are batched into `Path2D` objects bucketed by opacity (one `fill` per bucket) to keep per-frame cost low; if pan/zoom ever feels janky on large starfields, that batching is the first knob.

## ADR-015: Vendor d3-celestial figure-line + Milky Way data (BSD-3), project server-side by RA/Dec

**Status:** Accepted
**Date:** 2026-08-03

**Context:** Constellation stick-figures need line topology (which points connect) that neither `astronomy-engine` nor the HYG catalog provides. Published figure-line datasets are commonly keyed by HIP number — but our `data/stars.json` drops every identifier (only `proper`/coordinates survive the build), which would have forced a catalog rebuild to add HIP.

**Decision:** Vendor d3-celestial's `constellations.lines.json` (as `data/constellation-lines.json`) and `milkyway.json` — both BSD-3-licensed GeoJSON, verified against the repo before use. Their vertices are keyed by `[RA°, Dec°]`, not HIP, so **no catalog rebuild is needed**: the server projects each vertex's RA/Dec straight to alt/az with the same rotation used for stars (ADR-016), keeping "client never computes positions." Confirmed the coordinate convention against a known star (vertex `[2.0969, 29.0904]` = Alpheratz), so `raDeg = lon<0 ? lon+360 : lon`, `dec = lat`, no sign flip. Figures resolve their 3-letter id to a full IAU name via a static `constellationNames.ts` map (88 names; "Ser" appears twice, Caput+Cauda).

**Consequences:**
- Figure segments fully below the horizon are dropped server-side (with one below-horizon anchor kept per boundary so the client clips the edge cleanly at the horizon); the Milky Way band is emitted whole and clipped visually on the client (it's a filled aesthetic layer). Each figure carries a label anchor at the circular-mean azimuth / mean altitude of its above-horizon vertices.
- Two new static data files must ship with the deploy (they are committed, not gitignored like the raw HYG CSV).

## ADR-016: Batch rotation-matrix projection for the starfield (and famous stars), fixing the J2000 precession gap

**Status:** Accepted
**Date:** 2026-08-03

**Context:** Emitting the full above-horizon starfield meant dropping the old `if (!star.proper) continue` filter, taking `Astronomy.Horizon()` calls from ~358 to ~8,920 per request. Separately, the existing famous-star path passed J2000 catalog coordinates straight into `Astronomy.Horizon()`, which expects equator-of-date — the documented "J2000 simplification" — introducing a ~0.3° precession error for epoch 2000→2026.

**Decision:** Add `makeHorizonProjector(observer, date)` (`src/sky/projectHorizon.ts`) that builds one `Rotation_EQJ_HOR` matrix up front, then projects each RA/Dec via `VectorFromSphere → RotateVector → HorizonFromVector` (no refraction) — far cheaper than a per-star `Horizon()` call, and correctly precessing J2000→date. Use it for the starfield, figure lines, and Milky Way, and **also** refactor `computeVisibleFamousStars` onto it. Verified the projector against textbook geometry (Polaris altitude ≈ latitude, due north) rather than against another library function.

**Consequences:**
- Full-snapshot request time measured at ~52 ms for the London fixture (starfield 4,401 stars, 43 figures up, 65 Milky Way polygons) — well within budget; measured, not assumed.
- Famous-star positions are now identical-projection with the figure lines and starfield, so a named star's SVG marker lands exactly on its figure-line vertex at any zoom (bright named stars are the figure anchors). This shifts famous-star positions by ~0.3° vs. the old behavior — a correctness improvement, tolerated by the existing tolerance-based visibility tests.
- Refraction is intentionally omitted (`null`) in the projector, matching `constellations.ts` and sidestepping the library's alt=90° refraction hang.

## ADR-017: The Moon counts as "something bright visible"

**Status:** Accepted
**Date:** 2026-08-03

**Context:** The spec's Sky Calculation requirement read: "If no catalog stars, planets, or curated galaxies are currently above the horizon, then the system shall return an explicit 'nothing bright visible right now' result." That list was written before the Moon existed in the output (ADR-013 added it). Once the Moon is computed and rendered, the original condition produces an outright false statement: a full Moon 40° above the horizon with no named star, planet, or curated galaxy up would still return "nothing bright visible right now" — while the app draws the single brightest object in the night sky.

**Alternatives Considered:**

### Leave the condition as spec'd (stars/planets/galaxies only)
- Pros: No spec edit; the shipped EARS requirement stays literally satisfied.
- Cons: The message becomes a lie in exactly the case a user would most notice — the Moon is the brightest and most obvious thing up there. Satisfying the letter of a requirement that predates the feature isn't correctness.
- Rejected: preserves a stale requirement at the cost of telling the user something visibly false.

### Add the Moon to the condition, and correct the spec (chosen)
- `computeSkySnapshot` sets the message only when `stars`, `planets`, `galaxies` are all empty **and** `moon === null` (`src/sky/snapshot.ts`).
- Spec's Sky Calculation requirement, API "Returns" description, and Edge Cases list updated to name the Moon alongside the other three.
- Pros: The message means what it says; spec and code agree again.
- Cons: One more term in a condition that now has to be kept in sync as bright objects are added — mitigated by `test/snapshot.test.ts` mocking every sub-module, so a new body that isn't wired into the condition shows up as a test gap rather than silently.

**Decision:** Include the Moon in the "nothing bright visible right now" condition and update `docs/spec.md` to match, because the Moon is the brightest object the app renders and excluding it would make the message factually wrong.

**Consequences:**
- `test/snapshot.test.ts` gained a "leaves the message null when only the Moon is up" case; the all-absent case now asserts `moon === null` too.
- Constellations still do **not** count toward the condition (unchanged from the original spec) — a constellation region being above the horizon says nothing about whether anything *bright* is up.
- Any future bright body added to the snapshot (a comet, ISS passes, more deep-sky objects) must be added to this condition and to the spec sentence at the same time.
