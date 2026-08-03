import { Router, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { validateCoordinates } from "../sky/validate";
import { computeSkySnapshot } from "../sky/snapshot";

// Render's public edge sits behind Cloudflare in front of Render's own proxy —
// two hops, not one — so a fixed TRUST_PROXY hop count can't reliably recover
// the real client IP from X-Forwarded-For (confirmed live: rate-limit buckets
// were inconsistent across consecutive requests from a single client). Cloudflare's
// edge always sets CF-Connecting-IP to the true connecting client IP and strips
// any client-supplied value of the same name — but only when the request has
// actually passed through Cloudflare. Trusting that header unconditionally would
// just be the same "trust proxy: 1" mistake again (see docs/learnings.md), since
// a client reaching the app directly (local dev, or a future non-Cloudflare host)
// could set CF-Connecting-IP itself. Gate it behind an explicit TRUST_CLOUDFLARE
// opt-in, defaulting to false, exactly like TRUST_PROXY.
function rateLimitKey(req: Request): string {
  if (process.env.TRUST_CLOUDFLARE === "1") {
    const cfConnectingIp = req.headers["cf-connecting-ip"];
    if (typeof cfConnectingIp === "string" && cfConnectingIp) return cfConnectingIp;
  }
  return ipKeyGenerator(req.ip ?? "");
}

const skySnapshotLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { error: "too many requests, try again shortly" },
});

function parseTimestamp(raw: unknown): Date | null {
  if (raw === undefined) return new Date();
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const asNumber = Number(raw);
  const date = Number.isFinite(asNumber) && /^-?\d+$/.test(raw) ? new Date(asNumber) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const skySnapshotRouter = Router();

skySnapshotRouter.get("/api/sky-snapshot", skySnapshotLimiter, (req: Request, res: Response) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);

  const validation = validateCoordinates(latitude, longitude);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const date = parseTimestamp(req.query.timestamp);
  if (date === null) {
    res.status(400).json({ error: "timestamp must be an ISO 8601 date string or epoch milliseconds" });
    return;
  }

  try {
    const snapshot = computeSkySnapshot(latitude, longitude, date);
    res.status(200).json(snapshot);
  } catch (err) {
    console.error("sky snapshot calculation failed:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "couldn't calculate the sky right now, try again" });
  }
});
