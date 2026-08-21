# Telugu Panchangam (Daily Almanac) — Spec & Build Plan

> Status: **Proposed** — to be picked up after current work.
> This is a self-contained plan for a *new feature* on top of the shipped Sky Snapshot app.
> It intentionally lives in its own file; the shipped app's plan is `docs/plan.md` (do not clobber).
> Generated from: this feature's decomposition (below). Date: 2026-08-03.

---

## Part 1 — Specification

### What the feature is
A Telugu daily **Panchangam** — the Hindu almanac's "five limbs" plus derived auspicious/inauspicious
timings, computed server-side from **location + date + time** and rendered as a panel alongside the
existing sky snapshot.

Decomposing a typical daily card into computable elements:

| Group | Elements | Driven by |
|---|---|---|
| **Pancháng (5 limbs)** | Tithi (e.g. Krishna Dwadashi), Nakshatram (Krittika), Yogam (Ganda), Karanam (Kaulava), Vara (Shanivara) | Sun & Moon ecliptic longitudes |
| **Rise/Set** | Sunrise, Sunset, Moonrise, Moonset | `SearchRiseSet` |
| **Calendar header** | Samvatsara (Parabhava), Ayana (Uttarayana), Ritu (Greeshma), Masa (Jyeshtha) | Sun's sidereal longitude + lunar-month rules |
| **Inauspicious** | Rahu Kalam, Yamagandam, Durmuhurtham, Varjyam | Weekday tables over day-length + nakshatra |
| **Auspicious** | Abhijit, Brahma Muhurtham, Amrutha Kalam | Day/night muhurta divisions + nakshatra |

**Feasibility:** ~80% is derivable from data astronomy-engine already exposes. `Astronomy.MoonPhase(date)`
returns the 0–360° Moon−Sun elongation (the tithi/karana input); `SearchRiseSet`, `SearchMoonPhase`,
`SunPosition`, `EclipticGeoMoon` are shipped but unused in the codebase today. No new ephemeris dependency
is strictly required.

### The one architectural prerequisite: local time + day-scoping
1. **Timezone.** Every "till 10:54 AM" and every muhurta window is a **local wall-clock** value at the
   *observer's* location (which may differ from the browser's). The app has none of this today —
   `src/routes/skySnapshot.ts` takes an absolute `timestamp` and astronomy-engine treats it as UTC. We
   need lat/lon → IANA timezone. **See D1.**
2. **Day-scoping.** `/api/sky-snapshot` answers "what's up *right now*" (polled every few seconds). A
   panchangam answers "what governs *this local day*," anchored **sunrise-to-sunrise**. Different cadence
   and shape → a **separate endpoint** `GET /api/panchangam?lat&lon&date&tz?`, not a bolt-on.

### Out of scope (v1)
- Rewriting the sky-snapshot endpoint or its polling model.
- Muhurtas beyond the reference card (choghadiya, hora, panchaka, etc.).
- Festivals / vratas / regional festival calendars.
- Historical/future dates far outside the ephemeris's accurate range.

### Key math notes (carry into implementation)
- **Ayanamsa cancels for differences, not sums.** Tithi and karana are `Moon−Sun` → ayanamsa-independent.
  Nakshatra (absolute Moon) and yoga (`Sun+Moon`) **require** correct sidereal longitudes. Get this wrong
  and nakshatra is off by ~2 units.
- Sidereal longitude = of-date tropical (`SunPosition().elon` / `EclipticGeoMoon().lon`) − **ayanamsa**
  (Lahiri/Chitrapaksha ≈ 24.1° for 2026).
- **"till HH:MM" end-times** need root-finding: tithi/karana via `Astronomy.SearchMoonPhase(targetElong…)`;
  nakshatra/yoga via a short bisection on the sidereal-longitude function over the day (no built-in).

---

## Part 2 — Build Plan

Each phase is a vertical slice completable and verifiable in one session. Phases grow one shared
`Panchangam` type and one compute module additively.

### Phase 1: Vertical Slice — Panchangam pipeline (Tithi + Nakshatra + Vara)
**Build:** Timezone resolution lat/lon→IANA (D1 — start with `tz-lookup`). New `src/sky/ephemeris.ts`
exporting shared helpers: `sunSiderealLon(date)`, `moonSiderealLon(date)`, and an exported
`ayanamsa(date)` (Lahiri) — exported because Phase 4 reuses it. New `src/sky/panchangam.ts` computing
tithi (paksha + name), nakshatra, and vara (local calendar weekday for now — Phase 2 refines to
sunrise-anchored) as **current values at the query instant**. Add a `Panchangam` interface to
`src/sky/types.ts` alongside `SkySnapshot`. New route `GET /api/panchangam?lat&lon&date?&tz?` mirroring
`src/routes/skySnapshot.ts` (same validation + rate limiter). Minimal frontend: a new
`<div class="panel">` in `public/index.html` and an imperative render in `public/app.js` showing the
three values plus the resolved local date.
**Verify:** Query a known location/date and compare tithi + nakshatra **names** against Drik Panchang /
ManaPandit. Query near a UTC-midnight boundary for an India location and confirm the **local date** maps
to the correct Indian day (proves tz + day-scoping).
**Test:** Golden-file unit test — fixed observer + fixed date, assert tithi index/name and nakshatra
index/name equal reference values (cite the reference in the test). Reuse coordinate-validation tests.
One supertest integration test hitting `/api/panchangam` end-to-end (frozen date).
**Done when:** The page shows a correct tithi/nakshatra/vara for a location, verified against a named
reference; validation + integration + golden tests pass.
**Risk:** Ayanamsa must match the chosen reference (D4); nakshatra is sidereal-sensitive. Pin D1 + D4
before starting.
**Status:** [ ] Not started

### Phase 2: Complete the five limbs + transition times + rise/set
**Build:** Add yoga and karana to `panchangam.ts`. Add end-time root-finding: `SearchMoonPhase` for
tithi/karana boundaries; a `bisectLongitudeCrossing()` helper for nakshatra/yoga. Expose each anga's
**start and end** instant (Phase 4's varjyam depends on nakshatra *start* too, not just end). Add
sunrise/sunset/moonrise/moonset via `Astronomy.SearchRiseSet`. Anchor the day to **sunrise** and finalize
vara as the weekday at sunrise (refines Phase 1's provisional midnight weekday — matters only between
midnight and sunrise). Extend `Panchangam` type + panel to show "till HH:MM" per limb and the four
rise/set tiles, all formatted in the observer's tz.
**Verify:** Compare all five limbs' end-times and the four rise/set times against reference within
±a few minutes, using a real card as the fixture (e.g. 2026-07-11, Telugu region: Krishna Dwadashi till
2:05 AM, Krittika till 10:54 AM, Ganda till 11:47 PM, Kaulava till 3:46 PM, sunrise 5:48 / sunset 6:54).
**Test:** Golden-file assertions on end-times (with a tolerance) and rise/set. Add a boundary case: an
anga whose end crosses local midnight, and confirm it's labelled with the right day/time.
**Done when:** The card's top half + rise/set are reproduced within tolerance; tests pass.
**Risk:** Root-finding correctness at wraparound (359°→0°). Rise/set can be absent at high latitudes —
handled in Phase 5.
**Status:** [ ] Not started

### Phase 3: Muhurta timings (rule-based)
**Build:** A day-length division helper (sunrise→sunset in 8 or 15 parts). Compute Rahu Kalam,
Yamagandam, Gulika, Durmuhurtham, Abhijit, and Brahma Muhurtham via the standard weekday lookup tables
(e.g. Rahu Kalam part index Sun=8, Mon=2, Tue=7, Wed=5, Thu=6, Fri=4, Sat=3). Render "Auspicious" and
"Inauspicious" sections in the panel. (Varjyam + Amrutha Kalam are nakshatra-fraction based → deferred to
Phase 4.)
**Verify:** Compare each window against a reference across **several different weekdays** (the weekday
tables are the failure surface, not the arithmetic).
**Test:** Table-driven unit tests: for each weekday, assert Rahu/Yama/Gulika land in the correct day-part;
assert Abhijit brackets local midday and Brahma Muhurtham precedes sunrise.
**Done when:** All rule-based windows match the reference across every weekday; tests pass.
**Depends on:** Phase 2 (needs sunrise/sunset).
**Status:** [ ] Not started

### Phase 4: Calendar header + nakshatra-window timings (hard edges)
**Build:** Ayana (from Sun's sidereal longitude — Makara→Karka Sankranti = Uttarayana), Ritu, Masa
(**Amanta** convention for Telugu, incl. **adhika-masa** leap-month handling), Samvatsara (60-year cycle
→ name table). Varjyam + Amrutha Kalam via per-nakshatra fraction tables applied to the nakshatra
start/end times exposed in Phase 2. Render the calendar header + the remaining timing rows. Reuse the
exported `ayanamsa()` from Phase 1.
**Verify:** Masa across an ordinary month **and** an adhika-masa year; Samvatsara name against reference;
Varjyam/Amrutha against reference. Include the "July reads Uttarayana sidereally despite the June
solstice" case as a deliberate sidereal-correctness check.
**Test:** Golden-file including an adhika-masa date and an ayana-boundary date. Assert masa name, ayana,
samvatsara.
**Done when:** Full card parity reached; adhika-masa either handled or explicitly documented as a known
limitation; tests pass.
**Depends on:** Phase 2 (nakshatra start/end times) and Phase 1 (sidereal longitude helpers). Can run in
parallel with Phase 3.
**Risk:** Highest of all phases — adhika-masa rules and regional convention differences.
**Status:** [ ] Not started

### Phase 5: Polish & Harden
**Build:** Localization — transliteration plus optional Telugu script (D5). Edge-case handling:
high-latitude no-sunrise days (panchangam degenerate — degrade gracefully, don't crash), DST-transition
days, `date` param format variants. Per-local-day response caching (values change ~4×/day, not per poll).
Accessibility pass on the panel. README section + `docs/decisions.md` ADRs recording D1–D5 as resolved.
**Verify:** Query a polar latitude (e.g. 78°N in summer, no sunrise) and confirm graceful degradation;
query a DST-transition day; query across a tz boundary. Run all three gates: `npm test`, `npm run lint`,
`npm run build`.
**Test:** Edge-case tests — polar no-rise, DST day, tz-boundary date. All three gates green.
**Done when:** Feature degrades gracefully on edge cases, is localized, and is documented; test + lint +
build all pass.
**Depends on:** All prior phases.
**Status:** [ ] Not started

---

## Dependencies
- **Phase 2** depends on Phase 1 (ephemeris helpers + `/api/panchangam` + `Panchangam` type).
- **Phase 3** depends on Phase 2 (needs sunrise/sunset).
- **Phase 4** depends on Phase 2 (nakshatra start/end) and Phase 1 (sidereal helpers).
- **Phase 3 and Phase 4 can run in parallel** after Phase 2.
- **Phase 5** depends on all prior phases.

## Cross-phase integration issues caught (and fixed in this plan)
1. **Nakshatra start-time exposure.** Phase 4's Varjyam/Amrutha need the nakshatra *start* instant, not
   only its end. Phase 2's "Build" was amended to expose **both** start and end per anga.
2. **Shared ayanamsa helper.** Phase 4 (ayana/masa) reuses the same ayanamsa Phase 1 introduces for
   nakshatra. Phase 1's `ayanamsa(date)` is specified as an **exported** helper so Phase 4 doesn't
   re-derive it (risking a mismatch with the reference).
3. **Vara anchor conflict.** Phase 1 computes vara from the local calendar weekday, but a true panchangam
   anchors the day to **sunrise** (which Phase 1 lacks — rise/set arrives in Phase 2). Rather than a
   silent conflict, Phase 1's vara is explicitly **provisional** and Phase 2 finalizes it; the only
   affected window is midnight→sunrise.

## Decisions to resolve before/at Phase 1 (ADR-worthy — record in `docs/decisions.md`)
- **D1 — Timezone source:** `tz-lookup` (tiny) vs `geo-tz` (accurate, ships shapefiles) vs client-passed
  offset. *Leaning `tz-lookup`; pin before Phase 1.*
- **D2 — Build vs library:** hand-roll on astronomy-engine vs an npm panchang lib (`mhah-panchang`,
  `vedic-astrology`). Recommend a ~1-hour spike diffing a candidate against a reference before Phase 1.
  Hand-rolling preserves the single-ephemeris (astronomy-engine) invariant.
- **D3 — Scope:** MVP = Phases 1–2 (five limbs + rise/set), or full card parity (through Phase 4)?
- **D4 — Ayanamsa & reference:** must match whatever we verify against. Drik Panchang / ManaPandit use
  **Lahiri**. Pin one reference source before Phase 1.
- **D5 — Masa convention & script:** Amanta (standard for Telugu) confirmed; Telugu script vs
  transliteration-only for v1 (resolve at Phase 5).

## Verification philosophy
This is a "wrong is easy, users will notice" domain → treat it as **known-spec, verify-against-reference**,
not TDD-from-guesses. Golden-file tests against Drik Panchang / ManaPandit for a few dates × locations,
tolerance of ±a few minutes on transition times. Reuse the fixed-observer/fixed-date idiom in
`test/visibility.test.ts`. Prefer acceptance criteria stated as observable behavior against a real
reference over "tests pass."

## Codebase integration notes (as of this plan)
- Endpoint to mirror: `src/routes/skySnapshot.ts` (`GET /api/sky-snapshot`, rate-limited, lat/lon/optional
  `timestamp`).
- Compute entry to mirror: `src/sky/snapshot.ts` `computeSkySnapshot(lat, lon, date)`.
- astronomy-engine `^2.1.19`. Sun/Moon **ecliptic longitudes and rise/set are unused today** — this
  feature introduces them.
- Types: `src/sky/types.ts` (add `Panchangam` alongside `SkySnapshot`).
- Frontend: static vanilla, imperative DOM in `public/app.js` (`renderList`/`renderStats` idiom); panels
  are static markup in `public/index.html` `#lists`. Note the frontend doesn't render `moon` today, so
  there's no existing panel to copy — the stats/constellations panels are the template.
- Tests: `test/` (Vitest); golden idiom in `test/visibility.test.ts`.

## Next step
Run `/construct` to start building **Phase 1**. Resolve **D1** and **D4** first (they block Phase 1).
