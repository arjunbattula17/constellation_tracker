import * as Astronomy from "astronomy-engine";

// The .d.ts declares refraction as `string`, but the implementation accepts `null`
// for "no refraction correction" — we want the true geometric direction here, and
// null also sidesteps the library's hang at exactly alt=90° with refraction on.
const NO_REFRACTION = null as unknown as string;

export type HorizonProjector = (raHours: number, decDeg: number) => {
  altitude: number;
  azimuth: number;
};

// Builds a reusable equatorial(J2000) → horizontal projector for one observer/time.
// The rotation matrix is computed once up front; each call is a vector build +
// rotate + spherical read, far cheaper than an Astronomy.Horizon() call per point.
// Used to project thousands of catalog stars, constellation-line vertices, and
// Milky Way outline points per request without the per-point Horizon() cost.
export function makeHorizonProjector(observer: Astronomy.Observer, date: Date): HorizonProjector {
  const rot = Astronomy.Rotation_EQJ_HOR(date, observer);
  return (raHours, decDeg) => {
    const eqSphere = new Astronomy.Spherical(decDeg, raHours * 15, 1);
    const eqVec = Astronomy.VectorFromSphere(eqSphere, date);
    const horVec = Astronomy.RotateVector(rot, eqVec);
    const hor = Astronomy.HorizonFromVector(horVec, NO_REFRACTION);
    return { altitude: hor.lat, azimuth: hor.lon };
  };
}
