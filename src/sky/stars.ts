import * as fs from "fs";
import * as path from "path";
import * as Astronomy from "astronomy-engine";
import { FamousStar } from "./types";
import { classifyStarConstellation } from "./constellations";
import { makeHorizonProjector } from "./projectHorizon";

export interface CatalogStar {
  proper: string | null;
  raHours: number;
  decDeg: number;
  mag: number;
  con: string;
}

let cachedCatalog: CatalogStar[] | null = null;

export function loadStarCatalog(): CatalogStar[] {
  if (cachedCatalog) return cachedCatalog;
  const dataPath = path.join(process.cwd(), "data", "stars.json");
  const raw = fs.readFileSync(dataPath, "utf8");
  cachedCatalog = JSON.parse(raw) as CatalogStar[];
  return cachedCatalog;
}

// The labeled/interactive subset: only named stars. Positions come from the same
// J2000→horizon projector as the starfield and constellation figures, so a named
// star's marker lands exactly on its figure-line vertex at any zoom level.
export function computeVisibleFamousStars(
  observer: Astronomy.Observer,
  date: Date,
  catalog: CatalogStar[] = loadStarCatalog()
): FamousStar[] {
  const project = makeHorizonProjector(observer, date);
  const visible: FamousStar[] = [];
  for (const star of catalog) {
    if (!star.proper) continue;
    const { altitude, azimuth } = project(star.raHours, star.decDeg);
    if (altitude >= 0) {
      visible.push({
        name: star.proper,
        altitude,
        azimuth,
        constellation: classifyStarConstellation(star.raHours, star.decDeg),
        magnitude: star.mag,
      });
    }
  }
  return visible;
}
