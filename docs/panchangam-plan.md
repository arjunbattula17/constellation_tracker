# Plan: Telugu Panchangam (Daily Almanac) Feature

> Status: **Proposed** — to be picked up after current work. No code written yet.
> Source of the idea: a Telugu daily Panchangam card (ManaPandit-style) — the "five limbs"
> plus derived auspicious/inauspicious timings, computed from location + date + time.

## What the card actually is

The reference is a **Panchangam** — the Hindu almanac's "five limbs" plus derived timings.
Decomposing a typical daily card into computable elements:

| Group | Elements on the card | Driven by |
|---|---|---|
| **Pancháng (5 limbs)** | Tithi (e.g. Krishna Dwadashi), Nakshatram (Krittika), Yogam (Ganda), Karanam (Kaulava), Vara (Shanivara) | Sun & Moon ecliptic longitudes |
| **Rise/Set** | Sunrise, Sunset, Moonrise, Moonset | `SearchRiseSet` |
| **Calendar header** | Samvatsara (Parabhava), Ayana (Uttarayana), Ritu (Greeshma), Masa (Jyeshtha) | Sun's sidereal longitude + lunar-month rules |
| **Inauspicious** | Rahu Kalam, Yamagandam, Durmuhurtham, Varjyam | Weekday tables over day-length + nakshatra |
| **Auspicious** | Abhijit, Brahma Muhurtham, Amrutha Kalam | Day/night muhurta divisions + nakshatra |

**Feasibility verdict:** ~80% of this is derivable from data astronomy-engine already exposes.
`Astronomy.MoonPhase(date)` returns the 0–360° Moon−Sun elongation, which *is* the tithi/karana
input, and the library ships the rise/set and phase-search functions the codebase simply hasn't
needed yet. No new ephemeris dependency is strictly required.

## The one architectural prerequisite: local time + day-scoping

This is the make-or-break item and should be Phase 0.

1. **Timezone.** Every "till 10:54 AM" and every muhurta window is a **local wall-clock** value at
   the *observer's* location — which may differ from the browser's. The app currently has none of
   this (`src/routes/skySnapshot.ts` takes an absolute `timestamp`; astronomy-engine treats it as
   UTC). We need lat/lon → IANA timezone. **See Decision D1.**

2. **Day-scoping.** The existing `/api/sky-snapshot` answers "what's up *right now*" (polled every
   few seconds). A panchangam answers "what governs *this local day*," anchored
   **sunrise-to-sunrise**. That's a different cadence and shape → propose a **separate endpoint**
   `GET /api/panchangam?lat&lon&date&tz?` returning a `Panchangam` object, not a bolt-on to the
   snapshot. Cleaner caching (changes ~4×/day, not every poll) and separable testing.

## Computation approach, grouped by difficulty

### Tier A — Foundation (new shared helper `src/sky/ephemeris.ts`)
- Sidereal ecliptic longitude of Sun & Moon:
  - Sun of-date: `Astronomy.SunPosition(date).elon`
  - Moon of-date: `Astronomy.EclipticGeoMoon(date).lon` (or `GeoVector` → `Ecliptic`)
  - Sidereal = of-date tropical − **ayanamsa** (Lahiri/Chitrapaksha ≈ 24.1° for 2026). **See D4.**
- Note a useful cancellation: **tithi and karana are longitude *differences*** (Moon−Sun), so
  ayanamsa cancels and they're ayanamsa-independent. **Nakshatra and yoga are absolute/sum**, so
  they *require* correct sidereal longitudes. Get this distinction right or nakshatra will be off
  by ~2 units.

### Tier B — Five limbs + end-times (the core value)
- Tithi = `floor((moon−sun) mod 360 / 12)` → 0–29 → paksha + name (e.g. Krishna Dwadashi = index 26).
- Nakshatra = `floor(moon_sidereal / 13.333°)` → 0–26 (Krittika = 2).
- Yoga = `floor((sun_sidereal + moon_sidereal) mod 360 / 13.333°)` → 0–26.
- Karana = `floor((moon−sun) mod 360 / 6°)` → 60 half-tithis → 11-name cycle.
- Vara = weekday of the **sunrise**, not midnight.
- **"till HH:MM" end-times** are the non-trivial part: root-find the instant each anga crosses its
  next boundary. Tithi/karana → `Astronomy.SearchMoonPhase(targetElongation, …)` directly.
  Nakshatra/yoga → a short bisection on the sidereal-longitude function over the day (no built-in).
  All returned as instants, formatted in the observer's tz.

### Tier B — Rise/Set (easy, currently unused)
- `Astronomy.SearchRiseSet(Body.Sun/Moon, observer, +1/−1, dayStart, 1)`.

### Tier C — Muhurta timings (rule-based, standard weekday tables)
- Split sunrise→sunset into 8 equal parts; assign by weekday lookup: **Rahu Kalam**, **Yamagandam**,
  **Gulika**. (Well-known tables, e.g. Rahu Kalam part index Sun=8, Mon=2, Tue=7, Wed=5, Thu=6,
  Fri=4, Sat=3.)
- **Abhijit** = 8th of 15 day-muhurtas (midday ±~24 min). **Brahma Muhurtham** = ~96–48 min before
  sunrise.

### Tier D — Calendar header + nakshatra-based windows (hardest, table-heavy edge cases)
- **Ayana**: from Sun's sidereal longitude (Makara→Karka Sankranti = Uttarayana). *Good test case:*
  July 11 reads **Uttarayana** sidereally even though it's past the June solstice — proves the
  sidereal/tropical distinction is implemented correctly.
- **Ritu** (season), **Masa** (lunar month, **Amanta** convention for Telugu, with **adhika-masa**
  leap-month handling — the genuinely fiddly bit), **Samvatsara** (60-year cycle → name table).
- **Varjyam / Amrutha Kalam / Durmuhurtham**: per-nakshatra fractional windows requiring nakshatra
  start/end times + lookup tables.

### Tier E — Frontend + localization
- New `<div class="panel">` in `public/index.html` `#lists`; render via the existing imperative-DOM
  idiom (`renderList`/`renderStats` style in `public/app.js` — there's no framework). Note: the
  frontend doesn't even render `moon` today, so there's no panel to copy — the stats/constellation
  panels are the template.
- Name tables in transliteration (Shanivara, Krittika…) and optionally Telugu script (శనివారం).
  **See D5.**

## Suggested phasing

- **Phase 0** — Timezone resolution + day-scoping + new `/api/panchangam` endpoint skeleton +
  `Panchangam` type. *(prerequisite)*
- **Phase 1** — Tier A ephemeris helper + Tier B five limbs **with end-times** + rise/set. This
  alone reproduces the top half of the card and is the 80/20 win.
- **Phase 2** — Tier C muhurta windows (Rahu/Yama/Gulika/Abhijit/Brahma).
- **Phase 3** — Tier D calendar header + varjyam/amrutha (accept adhika-masa as a known hard edge).
- **Phase 4** — Tier E panel + localization.

Phases 1–2 give near-full card parity; Phase 3 is where correctness risk and effort concentrate.

## Decisions to resolve before building (ADR-worthy)

- **D1 — Timezone source:** server-side lat/lon→tz library (`tz-lookup`, tiny; or `geo-tz`, accurate
  but ships shapefiles) **vs** client passes its offset. Server-side is correct when the queried
  location ≠ browser location. *Leaning `tz-lookup`.*
- **D2 — Build vs library:** hand-roll on astronomy-engine **vs** adopt an npm panchang lib
  (`mhah-panchang`, `vedic-astrology`). These ship their own ephemeris and vary in accuracy.
  Recommend a **~1-hour spike**: diff a candidate lib's output against a reference for ~5 dates
  before committing. Hand-rolling keeps the single-ephemeris (astronomy-engine) invariant.
- **D3 — Scope:** MVP = five limbs + rise/set (Phase 1 only), or full card parity (Phases 1–3)?
- **D4 — Ayanamsa & reference source:** must match whatever we verify against. Drik Panchang /
  ManaPandit (the card's source) use **Lahiri**. Pin one reference.
- **D5 — Masa convention & script:** Amanta (standard for Telugu) confirmed; Telugu script vs
  transliteration-only for v1.

## Verification (this is a "wrong is easy, users will notice" domain)

Treat it as **known-spec, verify-against-reference**, not TDD-from-guesses:
- Golden-file test: pick ~5 dates × 2 locations, record the expected
  tithi/nakshatra/yoga/karana/timings from **Drik Panchang or ManaPandit**, and assert the engine
  matches within a small tolerance (±a few minutes on transition times). Reuse the existing
  `test/visibility.test.ts` fixed-observer/fixed-date idiom.
- A real card makes a ready-made golden fixture, e.g. 2026-07-11 (Telugu region): Krishna Dwadashi
  till 2:05 AM, Krittika till 10:54 AM, Ganda till 11:47 PM, Kaulava till 3:46 PM, sunrise 5:48 /
  sunset 6:54.

## Effort & risk

Phase 0–1 is the bulk of the value and moderate (a few focused sessions); Phase 3 (adhika-masa,
varjyam tables) carries the real complexity tail. Biggest risk isn't the astronomy — it's the
calendar-convention edge cases and matching the chosen reference exactly.

## Codebase integration notes (as of this plan)

- Endpoint pattern to mirror: `src/routes/skySnapshot.ts` (`GET /api/sky-snapshot`, rate-limited,
  `lat`/`lon`/optional `timestamp`).
- Compute entry to mirror: `src/sky/snapshot.ts` `computeSkySnapshot(lat, lon, date)`.
- astronomy-engine version: `^2.1.19`. Sun/Moon **ecliptic longitudes and rise/set are not used
  anywhere yet** — this feature introduces them.
- Types live in `src/sky/types.ts`; add a `Panchangam` interface alongside `SkySnapshot`.
- Tests: `test/` (Vitest), fixed-observer/fixed-date idiom in `test/visibility.test.ts`.
