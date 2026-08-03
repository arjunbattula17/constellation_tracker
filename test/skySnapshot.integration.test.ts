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
    expect(res.body).toHaveProperty("message");
    expect(Array.isArray(res.body.stars)).toBe(true);
    expect(Array.isArray(res.body.planets)).toBe(true);
    expect(Array.isArray(res.body.galaxies)).toBe(true);
    expect(Array.isArray(res.body.constellations)).toBe(true);
    expect(res.body.constellations.length).toBeGreaterThan(0);
    // London, winter evening — real objects are visible, so no "nothing visible" message.
    expect(res.body.message).toBeNull();
    for (const star of res.body.stars) {
      expect(typeof star.constellation).toBe("string");
      expect(star.constellation.length).toBeGreaterThan(0);
    }
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

  it("passes through the explicit nothing-visible message when the snapshot has one", async () => {
    vi.resetModules();
    vi.doMock("../src/sky/snapshot", () => ({
      computeSkySnapshot: () => ({
        constellations: ["Orion"],
        stars: [],
        planets: [],
        galaxies: [],
        message: "nothing bright visible right now",
      }),
    }));
    const { createApp: createAppWithMock } = await import("../src/server");

    const app = createAppWithMock();
    const res = await request(app).get("/api/sky-snapshot").query(VALID_QUERY);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("nothing bright visible right now");
    expect(res.body.stars).toEqual([]);
    expect(res.body.planets).toEqual([]);
    expect(res.body.galaxies).toEqual([]);

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

describe("rate-limit key source (trust proxy)", () => {
  const originalTrustProxy = process.env.TRUST_PROXY;

  afterEach(() => {
    if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = originalTrustProxy;
    vi.resetModules();
  });

  it("ignores a spoofed X-Forwarded-For by default, closing a rate-limit bypass", async () => {
    delete process.env.TRUST_PROXY;
    vi.resetModules();
    const { createApp: createAppDefault } = await import("../src/server");
    const app = createAppDefault();

    let sawLimit = false;
    for (let i = 0; i < 40; i++) {
      const res = await request(app)
        .get("/api/sky-snapshot")
        .set("X-Forwarded-For", `10.0.0.${i}`) // a different spoofed IP on every request
        .query(VALID_QUERY);
      if (res.status === 429) {
        sawLimit = true;
        break;
      }
    }
    expect(sawLimit).toBe(true);
  });

  it("trusts X-Forwarded-For when TRUST_PROXY is explicitly set, for a real proxy topology", async () => {
    process.env.TRUST_PROXY = "1";
    vi.resetModules();
    const { createApp: createAppWithProxy } = await import("../src/server");
    const app = createAppWithProxy();

    // Distinct forwarded IPs each get their own bucket...
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .get("/api/sky-snapshot")
        .set("X-Forwarded-For", `10.0.0.${i}`)
        .query(VALID_QUERY);
      expect(res.status).not.toBe(429);
    }

    // ...but repeating the same forwarded IP still hits the limit.
    let sawLimit = false;
    for (let i = 0; i < 40; i++) {
      const res = await request(app)
        .get("/api/sky-snapshot")
        .set("X-Forwarded-For", "10.0.0.99")
        .query(VALID_QUERY);
      if (res.status === 429) {
        sawLimit = true;
        break;
      }
    }
    expect(sawLimit).toBe(true);
  });
});
