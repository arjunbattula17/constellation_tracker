# Sky Snapshot

A public web app that shows what's currently visible in the sky — constellations, famous
named stars, naked-eye planets, and a few famous galaxies — for any place, right now. No
install, no account: enter a location and see what's aligned overhead.

See `docs/spec.md` for the full product spec, `docs/plan.md` for the phased build plan, and
`docs/decisions.md` for architecture decisions.

## Prerequisites

- Node.js 20 or later
- npm

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. The server auto-reloads on file changes (`tsx watch`).

## Building and running for production

```bash
npm run build   # type-checks and compiles src/ to dist/
npm start        # runs the compiled server from dist/
```

Both the static frontend (`public/`) and the `/api/sky-snapshot` API are served from a
single Express process — no separate frontend/backend deployment or CORS setup needed.

A `Procfile` (`web: npm start`) and a `heroku-postbuild` script are included for any
Procfile-respecting host; this isn't a commitment to a specific provider, just a portable
convention for a single-process Node app.

## Configuration

- `PORT` — port to listen on (defaults to `3000`).
- `TRUST_PROXY` — number of reverse-proxy hops in front of the app (e.g. `1` for Heroku or
  a single load balancer). **Leave unset if the app is directly reachable** — setting this
  without a real proxy in front lets a client bypass rate limiting by spoofing
  `X-Forwarded-For`. Only set it when you've confirmed your host puts a trusted proxy
  between the internet and this process.

## Testing

```bash
npm test
```

Runs the full Vitest suite (unit, integration, and jsdom-based frontend tests).

## Regenerating the star catalog

`data/stars.json` is built from the HYG star database:

```bash
node scripts/build-star-catalog.js
```

This reads `scripts/hygdata_v41.csv` (gitignored — re-download from the [HYG Database on
Codeberg](https://codeberg.org/astronexus/hyg) if missing; the project's former GitHub
home is archived/read-only as of 2025) and filters it to naked-eye-magnitude stars with a
proper/common name.
