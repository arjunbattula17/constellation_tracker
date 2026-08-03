import * as Astronomy from "astronomy-engine";
import { VisibleObject } from "./types";

const NAKED_EYE_PLANETS: Astronomy.Body[] = [
  Astronomy.Body.Mercury,
  Astronomy.Body.Venus,
  Astronomy.Body.Mars,
  Astronomy.Body.Jupiter,
  Astronomy.Body.Saturn,
];

export function computeVisiblePlanets(observer: Astronomy.Observer, date: Date): VisibleObject[] {
  const visible: VisibleObject[] = [];
  for (const body of NAKED_EYE_PLANETS) {
    const equ = Astronomy.Equator(body, date, observer, true, true);
    const hor = Astronomy.Horizon(date, observer, equ.ra, equ.dec, "normal");
    if (hor.altitude >= 0) {
      visible.push({ name: body, altitude: hor.altitude, azimuth: hor.azimuth });
    }
  }
  return visible;
}
