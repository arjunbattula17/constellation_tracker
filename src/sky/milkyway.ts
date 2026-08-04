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

// The source outlines are sampled on a ~0.1° grid — about 30,700 vertices, far more
// detail than a diffuse background band needs, and the dominant term in the response
// payload. Simplifying at this tolerance only discards vertices that deviate by less
// than the source's own sampling granularity, so it costs no visible fidelity while
// removing ~85% of the points (and the per-request projection work that goes with them).
const SIMPLIFY_TOLERANCE_DEG = 0.1;

// Projected coordinates are rounded to this many decimals: 0.01° is well under a pixel
// even at the client's maximum zoom, and full float precision more than doubles the
// serialized size of every point.
const COORD_DECIMALS = 2;

const DEG = Math.PI / 180;

type Vec3 = [number, number, number];

function toVector(lonDeg: number, latDeg: number): Vec3 {
  const a = lonDeg * DEG;
  const d = latDeg * DEG;
  const c = Math.cos(d);
  return [c * Math.cos(a), c * Math.sin(a), Math.sin(d)];
}

// Perpendicular distance from p to the chord ab, as a chord length on the unit sphere.
function perpendicularDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const abLen = Math.hypot(ab[0], ab[1], ab[2]);
  if (abLen < 1e-12) return Math.hypot(ap[0], ap[1], ap[2]);
  const cross: Vec3 = [
    ap[1] * ab[2] - ap[2] * ab[1],
    ap[2] * ab[0] - ap[0] * ab[2],
    ap[0] * ab[1] - ap[1] * ab[0],
  ];
  return Math.hypot(cross[0], cross[1], cross[2]) / abLen;
}

// Douglas-Peucker run on unit vectors rather than raw [lon, lat]. The source rings
// cross the RA 0/360 seam (one ring shows an apparent 230° jump between consecutive
// vertices), which a planar simplification would read as a huge deviation and preserve
// spurious detail around; in 3D the seam doesn't exist.
function simplifyRing(ring: [number, number][], toleranceDeg: number): [number, number][] {
  if (ring.length < 3) return ring;
  const tolerance = 2 * Math.sin((toleranceDeg * DEG) / 2); // angular tolerance as a chord length
  const vectors = ring.map(([lon, lat]) => toVector(lon, lat));
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;

  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    let furthest = -1;
    let furthestDistance = 0;
    for (let i = start + 1; i < end; i++) {
      const distance = perpendicularDistance(vectors[i], vectors[start], vectors[end]);
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthest = i;
      }
    }
    if (furthest > 0 && furthestDistance > tolerance) {
      keep[furthest] = 1;
      stack.push([start, furthest], [furthest, end]);
    }
  }

  return ring.filter((_, i) => keep[i] === 1);
}

let cached: MwFeature[] | null = null;

export function loadMilkyWay(): MwFeature[] {
  if (!cached) {
    const dataPath = path.join(process.cwd(), "data", "milkyway.json");
    const raw = fs.readFileSync(dataPath, "utf8");
    const features = (JSON.parse(raw) as MwCollection).features;
    cached = features.map((feature) => ({
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: feature.geometry.coordinates
          .map((ring) => simplifyRing(ring, SIMPLIFY_TOLERANCE_DEG))
          // A closed ring needs 3 distinct vertices plus the repeated closing point to
          // enclose any area; anything shorter would draw nothing.
          .filter((ring) => ring.length >= 4),
      },
    }));
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

function round(value: number): number {
  const factor = 10 ** COORD_DECIMALS;
  return Math.round(value * factor) / factor;
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
        points.push([round(azimuth), round(altitude)]);
      }
      if (anyAbove) result.push({ level, points });
    }
  }

  return result;
}
