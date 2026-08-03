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

## Deploying to Render

`render.yaml` at the repo root is a [Render Blueprint](https://render.com/docs/blueprint-spec):
in the Render dashboard, choose **New > Blueprint**, connect this repo, and Render reads
`render.yaml` to configure the build command, start command, health check path, and env
vars automatically — no manual service configuration needed. `PORT` is injected by Render
itself.

Render's public traffic actually passes through **two** proxy hops (Cloudflare, then
Render's own edge) before reaching the app — confirmed live, not assumed (see
`docs/learnings.md`). A single `TRUST_PROXY` hop count can't reliably recover the real
client IP through two hops, so the rate limiter instead keys on Cloudflare's
`CF-Connecting-IP` header when `TRUST_CLOUDFLARE=1` is set (which `render.yaml` does) —
see Configuration below.

## Configuration

- `PORT` — port to listen on (defaults to `3000`; Render and most hosts set this for you).
- `TRUST_PROXY` — number of reverse-proxy hops in front of the app (e.g. `1` for a single
  load balancer). **Leave unset if the app is directly reachable** — setting this without
  a real proxy in front lets a client bypass rate limiting by spoofing `X-Forwarded-For`.
  Only set it when you've confirmed your host puts a trusted proxy between the internet
  and this process.
- `TRUST_CLOUDFLARE` — set to `1` only when you've confirmed Cloudflare is genuinely in
  front of this app (true for Render — see above). Makes the rate limiter key on
  Cloudflare's `CF-Connecting-IP` header instead of `X-Forwarded-For`/`TRUST_PROXY`, since
  Cloudflare's edge always sets that header to the true client IP and strips any
  client-supplied value of the same name. **Leave unset otherwise** — trusting
  `CF-Connecting-IP` without a real Cloudflare edge in front lets a client set that header
  themselves and bypass rate limiting the same way an unwarranted `TRUST_PROXY` would.

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
