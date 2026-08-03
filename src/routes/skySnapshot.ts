import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { validateCoordinates } from "../sky/validate";
import { computeSkySnapshot } from "../sky/snapshot";

const skySnapshotLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
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
