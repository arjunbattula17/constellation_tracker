import * as fs from "fs";
import * as path from "path";
import * as Astronomy from "astronomy-engine";
import { MilkyWayPolygon, SkyPoint } from "./types";
import { makeHorizonProjector } from "./projectHorizon";

// One feature of the d3-celestial milkyway.json GeoJSON: a brightness-band outline
// polygon. Vertices are [lon, lat] = [RA°, Dec°], same convention as the star lines.
// Feature ids are "ol1".."ol5", outermost/faintest to brightest core.
interface MwFeature {
  id: string;
  geometry: { type: "Polygon"; coordinates: [number, number][][] };
}
interface MwCollection {
  type: string;
  features: MwFeature[];
}

let cached: MwFeature[] | null = null;

export function loadMilkyWay(): MwFeature[] {
  if (!cached) {
    const dataPath = path.join(process.cwd(), "data", "milkyway.json");
    const raw = fs.readFileSync(dataPath, "utf8");
    cached = (JSON.parse(raw) as MwCollection).features;
  }
  return cached;
}

function lonToRaHours(lon: number): number {
  const raDeg = lon < 0 ? lon + 360 : lon;
  return raDeg / 15;
}

function levelFromId(id: string): number {
  const n = parseInt(id.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 1;
}

// Projects the Milky Way band outlines to the local horizon. Unlike the star lines,
// polygons are emitted whole (including vertices below the horizon): the band is a
// filled aesthetic layer, so the client clips it to the visible sky region rather
// than the server clipping polygon geometry. A polygon with no vertex above the
// horizon is dropped entirely.
export function computeMilkyWay(
  observer: Astronomy.Observer,
  date: Date,
  features: MwFeature[] = loadMilkyWay()
): MilkyWayPolygon[] {
  const project = makeHorizonProjector(observer, date);
  const result: MilkyWayPolygon[] = [];

  for (const feature of features) {
    const level = levelFromId(feature.id);
    for (const ring of feature.geometry.coordinates) {
      const points: SkyPoint[] = [];
      let anyAbove = false;
      for (const [lon, lat] of ring) {
        const { altitude, azimuth } = project(lonToRaHours(lon), lat);
        if (altitude >= 0) anyAbove = true;
        points.push([azimuth, altitude]);
      }
      if (anyAbove) result.push({ level, points });
    }
  }

  return result;
}
