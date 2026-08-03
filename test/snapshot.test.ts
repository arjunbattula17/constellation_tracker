import { describe, it, expect, vi, afterEach } from "vitest";

const FIXED_DATE = new Date("2026-01-15T20:00:00Z");

describe("computeSkySnapshot — nothing-visible message", () => {
  afterEach(() => {
    vi.doUnmock("../src/sky/stars");
    vi.doUnmock("../src/sky/planets");
    vi.doUnmock("../src/sky/galaxies");
    vi.doUnmock("../src/sky/constellations");
    vi.resetModules();
  });

  it("sets the explicit message when stars, planets, and galaxies are all empty", async () => {
    vi.doMock("../src/sky/stars", () => ({ computeVisibleFamousStars: () => [] }));
    vi.doMock("../src/sky/planets", () => ({ computeVisiblePlanets: () => [] }));
    vi.doMock("../src/sky/galaxies", () => ({ computeVisibleGalaxies: () => [] }));
    vi.doMock("../src/sky/constellations", () => ({ computeVisibleConstellations: () => ["Orion"] }));

    const { computeSkySnapshot } = await import("../src/sky/snapshot");
    const snapshot = computeSkySnapshot(51.4769, -0.0005, FIXED_DATE);

    expect(snapshot.message).toBe("nothing bright visible right now");
    expect(snapshot.stars).toEqual([]);
    expect(snapshot.planets).toEqual([]);
    expect(snapshot.galaxies).toEqual([]);
  });

  it("leaves the message null when at least one of stars/planets/galaxies is non-empty", async () => {
    vi.doMock("../src/sky/stars", () => ({ computeVisibleFamousStars: () => [] }));
    vi.doMock("../src/sky/planets", () => ({
      computeVisiblePlanets: () => [{ name: "Jupiter", altitude: 30, azimuth: 100 }],
    }));
    vi.doMock("../src/sky/galaxies", () => ({ computeVisibleGalaxies: () => [] }));
    vi.doMock("../src/sky/constellations", () => ({ computeVisibleConstellations: () => ["Orion"] }));

    const { computeSkySnapshot } = await import("../src/sky/snapshot");
    const snapshot = computeSkySnapshot(51.4769, -0.0005, FIXED_DATE);

    expect(snapshot.message).toBeNull();
  });

  it("does not factor constellations into the nothing-visible condition (spec: stars/planets/galaxies only)", async () => {
    vi.doMock("../src/sky/stars", () => ({ computeVisibleFamousStars: () => [] }));
    vi.doMock("../src/sky/planets", () => ({ computeVisiblePlanets: () => [] }));
    vi.doMock("../src/sky/galaxies", () => ({ computeVisibleGalaxies: () => [] }));
    vi.doMock("../src/sky/constellations", () => ({ computeVisibleConstellations: () => [] }));

    const { computeSkySnapshot } = await import("../src/sky/snapshot");
    const snapshot = computeSkySnapshot(51.4769, -0.0005, FIXED_DATE);

    expect(snapshot.message).toBe("nothing bright visible right now");
  });
});
