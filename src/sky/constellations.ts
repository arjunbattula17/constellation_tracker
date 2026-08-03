import * as Astronomy from "astronomy-engine";

// astronomy-engine's own ConstelNames table misspells 3 of the 88 IAU names.
const NAME_CORRECTIONS: Record<string, string> = {
  Ant: "Antlia",
  Cam: "Camelopardalis",
  PsA: "Piscis Austrinus",
};

// The .d.ts declares refraction as `string`, but the implementation (and its own
// JSDoc) also accepts `null` for "no refraction correction" — the correct choice
// here since we want the true geometric direction, not an atmospherically-refracted one.
const NO_REFRACTION = null as unknown as string;

export function resolveConstellationName(info: Astronomy.ConstellationInfo): string {
  return NAME_CORRECTIONS[info.symbol] ?? info.name;
}

export function classifyStarConstellation(raHours: number, decDeg: number): string {
  return resolveConstellationName(Astronomy.Constellation(raHours, decDeg));
}

export function computeVisibleConstellations(observer: Astronomy.Observer, date: Date): string[] {
  const rot = Astronomy.Rotation_HOR_EQJ(date, observer);
  const visible = new Set<string>();
  for (let alt = 0; alt <= 90; alt += 2) {
    for (let az = 0; az < 360; az += 2) {
      const sphere = new Astronomy.Spherical(alt, az, 1);
      const horVec = Astronomy.VectorFromHorizon(sphere, date, NO_REFRACTION);
      const eqVec = Astronomy.RotateVector(rot, horVec);
      const eq = Astronomy.EquatorFromVector(eqVec);
      visible.add(classifyStarConstellation(eq.ra, eq.dec));
    }
  }
  return Array.from(visible).sort();
}
