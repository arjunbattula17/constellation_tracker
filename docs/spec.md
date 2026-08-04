# Sky Snapshot — Specification

## Problem & Intent
Existing sky-mapping tools (Stellarium, SkySafari, Star Walk, timeanddate.com) require an install, an account, or wade through more features than a casual visitor needs. Sky Snapshot is a public web app: no install, no account — enter a place, see what's aligned in the sky right now, named plainly (constellations, famous stars, visible planets, a few famous galaxies).

Secondary differentiator: framing the output as a named "alignment" — the set of things visible together at that place and moment — rather than a generic star chart.

## Users & Context
Public web product. v1 success bar is modest: a handful of people try it and find it fun/useful — not scale or retention. Timeline goal is a working v1 in days, not months, though two decisions below (full IAU-88 boundary math, full star catalog) add real implementation time against that goal — see Open Questions.

## MVP Scope
> **Visual direction revised (2026-08-03):** the original "horizontal strip/mini chart"
> output below was superseded by a full-immersive sky map — a circular all-sky view and a
> pannable landscape horizon view (toggle), with real constellation figures, a full
> starfield, the Moon, and a Milky Way band. See ADR-013–016 in `docs/decisions.md`. The
> scope items below (what's computed and shown) still hold; only the presentation changed.

- Place input: "Use my location" (browser Geolocation API) as the primary path, with a manual latitude/longitude fallback.
- Time: **current time only**. No date/time picker in v1 (deferred — see Out of Scope).
- On first page load, before the user does anything: render a demo sky for a fixed default location/time so the page is never empty.
- Output: a horizontal strip/list view with a small mini chart, showing:
  - Currently visible constellations (full IAU-88 set, via precise boundary-polygon horizon determination)
  - Currently visible famous/named bright stars
  - Currently visible naked-eye planets (Mercury, Venus, Mars, Jupiter, Saturn)
  - A small curated set of famous galaxies where visible (e.g. Andromeda/M31, Triangulum/M33)
- Server-side calculation (client never computes positions itself).
- Basic API rate limiting from v1 (public-facing, so minimal abuse protection ships from the start).

### Out of Scope
- **Any date/time input (past/future)** — v1 is "right now" only. Deferred to a fast-follow once the current-time flow is validated.
- **Casual/Serious depth toggle** — v1 ships one depth level (the MVP list above). Deferred.
- **Mobile app / AR camera overlay** — web only for v1.
- **Conjunction/alert notifications** — different product shape (push service); not this app's v1 job.
- **User accounts, saved locations, or history** — stateless, single-lookup only.
- **Full deep-sky object catalog** — only the small curated galaxy list above; no general nebulae/cluster catalog.
- **Social sharing.**
- **Free-text geocoded place search** — v1 only supports geolocation + manual lat/long entry, not typing a city name.

## Requirements (EARS format)

### Sky Calculation
- When the server receives a valid latitude, longitude, and timestamp, the system shall compute the current altitude/azimuth of naked-eye planets and catalog stars for that place and time.
- The system shall determine visible constellations using precise IAU-88 constellation boundary polygons intersected with the local horizon (altitude ≥ 0°) at the given place and time, not a star-sampling approximation.
- The system shall classify each catalog star's constellation membership using its right ascension/declination against the IAU-88 boundaries.
- Where a star has a common/proper name in the catalog, the system shall mark it as "famous" and include it by name in the output.
- The system shall include a naked-eye planet (Mercury, Venus, Mars, Jupiter, Saturn) in the output only when its computed altitude is ≥ 0° at the given place and time.
- The system shall include a curated galaxy (e.g. Andromeda, Triangulum) in the output only when its computed altitude is ≥ 0° at the given place and time.
- If no catalog stars, planets, curated galaxies, or the Moon are currently above the horizon, then the system shall return an explicit "nothing bright visible right now" result rather than an empty/ambiguous response. (The Moon was added to this condition when it entered the output — see ADR-017.)

### Place Input
- When the user clicks "Use my location," the system shall request the browser Geolocation API and, on success, use the returned coordinates and the current time to fetch a sky snapshot.
- If geolocation is denied or unavailable, then the system shall reveal a manual latitude/longitude entry form with an inline explanatory message.
- When the user submits manual latitude/longitude, the system shall validate that latitude is between -90 and 90 and longitude is between -180 and 180 before sending the request.
- If manual latitude/longitude fails validation, then the system shall show an inline error and shall not send a request to the server.

### Page Load
- When the page loads with no user-provided location yet, the system shall render a demo sky snapshot for a fixed default location and the current time.

### API Reliability
- The system shall apply IP-based rate limiting to the sky-snapshot API endpoint.
- If a client exceeds the rate limit, then the system shall respond with HTTP 429 and the frontend shall show a friendly "too many requests, try again shortly" message.
- If the sky calculation fails on the server for any reason, then the system shall respond with a generic error and the frontend shall show a friendly "couldn't calculate the sky right now, try again" message, without exposing internal error details.

### Get Sky Snapshot
When the client requests a sky snapshot, the system shall return the currently visible constellations, famous stars, naked-eye planets, and curated galaxies for the given place and time.
**Accepts:** latitude (number, -90 to 90), longitude (number, -180 to 180), timestamp (defaults to server "now" if omitted)
**Returns:** JSON with lists of visible constellations (name), famous stars (name, alt/az, constellation), visible planets (name, alt/az), visible curated galaxies (name, alt/az), and a `message` field (string, or `null`) carrying the explicit "nothing bright visible right now" text when stars/planets/galaxies are all empty and the Moon is below the horizon. The immersive sky map (ADR-013) adds `starfield`, `constellationLines`, `moon`, and `milkyway` to this response
**Errors:**
- Latitude/longitude out of range → HTTP 400 with validation message
- Rate limit exceeded → HTTP 429
- Internal calculation failure → HTTP 500 with generic message

## User Flows

**Primary flow:**
1. User opens the page → sees a demo sky snapshot (fixed default location, current time) immediately — the page is never empty.
2. User clicks "Use my location."
3. Browser prompts for geolocation permission.
   - **Granted:** app fetches a new sky snapshot for the user's real coordinates and current time, and re-renders the strip/mini chart and lists.
   - **Denied/unavailable:** app shows an inline message ("Location unavailable — enter coordinates manually") and reveals lat/long fields.
4. (Fallback) User types latitude/longitude and submits → client validates ranges → app fetches and renders the snapshot for those coordinates.
5. Result view: a horizontal strip/mini chart with plotted dots for visible famous stars/planets/galaxies (labeled), alongside a text list of currently visible constellations.

**Error flows:**
- Manual lat/long out of range → inline validation error, no request sent.
- Server rate-limits the request → friendly "too many requests" message, no crash.
- Server calculation fails → friendly generic error message, no internal details leaked.
- Nothing bright currently above horizon (no stars, planets, galaxies, or Moon) → explicit "nothing bright visible right now" state, not a blank screen.

## Data Model
- **Star catalog:** an open catalog (e.g. HYG database) filtered to naked-eye magnitude (≤ ~6.5), retaining proper/common name where present (used as the "famous star" flag), right ascension, declination, and magnitude.
- **Constellation boundaries:** the official IAU-88 constellation boundary point data, used for precise boundary-polygon horizon determination (not a curated subset).
- **Curated galaxies:** a small hardcoded list (name, right ascension, declination) — e.g. Andromeda (M31), Triangulum (M33) — not sourced from a general deep-sky catalog.
- **No persistent storage:** user-submitted or geolocated coordinates are used in-memory for the single request only and are never logged or stored server-side.

## External Dependencies
- `astronomy-engine` (npm, MIT-licensed) — Sun/Moon/planet position calculations and RA/Dec ↔ Alt/Az conversion.
- An open star catalog dataset (e.g. HYG database) bundled with or fetched by the server.
- IAU-88 constellation boundary dataset (publicly available boundary point data).
- Browser Geolocation API (client-side, no server dependency).

## Technical Decisions
- **Backend:** Node.js + TypeScript, a small API server (Express or Fastify) performing all sky calculations server-side. *Rationale:* keeps the client thin, matches the "server-side calculation" decision, and is fast to stand up for a v1 timeline.
- **Astronomy library:** `astronomy-engine`. *Rationale:* pure JS/TS, no native dependencies, actively maintained, MIT license, handles the Sun/Moon/planet math this app needs.
- **Frontend:** a lightweight client (plain HTML/CSS/TS or a minimal Vite app) rendering the horizontal strip/mini chart via SVG or Canvas. *Rationale:* the chosen visual style (simple strip, not a full planetarium chart) doesn't need a heavy charting framework.
- **Deployment:** single service serving both the static frontend and the API from one process. *Rationale:* simplest possible hosting story (one deploy, no CORS split) given "no strong hosting preference, keep it simple."
- **Rate limiting:** IP-based throttling middleware (e.g. `express-rate-limit`) on the sky-snapshot endpoint from v1.
- **Default demo location:** a fixed constant (place + "current server time") shown on first load before the user provides their own location — exact city is a cheap, reversible choice to make during build, not a blocking spec decision.

## Boundaries
- **Always:** validate latitude/longitude ranges server-side (never trust client-side validation alone); keep user location in-memory only, never logged or persisted; run tests before commits.
- **Ask first:** adding any paid third-party API/data dependency or one requiring billing/API keys; changing the hosting/deployment target; changing the astronomy calculation library.
- **Never:** commit API keys or secrets; log raw user coordinates beyond the single request's processing; persist user location server-side; add user accounts/tracking without this being revisited explicitly (it's out of scope by design).

## Edge Cases & Error Handling
- Geolocation denied/unavailable → manual entry fallback with inline message (specified above).
- Invalid manual lat/long → inline validation error, no request sent.
- Nothing bright currently above the horizon → explicit "nothing visible right now" state.
- Backend/library calculation error → generic friendly error, no internal details exposed.
- Rate limit exceeded → HTTP 429, friendly frontend message.

## Open Questions
- **Timeline risk — largely resolved (2026-08-02):** originally flagged as the biggest risk to the "days, not months" goal, since it implied sourcing/parsing a separate IAU-88 boundary dataset and hand-rolling boundary-polygon/horizon intersection math. During Phase 2 planning, live prototyping found `astronomy-engine` already bundles the official IAU-88 boundary data and exposes it via `Constellation(ra, dec)` — no external dataset needed. See `docs/plan.md` Phase 2 for the verified grid-sampling approach, timing (~15ms/request), and two real gotchas found along the way (a library hang at exactly alt=90° with refraction correction, and 3 misspelled constellation names in the library's own name table).
- Exact default demo location/city for first page load — deferred to build time as a cheap, reversible constant.
- Exact visual design of the horizontal strip/mini chart (spacing, iconography, labeling density) — needs a design pass during build, not fully specified here.

---
When you're happy with this spec, run `/blueprint` to create the phased build plan.
