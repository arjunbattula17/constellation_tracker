import { describe, it, expect } from "vitest";
import * as Astronomy from "astronomy-engine";
import { computeMoon } from "../src/sky/moon";

const OBSERVER = new Astronomy.Observer(51.4769, -0.0005, 0);

// Independently computes the Moon's altitude with astronomy-engine, so the test's
// expectation doesn't come from the code under test.
function independentMoonAltitude(date: Date): number {
  const equ = Astronomy.Equator(Astronomy.Body.Moon, date, OBSERVER, true, true);
  return Astronomy.Horizon(date, OBSERVER, equ.ra, equ.dec, "normal").altitude;
}

// Scans a day at one-hour steps to find an hour when the Moon is up and one when it
// is down, so both branches are exercised deterministically regardless of the epoch.
function findHours() {
  let up: Date | null = null;
  let down: Date | null = null;
  for (let h = 0; h < 24; h++) {
    const d = new Date(Date.UTC(2026, 0, 20, h, 0, 0));
    const alt = independentMoonAltitude(d);
    if (alt >= 5 && !up) up = d;
    if (alt < -5 && !down) down = d;
  }
  return { up, down };
}

describe("computeMoon", () => {
  const { up, down } = findHours();

  it("returns null when the Moon is below the horizon", () => {
    expect(down).not.toBeNull();
    expect(computeMoon(OBSERVER, down!)).toBeNull();
  });

  it("returns position, phase, and illumination when the Moon is up", () => {
    expect(up).not.toBeNull();
    const moon = computeMoon(OBSERVER, up!);
    expect(moon).not.toBeNull();
    expect(moon!.name).toBe("Moon");
    expect(moon!.altitude).toBeCloseTo(independentMoonAltitude(up!), 5);
    expect(moon!.phase).toBeGreaterThanOrEqual(0);
    expect(moon!.phase).toBeLessThanOrEqual(360);
    expect(moon!.illumination).toBeGreaterThanOrEqual(0);
    expect(moon!.illumination).toBeLessThanOrEqual(1);
  });
});
