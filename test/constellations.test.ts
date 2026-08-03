import { describe, it, expect } from "vitest";
import * as Astronomy from "astronomy-engine";
import {
  computeVisibleConstellations,
  classifyStarConstellation,
  resolveConstellationName,
} from "../src/sky/constellations";

const OBSERVER = new Astronomy.Observer(51.4769, -0.0005, 0);
const FIXED_DATE = new Date("2026-01-15T20:00:00Z");

// Verified live during Phase 2 planning (docs/plan.md) and spot-checked against
// real astronomical references (Orion/Taurus/Cassiopeia dominate a January
// evening from mid-northern latitudes; summer constellations like Scorpius and
// Sagittarius are correctly absent).
const EXPECTED_VISIBLE_CONSTELLATIONS = [
  "Andromeda", "Aquarius", "Aries", "Auriga", "Bootes", "Caelum",
  "Camelopardalis", "Cancer", "Canes Venatici", "Canis Major", "Canis Minor",
  "Cassiopeia", "Cepheus", "Cetus", "Columba", "Coma Berenices",
  "Corona Borealis", "Cygnus", "Delphinus", "Draco", "Equuleus", "Eridanus",
  "Fornax", "Gemini", "Hercules", "Hydra", "Lacerta", "Leo", "Leo Minor",
  "Lepus", "Lynx", "Lyra", "Monoceros", "Orion", "Pegasus", "Perseus",
  "Pisces", "Puppis", "Sagitta", "Sculptor", "Sextans", "Taurus", "Triangulum",
  "Ursa Major", "Ursa Minor", "Vulpecula",
].sort();

describe("computeVisibleConstellations", () => {
  it("matches the verified constellation set for a fixed observer/time", () => {
    const result = computeVisibleConstellations(OBSERVER, FIXED_DATE);
    expect(result).toEqual(EXPECTED_VISIBLE_CONSTELLATIONS);
  });

  it("completes quickly and doesn't hang at alt=90 (regression for the refraction gotcha)", () => {
    const start = performance.now();
    computeVisibleConstellations(OBSERVER, FIXED_DATE);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});

describe("classifyStarConstellation", () => {
  it("classifies Polaris as Ursa Minor", () => {
    expect(classifyStarConstellation(2.5303, 89.26411)).toBe("Ursa Minor");
  });

  it("classifies Sirius as Canis Major", () => {
    expect(classifyStarConstellation(6.752481, -16.716116)).toBe("Canis Major");
  });
});

describe("resolveConstellationName", () => {
  it("corrects the 3 misspelled names in astronomy-engine's own table", () => {
    expect(resolveConstellationName(new Astronomy.ConstellationInfo("Ant", "Antila", 0, 0))).toBe("Antlia");
    expect(resolveConstellationName(new Astronomy.ConstellationInfo("Cam", "Camelopardis", 0, 0))).toBe(
      "Camelopardalis"
    );
    expect(resolveConstellationName(new Astronomy.ConstellationInfo("PsA", "Pisces Austrinus", 0, 0))).toBe(
      "Piscis Austrinus"
    );
  });

  it("passes other names through unchanged", () => {
    expect(resolveConstellationName(new Astronomy.ConstellationInfo("UMi", "Ursa Minor", 0, 0))).toBe("Ursa Minor");
  });
});
