import { describe, it, expect } from "vitest";
import * as Astronomy from "astronomy-engine";
import { computeMilkyWay, loadMilkyWay } from "../src/sky/milkyway";

const OBSERVER = new Astronomy.Observer(51.4769, -0.0005, 0);
const FIXED_DATE = new Date("2026-01-15T20:00:00Z");

describe("computeMilkyWay", () => {
  const polygons = computeMilkyWay(OBSERVER, FIXED_DATE);

  it("returns brightness-banded polygons, each with at least one vertex above the horizon", () => {
    expect(polygons.length).toBeGreaterThan(0);
    for (const poly of polygons) {
      expect(poly.level).toBeGreaterThanOrEqual(1);
      expect(poly.level).toBeLessThanOrEqual(5);
      expect(poly.points.length).toBeGreaterThanOrEqual(4);
      expect(poly.points.some(([, alt]) => alt >= 0)).toBe(true);
    }
  });

  it("emits coordinates rounded to 2 decimals, keeping the payload small", () => {
    // Payload size is the reason this rounding exists (the band was 59% of the
    // response); full float precision more than doubles the serialized size.
    for (const poly of polygons.slice(0, 5)) {
      for (const [az, alt] of poly.points) {
        expect(az).toBeCloseTo(Math.round(az * 100) / 100, 10);
        expect(alt).toBeCloseTo(Math.round(alt * 100) / 100, 10);
      }
    }
  });

  it("simplifies the source outlines well below their raw ~0.1-degree sampling density", () => {
    // The raw GeoJSON carries ~30,700 vertices; the loader simplifies at the source's
    // own sampling granularity, which must remove the large majority of them.
    const rawPoints = 30676;
    const loadedPoints = loadMilkyWay()
      .flatMap((f) => f.geometry.coordinates)
      .reduce((sum, ring) => sum + ring.length, 0);
    expect(loadedPoints).toBeLessThan(rawPoints * 0.25);
    expect(loadedPoints).toBeGreaterThan(1000); // still enough detail to trace the band
  });

  it("preserves the band's overall extent despite simplification", () => {
    // Simplification must not lop off whole regions: the projected band should still
    // span a wide range of azimuth, as the Milky Way arcs across the sky.
    const above = polygons.flatMap((p) => p.points).filter(([, alt]) => alt >= 0);
    const azimuths = above.map(([az]) => az);
    expect(Math.max(...azimuths) - Math.min(...azimuths)).toBeGreaterThan(90);
  });
});
