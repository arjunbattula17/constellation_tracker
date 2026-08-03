import * as Astronomy from "astronomy-engine";
import { SkySnapshot } from "./types";
import { computeVisiblePlanets } from "./planets";
import { computeVisibleFamousStars } from "./stars";
import { computeVisibleGalaxies } from "./galaxies";
import { computeVisibleConstellations } from "./constellations";

export function computeSkySnapshot(latitude: number, longitude: number, date: Date): SkySnapshot {
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  const stars = computeVisibleFamousStars(observer, date);
  const planets = computeVisiblePlanets(observer, date);
  const galaxies = computeVisibleGalaxies(observer, date);
  const nothingVisible = stars.length === 0 && planets.length === 0 && galaxies.length === 0;

  return {
    constellations: computeVisibleConstellations(observer, date),
    stars,
    planets,
    galaxies,
    message: nothingVisible ? "nothing bright visible right now" : null,
  };
}
