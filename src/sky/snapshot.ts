import * as Astronomy from "astronomy-engine";
import { SkySnapshot } from "./types";
import { computeVisiblePlanets } from "./planets";
import { computeVisibleFamousStars } from "./stars";
import { computeVisibleGalaxies } from "./galaxies";
import { computeVisibleConstellations } from "./constellations";
import { computeStarfield } from "./starfield";
import { computeConstellationFigures } from "./constellationLines";
import { computeMoon } from "./moon";
import { computeMilkyWay } from "./milkyway";

export function computeSkySnapshot(latitude: number, longitude: number, date: Date): SkySnapshot {
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  const stars = computeVisibleFamousStars(observer, date);
  const planets = computeVisiblePlanets(observer, date);
  const galaxies = computeVisibleGalaxies(observer, date);
  const starfield = computeStarfield(observer, date);
  const moon = computeMoon(observer, date);
  const nothingVisible =
    stars.length === 0 && planets.length === 0 && galaxies.length === 0 && moon === null;

  return {
    constellations: computeVisibleConstellations(observer, date),
    stars,
    planets,
    galaxies,
    starfield,
    constellationLines: computeConstellationFigures(observer, date),
    moon,
    milkyway: computeMilkyWay(observer, date),
    message: nothingVisible ? "nothing bright visible right now" : null,
  };
}
