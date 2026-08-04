export interface VisibleObject {
  name: string;
  altitude: number;
  azimuth: number;
}

export interface FamousStar extends VisibleObject {
  constellation: string;
  magnitude: number;
}

// A single plotted star in the full naked-eye starfield. Unnamed stars carry
// name: null; named ones are also present in `stars` for the interactive overlay.
export interface StarPoint {
  altitude: number;
  azimuth: number;
  magnitude: number;
  name: string | null;
}

// One [azimuth, altitude] point of a projected constellation figure line.
export type SkyPoint = [number, number];

export interface ConstellationFigure {
  id: string; // 3-letter IAU abbreviation, e.g. "Ori"
  name: string; // full IAU name, e.g. "Orion"
  segments: SkyPoint[][]; // polylines; segments fully below the horizon are dropped
  label: { altitude: number; azimuth: number } | null; // anchor for a figure label
}

export interface MoonInfo extends VisibleObject {
  name: "Moon";
  phase: number; // phase angle in degrees, 0=new .. 180=full
  illumination: number; // lit fraction of the disk, 0..1
}

export interface MilkyWayPolygon {
  level: number; // brightness band 1 (outermost/faintest) .. 5 (brightest core)
  points: SkyPoint[]; // [azimuth, altitude]; may include points below the horizon (client clips)
}

export interface SkySnapshot {
  constellations: string[];
  stars: FamousStar[];
  planets: VisibleObject[];
  galaxies: VisibleObject[];
  starfield: StarPoint[];
  constellationLines: ConstellationFigure[];
  moon: MoonInfo | null;
  milkyway: MilkyWayPolygon[];
  message: string | null;
}
