import * as fs from "fs";
import * as path from "path";
import * as Astronomy from "astronomy-engine";
import { ConstellationFigure, SkyPoint } from "./types";
import { makeHorizonProjector, HorizonProjector } from "./projectHorizon";
import { CONSTELLATION_NAMES } from "./constellationNames";

// One feature of the d3-celestial constellations.lines.json GeoJSON: a constellation
// figure as a set of polylines. Vertices are [lon, lat] where lon is right ascension
// in degrees (mapped to [-180,180]) and lat is declination in degrees.
interface LineFeature {
  id: string;
  properties: { rank?: string };
  geometry: { type: "MultiLineString"; coordinates: [number, number][][] };
}
interface LineCollection {
  type: string;
  features: LineFeature[];
}

let cached: LineFeature[] | null = null;

export function loadConstellationLines(): LineFeature[] {
  if (!cached) {
    const dataPath = path.join(process.cwd(), "data", "constellation-lines.json");
    const raw = fs.readFileSync(dataPath, "utf8");
    cached = (JSON.parse(raw) as LineCollection).features;
  }
  return cached;
}

function lonToRaHours(lon: number): number {
  const raDeg = lon < 0 ? lon + 360 : lon;
  return raDeg / 15;
}

const DEG = Math.PI / 180;

// Projects one polyline and splits it into runs that touch the sky, dropping edges
// whose endpoints are both below the horizon (those would otherwise draw a spurious
// chord across the visible sky). A run keeps at most one below-horizon endpoint on
// each side so the client can clip the edge cleanly at the horizon.
function projectPolyline(
  line: [number, number][],
  project: HorizonProjector,
  accumulateLabel: (az: number, alt: number) => void
): SkyPoint[][] {
  const projected = line.map(([lon, lat]) => project(lonToRaHours(lon), lat));
  const runs: SkyPoint[][] = [];
  let run: SkyPoint[] = [];

  const flush = (): void => {
    if (run.length >= 2) runs.push(run);
    run = [];
  };

  for (let i = 0; i < projected.length; i++) {
    const p = projected[i];
    if (p.altitude >= 0) {
      const prev = projected[i - 1];
      if (run.length === 0 && prev && prev.altitude < 0) {
        run.push([prev.azimuth, prev.altitude]); // below-horizon anchor: edge clips at the horizon on the client
      }
      run.push([p.azimuth, p.altitude]);
      accumulateLabel(p.azimuth, p.altitude);
    } else if (run.length > 0) {
      run.push([p.azimuth, p.altitude]); // trailing below-horizon anchor, then break the run
      flush();
    }
  }
  flush();
  return runs;
}

// Projects the constellation figure lines to the local horizon, keeping only the
// portions currently above it. Each returned figure carries a label anchor at the
// azimuth/altitude centroid of its above-horizon vertices (azimuth averaged as a
// circular quantity so it doesn't drift when a figure straddles due north).
export function computeConstellationFigures(
  observer: Astronomy.Observer,
  date: Date,
  features: LineFeature[] = loadConstellationLines()
): ConstellationFigure[] {
  const project = makeHorizonProjector(observer, date);
  const figures: ConstellationFigure[] = [];

  for (const feature of features) {
    const segments: SkyPoint[][] = [];
    let sumAlt = 0;
    let sumSin = 0;
    let sumCos = 0;
    let count = 0;
    const accumulateLabel = (az: number, alt: number): void => {
      sumAlt += alt;
      sumSin += Math.sin(az * DEG);
      sumCos += Math.cos(az * DEG);
      count++;
    };

    for (const line of feature.geometry.coordinates) {
      segments.push(...projectPolyline(line, project, accumulateLabel));
    }

    if (segments.length === 0) continue;

    const label =
      count > 0
        ? {
            altitude: sumAlt / count,
            azimuth: (Math.atan2(sumSin, sumCos) / DEG + 360) % 360,
          }
        : null;

    figures.push({
      id: feature.id,
      name: CONSTELLATION_NAMES[feature.id] ?? feature.id,
      segments,
      label,
    });
  }

  return figures;
}
