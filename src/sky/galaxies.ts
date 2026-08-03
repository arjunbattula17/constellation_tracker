import * as Astronomy from "astronomy-engine";
import { VisibleObject } from "./types";

export interface CuratedGalaxy {
  name: string;
  raHours: number;
  decDeg: number;
}

// J2000 coordinates for a small curated set of naked-eye-famous galaxies (spec: MVP scope).
export const CURATED_GALAXIES: CuratedGalaxy[] = [
  { name: "Andromeda Galaxy", raHours: 0.71231, decDeg: 41.26917 },
  { name: "Triangulum Galaxy", raHours: 1.56414, decDeg: 30.66028 },
];

export function computeVisibleGalaxies(
  observer: Astronomy.Observer,
  date: Date,
  galaxies: CuratedGalaxy[] = CURATED_GALAXIES
): VisibleObject[] {
  const visible: VisibleObject[] = [];
  for (const galaxy of galaxies) {
    const hor = Astronomy.Horizon(date, observer, galaxy.raHours, galaxy.decDeg, "normal");
    if (hor.altitude >= 0) {
      visible.push({ name: galaxy.name, altitude: hor.altitude, azimuth: hor.azimuth });
    }
  }
  return visible;
}
