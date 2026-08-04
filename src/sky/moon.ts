import * as Astronomy from "astronomy-engine";
import { MoonInfo } from "./types";

// Computes the Moon's local position and phase, or null when it is below the horizon
// (matching how planets/galaxies are omitted when not up). `phase` is the 0–360°
// lunar phase (0 new, 90 first quarter, 180 full, 270 last quarter) — it tells the
// client waxing vs waning; `illumination` is the lit fraction of the disk (0..1).
export function computeMoon(observer: Astronomy.Observer, date: Date): MoonInfo | null {
  const equ = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);
  const hor = Astronomy.Horizon(date, observer, equ.ra, equ.dec, "normal");
  if (hor.altitude < 0) return null;

  return {
    name: "Moon",
    altitude: hor.altitude,
    azimuth: hor.azimuth,
    phase: Astronomy.MoonPhase(date),
    illumination: Astronomy.Illumination(Astronomy.Body.Moon, date).phase_fraction,
  };
}
