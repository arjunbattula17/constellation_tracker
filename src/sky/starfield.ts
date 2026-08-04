import * as Astronomy from "astronomy-engine";
import { StarPoint } from "./types";
import { loadStarCatalog, CatalogStar } from "./stars";
import { makeHorizonProjector } from "./projectHorizon";

// Projects the full naked-eye catalog to the local horizon and returns every star
// currently above it (altitude ≥ 0), named or not. Unlike computeVisibleFamousStars
// (which keeps only the ~358 stars with proper names for the interactive overlay),
// this drives the dense background starfield, so it retains unnamed stars.
export function computeStarfield(
  observer: Astronomy.Observer,
  date: Date,
  catalog: CatalogStar[] = loadStarCatalog()
): StarPoint[] {
  const project = makeHorizonProjector(observer, date);
  const field: StarPoint[] = [];
  for (const star of catalog) {
    const { altitude, azimuth } = project(star.raHours, star.decDeg);
    if (altitude >= 0) {
      field.push({ altitude, azimuth, magnitude: star.mag, name: star.proper });
    }
  }
  return field;
}
