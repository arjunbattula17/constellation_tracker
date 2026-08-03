import * as fs from "fs";
import * as path from "path";
import * as Astronomy from "astronomy-engine";
import { FamousStar } from "./types";
import { classifyStarConstellation } from "./constellations";

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

export function computeVisibleFamousStars(
  observer: Astronomy.Observer,
  date: Date,
  catalog: CatalogStar[] = loadStarCatalog()
): FamousStar[] {
  const visible: FamousStar[] = [];
  for (const star of catalog) {
    if (!star.proper) continue;
    const hor = Astronomy.Horizon(date, observer, star.raHours, star.decDeg, "normal");
    if (hor.altitude >= 0) {
      visible.push({
        name: star.proper,
        altitude: hor.altitude,
        azimuth: hor.azimuth,
        constellation: classifyStarConstellation(star.raHours, star.decDeg),
        magnitude: star.mag,
      });
    }
  }
  return visible;
}
