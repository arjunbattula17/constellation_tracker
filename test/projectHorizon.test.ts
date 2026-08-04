import { describe, it, expect } from "vitest";
import * as Astronomy from "astronomy-engine";
import { makeHorizonProjector } from "../src/sky/projectHorizon";

// Library-independent checks: the projector must reproduce textbook sky geometry, not
// merely agree with another astronomy-engine function.
describe("makeHorizonProjector", () => {
  const LAT = 51.4769;
  const OBSERVER = new Astronomy.Observer(LAT, -0.0005, 0);
  const DATE = new Date("2026-01-15T20:00:00Z");
  const project = makeHorizonProjector(OBSERVER, DATE);

  it("places Polaris at an altitude equal to the observer's latitude, due north", () => {
    // Polaris sits ~0.74° from the celestial pole, so its altitude circles the pole
    // altitude (= latitude) within that radius, and it stays near due north.
    const p = project(2.5303, 89.26411); // Polaris, J2000
    expect(p.altitude).toBeGreaterThan(LAT - 1.5);
    expect(p.altitude).toBeLessThan(LAT + 1.5);
    const fromNorth = Math.min(p.azimuth, 360 - p.azimuth);
    expect(fromNorth).toBeLessThan(5);
  });

  it("never reports an altitude outside [-90, 90]", () => {
    for (let ra = 0; ra < 24; ra += 3) {
      for (let dec = -80; dec <= 80; dec += 40) {
        const p = project(ra, dec);
        expect(p.altitude).toBeGreaterThanOrEqual(-90);
        expect(p.altitude).toBeLessThanOrEqual(90);
        expect(p.azimuth).toBeGreaterThanOrEqual(0);
        expect(p.azimuth).toBeLessThan(360.0001);
      }
    }
  });
});
