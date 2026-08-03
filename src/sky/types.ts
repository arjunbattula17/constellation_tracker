export interface VisibleObject {
  name: string;
  altitude: number;
  azimuth: number;
}

export interface FamousStar extends VisibleObject {
  constellation: string;
}

export interface SkySnapshot {
  constellations: string[];
  stars: FamousStar[];
  planets: VisibleObject[];
  galaxies: VisibleObject[];
}
