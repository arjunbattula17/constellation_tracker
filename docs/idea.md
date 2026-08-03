# Sky Snapshot (working name) — Constellation & Alignment Tracker

## Problem Statement
How might we let anyone enter a place and time and instantly see a visual sky map of which constellations, stars, and planets are aligned/visible overhead — with enough depth to serve both casual stargazers and serious amateur astronomers?

## Considered Directions
Three directions came out of divergent exploration:

- **A — Sky Snapshot (recommended):** A web app where you input place + any date/time and get a rendered 2D sky map — constellation lines, labeled bright/famous stars, visible planets — with a Casual/Serious toggle controlling depth of detail. This is the direct realization of the original idea.
- **B — Alignment Alert (inversion/simplification):** Narrower scope — instead of a general sky map, the app only surfaces notable planetary conjunctions/syzygies ("tonight: Venus and Jupiter align"). Simpler to build but answers a different question than "what's up right now" — more of a notification service than a tracker.
- **C — AR Sky Companion (10x/combination):** Mobile-first, point your phone at the sky for a live AR overlay, plus a shareable "sky fingerprint" card for a given place/time. Compelling, but a much bigger tech lift (AR, device sensors, app store distribution) with no evidence yet that the core value prop needs it.

## Recommended Direction
Go with **A — Sky Snapshot**. It's the most direct match to what was described (place + time → named alignment + famous objects), it's buildable as a stateless web app with existing open astronomy data/libraries, and it naturally supports both audiences named by the user via a single depth toggle rather than two separate products. B and C are real ideas worth revisiting later — B as a "phase 2" notification feature, C as a possible native/mobile follow-up once the web version validates that people actually want this — but neither should gate the first version.

## Key Assumptions to Validate
- [ ] An existing open-source astronomy library (e.g. `astronomy-engine`, VSOP87-based JS libs, or a public ephemeris API) can compute accurate star/planet positions for arbitrary place + date/time client-side or via a lightweight backend, without needing a paid data license — validate with a throwaway calculation prototype.
- [ ] A free/open star catalog (e.g. Yale Bright Star Catalog, HYG database) has enough common-name metadata to label "famous stars" — validate by sampling the catalog for name coverage.
- [ ] A single Casual/Serious toggle is enough to satisfy both audiences without fragmenting the UX into two products — validate with a quick prototype shown to a few people from each audience.
- [ ] "Alignment" as understood by users means *the current visible arrangement of constellations/stars/planets from a place and time*, not strict astronomical conjunction/syzygy — validate by testing the term with a few target users before committing to it in the UI.

## MVP Scope
**In:**
- Place input (search/geocode to lat/long + timezone)
- Date/time input, defaulting to "now," but supporting any past/future date
- Computed visible sky rendered as a 2D star chart (canvas/SVG) with constellation line overlays
- Labels for bright/famous stars and visible planets
- Casual/Serious toggle (Casual = plain-language, curated famous objects only; Serious = magnitudes, more stars/constellations, coordinates)
- A small curated set of famous galaxies (e.g. Andromeda, Triangulum) shown where visible, to satisfy the "galaxies" part of the ask without a full deep-sky catalog

**Out (for MVP):**
- Mobile app / AR camera overlay
- Push notifications or alerts for conjunctions
- User accounts, saved locations, or history
- Full deep-sky object catalog (thousands of galaxies/nebulae)
- Social sharing

## Not Doing (and Why)
- **Native mobile AR (Direction C)** — big scope increase (device sensors, app store distribution); the web version should validate the core value prop first.
- **Conjunction/alert notifications (Direction B)** — a different product shape (push/notification service) than "tracker for a given place and time"; worth revisiting as a phase 2 feature, not a blocker for v1.
- **Full deep-sky catalog** — casual users don't need thousands of galaxies, serious users can get that from dedicated tools (Stellarium, etc.); a small curated list covers the stated requirement.
- **User accounts/saved history** — no evidence yet this is needed; MVP is a stateless single lookup (enter place + time, get a snapshot).

## Open Questions
- Which astronomy calculation library or data source to standardize on (accuracy vs. licensing vs. bundle size)?
- Should "Serious" mode include telescope-relevant data (limiting magnitude, altitude/azimuth, rise/set times)?
- Timezone handling — auto-resolve from the place input, or let the user specify explicitly?
- How exactly is "famous" defined for labeling purposes — a curated allowlist, a magnitude/brightness threshold, or both?

---
When the idea is sharp enough, run `/discover` to write the full spec.
