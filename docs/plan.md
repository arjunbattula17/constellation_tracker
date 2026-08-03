# Sky Snapshot — Build Plan

Generated from: docs/spec.md
Date: 2026-08-02

## Phase 1: Vertical Slice — Sky Data Pipeline
**Build:** Node.js + TypeScript Express server; integrate `astronomy-engine` for Sun/Moon/naked-eye-planet alt-az calculation; load a static HYG star catalog subset (magnitude ≤ 6.5, retaining proper/common name where present) from a bundled data file; hardcode a curated galaxy list (Andromeda/M31, Triangulum/M33) with RA/Dec; implement `GET /api/sky-snapshot` accepting lat/long/optional timestamp, validating lat (-90..90) and long (-180..180) with 400 on failure, computing visible (alt ≥ 0°) planets/stars/galaxies, and returning constellations as an empty placeholder list for now; add `express-rate-limit` on the endpoint (429 on exceed); generic 500 with no internal details on calculation failure; minimal static frontend that calls the API for a hardcoded default location + current time and renders the returned stars/planets/galaxies as a plain list. The frontend fetch function must accept (lat, long, timestamp) as parameters even though only the default constant is passed in this phase, so Phase 3 can wire real input without refactoring it.
**Verify:** Run the server locally, load the page, and see a real, currently-accurate list of visible famous stars/planets/galaxies for the default location — spot-check 1-2 entries against a reference (Stellarium web or in-the-sky.org). Hit the endpoint with an out-of-range latitude and confirm 400. Hit it rapidly and confirm 429 after the threshold. Confirm no location data appears in server logs.
**Test:** Unit tests for the alt/az visibility-filtering logic against known RA/Dec + lat/long/time fixtures (including the alt=0° boundary). Unit tests for lat/long input validation. One frozen-time integration test hitting the endpoint end-to-end and asserting the expected set of visible objects.
**Done when:** Loading the frontend shows a correct, live list of visible stars/planets/galaxies for the default location; invalid input and rate-limit paths return the correct HTTP codes; all tests pass.
**Status:** [x] Complete — 2026-08-02

## Phase 2: Constellation Visibility
**Build:** Source an IAU-88 constellation boundary vertex dataset. Implement boundary-edge/horizon intersection to determine, for each of the 88 constellations, whether any part of its boundary is above the horizon (alt ≥ 0°) at the given time/location. Classify each catalog star's constellation membership using the same boundary data (reuse `astronomy-engine`'s built-in `Constellation()` function if it fits the need, rather than hand-rolling point-in-polygon classification). Extend the `/api/sky-snapshot` response to populate the constellations list and tag each famous star with its constellation. Update the frontend list to show constellation names.
**Verify:** Compare the API's visible-constellation output against a reference source (Stellarium web or in-the-sky.org) for at least 3 different place/time combinations. Confirm famous star entries carry the correct constellation tag (e.g. Sirius → Canis Major). Confirm the endpoint doesn't crash or misbehave when almost nothing is above the horizon (e.g. daytime input).
**Test:** Unit tests for the boundary-horizon intersection function against known true/false visibility cases. Unit test for star-to-constellation classification against a handful of known stars.
**Done when:** The constellation list matches a trusted reference source for 3+ spot-checked place/time combinations, and star constellation tags are correct.
**Flagged risk / fallback:** This is the highest-risk phase for the "days, not months" timeline (per spec Open Questions). If full boundary-polygon math proves too slow to get right, the documented fallback is descoping to a star-sampling approximation (mark a constellation visible if any of its named/bright stars are above the horizon) — a conscious, called-out descope, not a silent one.
**Status:** [ ] Not started

## Phase 3: Real Location Input
**Build:** Add a "Use my location" button using the browser Geolocation API, wired to Phase 1's parameterized fetch function. On denial/unavailability, reveal a manual latitude/longitude form with an inline explanatory message. Validate manual lat/long ranges client-side before submitting, showing an inline error on failure without sending a request. Page load continues to show the Phase 1 default/demo snapshot first, unaffected.
**Verify:** Click "Use my location," grant permission, and confirm the snapshot updates to the real location. Deny permission and confirm the fallback form + message appear. Submit an out-of-range manual coordinate and confirm an inline error with no request sent. Submit a valid manual coordinate and confirm the snapshot updates correctly.
**Test:** Unit tests for client-side lat/long range validation. Geolocation grant/deny flows are not meaningfully unit-testable — documented as a manual browser verification checklist instead.
**Done when:** A real user can get their own location's sky snapshot via geolocation or manual entry, with correct fallback and validation behavior.
**Status:** [ ] Not started

## Phase 4: Visual Mini Chart
**Build:** Replace the plain list rendering of stars/planets/galaxies with a horizontal strip/mini chart (SVG or Canvas), plotting labeled dots positioned using the alt/az values already returned by the API. Constellation names continue to be shown as a text list alongside the chart (no constellation line art, per the spec's simplified visual choice).
**Verify:** Visually confirm the chart renders correctly labeled, positioned dots that stay consistent with the underlying API data across the default, geolocation, and manual-entry input paths from Phases 1-3.
**Test:** Pure-function unit test for the dot-positioning logic given a fixed API response fixture (no browser required).
**Done when:** The chart view fully replaces the plain-list-only view across all input paths, with correctly labeled and positioned objects.
**Status:** [ ] Not started

## Phase 5: Polish & Harden
**Build:** Explicit "nothing visible right now" state at both the API level (empty result) and the chart/constellation-list rendering. Friendly frontend messages for 429 (rate limited) and 500 (calculation failure) responses matching the spec's wording. Audit server code/logs to confirm user location coordinates are never logged or persisted. Basic deployment configuration for a single-process host (static frontend + API together) plus a README with run instructions. Final line-by-line walkthrough of spec.md's EARS requirements against the running app, fixing any gaps found. Carried over from Phase 1 review: configure `app.set('trust proxy', ...)` so `express-rate-limit` keys on the real client IP instead of a shared proxy/load-balancer IP once deployed behind one; add `helmet` for baseline security headers (public-facing per spec, currently absent).
**Verify:** Manually force each error/edge path (a location/time with nothing above the horizon, exceeding the rate limit, a triggered calculation exception) and confirm the correct friendly behavior. Walk every EARS requirement in the spec against the live app.
**Test:** Test for the "nothing visible" API response shape. Tests confirming error responses contain no internal details (no stack traces or exception messages leaked).
**Done when:** All explicit error/edge states from the spec are handled and verified live; the spec walkthrough finds no gaps; the app runs end-to-end from documented steps.
**Status:** [ ] Not started

## Dependencies
- Phase 2, Phase 3, and Phase 4 each depend only on Phase 1 (not on each other) — they can be built in parallel once Phase 1 ships.
- Phase 5 depends on Phases 1-4 all being complete.
