import { describe, it, expect } from "vitest";
import * as Astronomy from "astronomy-engine";
import { computeVisiblePlanets } from "../src/sky/planets";
import { computeVisibleFamousStars, CatalogStar } from "../src/sky/stars";
import { computeVisibleGalaxies } from "../src/sky/galaxies";

const OBSERVER = new Astronomy.Observer(51.4769, -0.0005, 0);
const FIXED_DATE = new Date("2026-01-15T20:00:00Z");

function zenithRaDec(observer: Astronomy.Observer, date: Date) {
  const lstHours = (Astronomy.SiderealTime(date) + observer.longitude / 15 + 24) % 24;
  return { raHours: lstHours, decDeg: observer.latitude };
}

function nadirRaDec(observer: Astronomy.Observer, date: Date) {
  const zenith = zenithRaDec(observer, date);
  return { raHours: (zenith.raHours + 12) % 24, decDeg: -observer.latitude };
}

describe("computeVisiblePlanets", () => {
  it("only returns planets whose independently-computed altitude is >= 0", () => {
    const bodies = [
      Astronomy.Body.Mercury,
      Astronomy.Body.Venus,
      Astronomy.Body.Mars,
      Astronomy.Body.Jupiter,
      Astronomy.Body.Saturn,
    ];
    const expectedVisible = bodies.filter((body) => {
      const equ = Astronomy.Equator(body, FIXED_DATE, OBSERVER, true, true);
      const hor = Astronomy.Horizon(FIXED_DATE, OBSERVER, equ.ra, equ.dec, "normal");
      return hor.altitude >= 0;
    });

    const result = computeVisiblePlanets(OBSERVER, FIXED_DATE);

    expect(result.map((p) => p.name).sort()).toEqual(expectedVisible.sort());
    for (const p of result) {
      expect(p.altitude).toBeGreaterThanOrEqual(0);
      expect(typeof p.azimuth).toBe("number");
    }
  });
});

describe("computeVisibleFamousStars", () => {
  it("excludes catalog entries without a proper name, even if above the horizon", () => {
    const zenith = zenithRaDec(OBSERVER, FIXED_DATE);
    const catalog: CatalogStar[] = [
      { proper: "Test Star Named", raHours: zenith.raHours, decDeg: zenith.decDeg, mag: 1, con: "Xxx" },
      { proper: null, raHours: zenith.raHours, decDeg: zenith.decDeg, mag: 1, con: "Xxx" },
    ];

    const result = computeVisibleFamousStars(OBSERVER, FIXED_DATE, catalog);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test Star Named");
  });

  it("includes a star at the zenith and excludes one at the nadir", () => {
    const zenith = zenithRaDec(OBSERVER, FIXED_DATE);
    const nadir = nadirRaDec(OBSERVER, FIXED_DATE);
    const catalog: CatalogStar[] = [
      { proper: "Overhead Star", raHours: zenith.raHours, decDeg: zenith.decDeg, mag: 1, con: "Xxx" },
      { proper: "Underfoot Star", raHours: nadir.raHours, decDeg: nadir.decDeg, mag: 1, con: "Xxx" },
    ];

    const result = computeVisibleFamousStars(OBSERVER, FIXED_DATE, catalog);
    const names = result.map((s) => s.name);

    expect(names).toContain("Overhead Star");
    expect(names).not.toContain("Underfoot Star");
    const overhead = result.find((s) => s.name === "Overhead Star")!;
    expect(overhead.altitude).toBeGreaterThan(89);
  });

  it("Polaris (dec ~89.26°) stays above the horizon from a northern latitude across different times", () => {
    const polaris: CatalogStar = { proper: "Polaris", raHours: 2.53030, decDeg: 89.26411, mag: 1.98, con: "UMi" };
    const times = [new Date("2026-01-15T00:00:00Z"), new Date("2026-01-15T12:00:00Z"), new Date("2026-07-01T06:00:00Z")];

    for (const date of times) {
      const result = computeVisibleFamousStars(OBSERVER, date, [polaris]);
      expect(result).toHaveLength(1);
      expect(result[0].altitude).toBeGreaterThan(0);
    }
  });
});

describe("computeVisibleGalaxies", () => {
  it("only returns galaxies whose independently-computed altitude is >= 0", () => {
    const galaxies = [
      { name: "Andromeda Galaxy", raHours: 0.71231, decDeg: 41.26917 },
      { name: "Triangulum Galaxy", raHours: 1.56414, decDeg: 30.66028 },
    ];
    const expectedVisible = galaxies.filter((g) => {
      const hor = Astronomy.Horizon(FIXED_DATE, OBSERVER, g.raHours, g.decDeg, "normal");
      return hor.altitude >= 0;
    });

    const result = computeVisibleGalaxies(OBSERVER, FIXED_DATE, galaxies);

    expect(result.map((g) => g.name).sort()).toEqual(expectedVisible.map((g) => g.name).sort());
  });
});
