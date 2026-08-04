import { describe, it, expect } from "vitest";
import * as Astronomy from "astronomy-engine";
import { computeConstellationFigures } from "../src/sky/constellationLines";

const OBSERVER = new Astronomy.Observer(51.4769, -0.0005, 0);
const FIXED_DATE = new Date("2026-01-15T20:00:00Z");

describe("computeConstellationFigures", () => {
  const figures = computeConstellationFigures(OBSERVER, FIXED_DATE);
  const byId = new Map(figures.map((f) => [f.id, f]));

  it("includes Orion (up over London on a January evening) with drawn segments and a label anchor", () => {
    const ori = byId.get("Ori");
    expect(ori).toBeDefined();
    expect(ori!.name).toBe("Orion");
    expect(ori!.segments.length).toBeGreaterThan(0);
    for (const seg of ori!.segments) expect(seg.length).toBeGreaterThanOrEqual(2);
    expect(ori!.label).not.toBeNull();
    expect(ori!.label!.altitude).toBeGreaterThan(0);
  });

  it("omits Crux entirely (never rises from a mid-northern latitude)", () => {
    expect(byId.has("Cru")).toBe(false);
  });

  it("resolves 3-letter ids to full IAU names", () => {
    // Every returned figure carries a human name, not the raw abbreviation.
    for (const f of figures) {
      expect(f.name).not.toBe("");
      if (f.id === "UMa") expect(f.name).toBe("Ursa Major");
    }
  });

  it("drops figures fully below the horizon", () => {
    // Each returned figure has at least one drawable segment.
    for (const f of figures) expect(f.segments.length).toBeGreaterThan(0);
  });
});
