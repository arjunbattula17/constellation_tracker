import * as Astronomy from "astronomy-engine";
import { SkySnapshot } from "./types";
import { computeVisiblePlanets } from "./planets";
import { computeVisibleFamousStars } from "./stars";
import { computeVisibleGalaxies } from "./galaxies";
import { computeVisibleConstellations } from "./constellations";

export function computeSkySnapshot(latitude: number, longitude: number, date: Date): SkySnapshot {
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  return {
    constellations: computeVisibleConstellations(observer, date),
    stars: computeVisibleFamousStars(observer, date),
    planets: computeVisiblePlanets(observer, date),
    galaxies: computeVisibleGalaxies(observer, date),
  };
}
