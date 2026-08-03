export interface VisibleObject {
  name: string;
  altitude: number;
  azimuth: number;
}

export interface SkySnapshot {
  constellations: string[];
  stars: VisibleObject[];
  planets: VisibleObject[];
  galaxies: VisibleObject[];
}
