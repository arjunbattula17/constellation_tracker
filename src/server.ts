import express from "express";
import helmet from "helmet";
import * as path from "path";
import { skySnapshotRouter } from "./routes/skySnapshot";

// Only trust X-Forwarded-For when a real reverse proxy actually sits in front (set
// TRUST_PROXY to the number of proxy hops, e.g. "1" for Heroku/a single load balancer).
// Defaulting to false keys express-rate-limit on the real socket connection, since
// trusting X-Forwarded-For with no proxy in front lets a client bypass rate limiting
// entirely by sending a different spoofed value on every request.
function resolveTrustProxy(): number | boolean {
  const raw = process.env.TRUST_PROXY;
  if (!raw) return false;
  const hops = Number(raw);
  return Number.isFinite(hops) ? hops : false;
}

export function createApp() {
  const app = express();
  app.set("trust proxy", resolveTrustProxy());
  app.use(helmet());
  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
  app.use(skySnapshotRouter);
  app.use(express.static(path.join(process.cwd(), "public")));
  return app;
}

if (require.main === module) {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const app = createApp();
  app.listen(port, () => {
    console.log(`Sky Snapshot server listening on http://localhost:${port}`);
  });
}
