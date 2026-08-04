import { describe, it, expect, vi, afterEach } from "vitest";

const FIXED_DATE = new Date("2026-01-15T20:00:00Z");

// Mocks every sub-module computeSkySnapshot fans out to, so the message logic is
// tested in isolation (and without running the heavy real starfield/figure/Milky Way
// computations or coupling to live Moon ephemeris). Callers override individual
// pieces via the `over` argument.
function mockSubModules(over: {
  stars?: unknown[];
  planets?: unknown[];
  galaxies?: unknown[];
  constellations?: string[];
  moon?: unknown;
}) {
  vi.doMock("../src/sky/stars", () => ({ computeVisibleFamousStars: () => over.stars ?? [] }));
  vi.doMock("../src/sky/planets", () => ({ computeVisiblePlanets: () => over.planets ?? [] }));
  vi.doMock("../src/sky/galaxies", () => ({ computeVisibleGalaxies: () => over.galaxies ?? [] }));
  vi.doMock("../src/sky/constellations", () => ({
    computeVisibleConstellations: () => over.constellations ?? ["Orion"],
  }));
  vi.doMock("../src/sky/moon", () => ({ computeMoon: () => over.moon ?? null }));
  vi.doMock("../src/sky/starfield", () => ({ computeStarfield: () => [] }));
  vi.doMock("../src/sky/constellationLines", () => ({ computeConstellationFigures: () => [] }));
  vi.doMock("../src/sky/milkyway", () => ({ computeMilkyWay: () => [] }));
}

describe("computeSkySnapshot — nothing-visible message", () => {
  afterEach(() => {
    for (const m of [
      "stars",
      "planets",
      "galaxies",
      "constellations",
      "moon",
      "starfield",
      "constellationLines",
      "milkyway",
    ]) {
      vi.doUnmock(`../src/sky/${m}`);
    }
    vi.resetModules();
  });

  it("sets the explicit message when stars, planets, galaxies, and the Moon are all absent", async () => {
    mockSubModules({ stars: [], planets: [], galaxies: [], moon: null });

    const { computeSkySnapshot } = await import("../src/sky/snapshot");
    const snapshot = computeSkySnapshot(51.4769, -0.0005, FIXED_DATE);

    expect(snapshot.message).toBe("nothing bright visible right now");
    expect(snapshot.stars).toEqual([]);
    expect(snapshot.planets).toEqual([]);
    expect(snapshot.galaxies).toEqual([]);
    expect(snapshot.moon).toBeNull();
  });

  it("leaves the message null when a planet is up", async () => {
    mockSubModules({ planets: [{ name: "Jupiter", altitude: 30, azimuth: 100 }] });

    const { computeSkySnapshot } = await import("../src/sky/snapshot");
    const snapshot = computeSkySnapshot(51.4769, -0.0005, FIXED_DATE);

    expect(snapshot.message).toBeNull();
  });

  it("leaves the message null when only the Moon is up", async () => {
    mockSubModules({
      moon: { name: "Moon", altitude: 20, azimuth: 120, phase: 90, illumination: 0.5 },
    });

    const { computeSkySnapshot } = await import("../src/sky/snapshot");
    const snapshot = computeSkySnapshot(51.4769, -0.0005, FIXED_DATE);

    expect(snapshot.message).toBeNull();
    expect(snapshot.moon).not.toBeNull();
  });

  it("does not factor constellations into the nothing-visible condition (spec: bright objects only)", async () => {
    mockSubModules({ stars: [], planets: [], galaxies: [], moon: null, constellations: [] });

    const { computeSkySnapshot } = await import("../src/sky/snapshot");
    const snapshot = computeSkySnapshot(51.4769, -0.0005, FIXED_DATE);

    expect(snapshot.message).toBe("nothing bright visible right now");
  });
});
