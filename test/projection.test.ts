import { describe, it, expect } from "vitest";

const {
  wrapDegrees180,
  projectCircular,
  projectLandscape,
  inLandscapeWindow,
  magnitudeToRadius,
  magnitudeToAlpha,
} = require("../public/projection.js");

describe("wrapDegrees180", () => {
  it("wraps deltas into (-180, 180] without a seam at 0/360", () => {
    expect(wrapDegrees180(0)).toBe(0);
    expect(wrapDegrees180(370)).toBe(10);
    expect(wrapDegrees180(-10)).toBe(-10);
    expect(wrapDegrees180(350)).toBe(-10); // 350° "ahead" is really 10° behind
    expect(wrapDegrees180(180)).toBe(180);
    expect(wrapDegrees180(-180)).toBe(180);
  });
});

describe("projectCircular (azimuthal, looking up: N top, E left, W right)", () => {
  it("puts the zenith at the center", () => {
    const p = projectCircular(90, 123);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it("puts the horizon on the unit rim", () => {
    expect(Math.hypot(...Object.values(projectCircular(0, 0)) as number[])).toBeCloseTo(1, 6);
    expect(Math.hypot(...Object.values(projectCircular(0, 217)) as number[])).toBeCloseTo(1, 6);
  });

  it("orients north up, east left, south down, west right", () => {
    const n = projectCircular(0, 0);
    const e = projectCircular(0, 90);
    const s = projectCircular(0, 180);
    const w = projectCircular(0, 270);
    expect(n.y).toBeLessThan(0); // up
    expect(e.x).toBeLessThan(0); // left
    expect(s.y).toBeGreaterThan(0); // down
    expect(w.x).toBeGreaterThan(0); // right
  });

  it("projects below-horizon points outside the disk", () => {
    expect(Math.hypot(...Object.values(projectCircular(-10, 45)) as number[])).toBeGreaterThan(1);
  });
});

describe("projectLandscape", () => {
  it("returns the wrapped azimuth offset from the view center and the altitude", () => {
    expect(projectLandscape(20, 190, 180)).toEqual({ dxDeg: 10, altDeg: 20 });
    expect(projectLandscape(5, 10, 350)).toEqual({ dxDeg: 20, altDeg: 5 }); // across the 0/360 seam
  });
});

describe("inLandscapeWindow", () => {
  it("includes points inside the half-FOV and altitude band, excludes those outside", () => {
    expect(inLandscapeWindow(30, 20, 45, 0, 80)).toBe(true);
    expect(inLandscapeWindow(50, 20, 45, 0, 80)).toBe(false); // beyond half-FOV
    expect(inLandscapeWindow(30, -5, 45, 0, 80)).toBe(false); // below the band
  });
});

describe("magnitude styling", () => {
  it("makes brighter stars larger and more opaque", () => {
    expect(magnitudeToRadius(-1)).toBeGreaterThan(magnitudeToRadius(5));
    expect(magnitudeToAlpha(0)).toBeGreaterThan(magnitudeToAlpha(6));
  });

  it("clamps to sane bounds across the naked-eye range", () => {
    for (const mag of [-1.5, 0, 3, 6.5]) {
      expect(magnitudeToRadius(mag)).toBeGreaterThanOrEqual(0.35);
      expect(magnitudeToRadius(mag)).toBeLessThanOrEqual(3.2);
      expect(magnitudeToAlpha(mag)).toBeGreaterThanOrEqual(0.28);
      expect(magnitudeToAlpha(mag)).toBeLessThanOrEqual(1);
    }
  });
});
