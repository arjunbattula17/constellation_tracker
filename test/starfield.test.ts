import { describe, it, expect } from "vitest";
import * as Astronomy from "astronomy-engine";
import { computeStarfield } from "../src/sky/starfield";
import { computeVisibleFamousStars } from "../src/sky/stars";

const OBSERVER = new Astronomy.Observer(51.4769, -0.0005, 0);
const FIXED_DATE = new Date("2026-01-15T20:00:00Z");

describe("computeStarfield", () => {
  const field = computeStarfield(OBSERVER, FIXED_DATE);

  it("returns the full above-horizon naked-eye starfield, far more than the named subset", () => {
    const famous = computeVisibleFamousStars(OBSERVER, FIXED_DATE);
    // ~96% of the catalog is unnamed; the starfield keeps it, the famous subset drops it.
    expect(field.length).toBeGreaterThan(famous.length * 5);
    expect(field.length).toBeGreaterThan(1000);
  });

  it("only includes stars above the horizon", () => {
    for (const s of field) expect(s.altitude).toBeGreaterThanOrEqual(0);
  });

  it("retains unnamed stars (name: null) as well as named ones", () => {
    expect(field.some((s) => s.name === null)).toBe(true);
    expect(field.some((s) => s.name !== null)).toBe(true);
  });

  it("its named subset matches the famous-star list one-for-one (same projector)", () => {
    // Consistency contract: a named star plotted in the background field is the same
    // star (same position) as its interactive-overlay marker.
    const famousNames = computeVisibleFamousStars(OBSERVER, FIXED_DATE)
      .map((s) => s.name)
      .sort();
    const fieldNames = field
      .filter((s) => s.name !== null)
      .map((s) => s.name as string)
      .sort();
    expect(fieldNames).toEqual(famousNames);
  });
});
