import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/server";

const FIXED_TIMESTAMP = "2026-01-15T20:00:00Z";
const VALID_QUERY = { lat: "51.4769", lon: "-0.0005", timestamp: FIXED_TIMESTAMP };

describe("GET /api/sky-snapshot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a sky snapshot for valid coordinates and a fixed timestamp", async () => {
    const app = createApp();
    const res = await request(app).get("/api/sky-snapshot").query(VALID_QUERY);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("constellations");
    expect(res.body).toHaveProperty("stars");
    expect(res.body).toHaveProperty("planets");
    expect(res.body).toHaveProperty("galaxies");
    expect(Array.isArray(res.body.stars)).toBe(true);
    expect(Array.isArray(res.body.planets)).toBe(true);
    expect(Array.isArray(res.body.galaxies)).toBe(true);
    // Phase 1 has not implemented constellation determination yet.
    expect(res.body.constellations).toEqual([]);
  });

  it("rejects an out-of-range latitude with 400", async () => {
    const app = createApp();
    const res = await request(app).get("/api/sky-snapshot").query({ ...VALID_QUERY, lat: "999" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/latitude/);
  });

  it("rejects a missing latitude with 400", async () => {
    const app = createApp();
    const res = await request(app).get("/api/sky-snapshot").query({ lon: "-0.0005" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid timestamp with 400", async () => {
    const app = createApp();
    const res = await request(app).get("/api/sky-snapshot").query({ ...VALID_QUERY, timestamp: "not-a-date" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/timestamp/);
  });

  it("defaults to the current time when timestamp is omitted", async () => {
    const app = createApp();
    const { timestamp, ...withoutTimestamp } = VALID_QUERY;
    const res = await request(app).get("/api/sky-snapshot").query(withoutTimestamp);
    expect(res.status).toBe(200);
  });

  it("never logs the requested coordinates, even when the calculation throws", async () => {
    vi.resetModules();
    vi.doMock("../src/sky/snapshot", () => ({
      computeSkySnapshot: () => {
        throw new Error("simulated calculation failure");
      },
    }));
    const { createApp: createAppWithMock } = await import("../src/server");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const app = createAppWithMock();
    const res = await request(app).get("/api/sky-snapshot").query(VALID_QUERY);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("couldn't calculate the sky right now, try again");
    expect(JSON.stringify(res.body)).not.toMatch(/simulated calculation failure/);

    const allLoggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(" ");
    expect(allLoggedText).not.toContain(VALID_QUERY.lat);
    expect(allLoggedText).not.toContain(VALID_QUERY.lon);

    vi.doUnmock("../src/sky/snapshot");
    vi.resetModules();
  });

  it("rate-limits after exceeding the per-minute request threshold", async () => {
    const app = createApp();
    let lastStatus = 200;
    for (let i = 0; i < 31; i++) {
      const res = await request(app).get("/api/sky-snapshot").query(VALID_QUERY);
      lastStatus = res.status;
      if (lastStatus === 429) break;
    }
    expect(lastStatus).toBe(429);
  });
});
