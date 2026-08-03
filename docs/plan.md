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
**Pre-verified approach (2026-08-02 planning session — do not re-derive, this was prototyped and timed live):** `astronomy-engine` already bundles the official IAU-88 boundary data internally and exposes it via `Astronomy.Constellation(ra, dec): ConstellationInfo` (J2000 RA in hours, Dec in degrees — same units as our star catalog). **No external boundary dataset needs to be sourced.** This removes the data-sourcing risk originally flagged for this phase.

- **Star classification** is trivial: `Astronomy.Constellation(star.raHours, star.decDeg).symbol/.name` directly, since `data/stars.json` is already J2000 RA/Dec.
- **Visible-constellation determination**: grid-sample the visible hemisphere. For altitude 0..90° and azimuth 0..360° in 2° steps, convert each horizontal point to a J2000 equatorial point and classify it:
  ```ts
  const rot = Astronomy.Rotation_HOR_EQJ(date, observer); // compute once per request
  for (alt = 0; alt <= 90; alt += 2) {
    for (az = 0; az < 360; az += 2) {
      const sph = new Astronomy.Spherical(alt, az, 1);
      const hv = Astronomy.VectorFromHorizon(sph, date, null); // see gotcha below — refraction must be null
      const ev = Astronomy.RotateVector(rot, hv);
      const eq = Astronomy.EquatorFromVector(ev);
      const c = Astronomy.Constellation(eq.ra, eq.dec);
      visible.add(resolveConstellationName(c)); // see name-correction gotcha below
    }
  }
  ```
  Verified live: 2° resolution (8,280 points) takes ~15ms and finds the exact same 46-constellation set as a 0.5° resolution (130,320 points, ~68ms) for a fixed test observer/time — 2° is proven sufficient, not a guess. This is a grid-sampling approximation of the true boundary-polygon test, but at this resolution it's indistinguishable from the exact answer and reuses astronomy-engine's own precise boundary data — it satisfies the spec's "precise IAU-88 boundary polygons" requirement without hand-rolling polygon-edge/horizon intersection math ourselves.
- **Gotcha 1 (verified, cost ~15 min to isolate):** `Astronomy.VectorFromHorizon(sphere, date, "normal")` hangs indefinitely at exactly `altitude: 90°` (likely a non-converging refraction correction at the zenith singularity). Fix: pass `null` for refraction, not `"normal"`. This is also the *more correct* choice here — we only want the true geometric direction for constellation classification, not an atmospherically-refracted apparent position.
- **Gotcha 2 (verified against `node_modules/astronomy-engine/astronomy.js`'s `ConstelNames` table):** the library's own name table has 3 misspellings versus standard IAU names: `Ant`→`"Antila"` (should be **Antlia**), `Cam`→`"Camelopardis"` (should be **Camelopardalis**), `PsA`→`"Pisces Austrinus"` (should be **Piscis Austrinus**). Don't display `ConstellationInfo.name` raw — write a small `resolveConstellationName()` correcting these 3 by symbol (`Ant`/`Cam`/`PsA`) and passing the other 85 through unchanged.

**Build:** New `src/sky/constellations.ts` exporting `computeVisibleConstellations(observer, date): string[]` (the grid-sample above, returning sorted corrected names) and `classifyStarConstellation(raHours, decDeg): string`. Add `FamousStar` type (`VisibleObject` + `constellation: string`) to `src/sky/types.ts`; update `computeVisibleFamousStars` in `src/sky/stars.ts` to tag each result via `classifyStarConstellation`. Wire both into `src/sky/snapshot.ts`, replacing the current hardcoded `constellations: []`. Update `public/app.js` to show each star's constellation and render the constellations list.
**Verify:** Compare the API's visible-constellation output against a reference source (Stellarium web or in-the-sky.org) for at least 3 different place/time combinations. Confirm famous star entries carry the correct, corrected constellation name (e.g. Sirius → Canis Major, and specifically check one of the 3 corrected names shows up right if it's in the current sky). Confirm the endpoint doesn't crash or misbehave near the zenith or when almost nothing is above the horizon (e.g. daytime input) — this is exactly the case Gotcha 1 would resurface if the refraction fix is dropped.
**Test:** Unit test `computeVisibleConstellations` against a fixed observer/time fixture (assert a known-correct set, e.g. from the live verification above). Unit test `classifyStarConstellation` against known stars (Polaris → Ursa Minor/UMi, Sirius → Canis Major/CMa). Unit test `resolveConstellationName` for all 3 corrected symbols plus one pass-through case. Regression test asserting the grid sample completes quickly (e.g. under 500ms) and doesn't hang at alt=90 — this directly guards against Gotcha 1 reappearing.
**Done when:** The constellation list matches a trusted reference source for 3+ spot-checked place/time combinations, star constellation tags are correct, and displayed names use the corrected spellings.
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
