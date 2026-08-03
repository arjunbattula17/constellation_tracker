import * as fs from "fs";
import * as path from "path";
import * as Astronomy from "astronomy-engine";
import { VisibleObject } from "./types";

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
  const dataPath = path.join(__dirname, "..", "..", "data", "stars.json");
  const raw = fs.readFileSync(dataPath, "utf8");
  cachedCatalog = JSON.parse(raw) as CatalogStar[];
  return cachedCatalog;
}

export function computeVisibleFamousStars(
  observer: Astronomy.Observer,
  date: Date,
  catalog: CatalogStar[] = loadStarCatalog()
): VisibleObject[] {
  const visible: VisibleObject[] = [];
  for (const star of catalog) {
    if (!star.proper) continue;
    const hor = Astronomy.Horizon(date, observer, star.raHours, star.decDeg, "normal");
    if (hor.altitude >= 0) {
      visible.push({ name: star.proper, altitude: hor.altitude, azimuth: hor.azimuth });
    }
  }
  return visible;
}
