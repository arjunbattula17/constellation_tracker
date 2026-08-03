import { describe, it, expect } from "vitest";

const { computeStats } = require("../public/stats.js");

describe("computeStats", () => {
  it("counts each category from a snapshot", () => {
    const snapshot = {
      constellations: ["Orion", "Taurus"],
      stars: [{ name: "Sirius" }, { name: "Vega" }, { name: "Rigel" }],
      planets: [{ name: "Jupiter" }],
      galaxies: [],
    };

    expect(computeStats(snapshot)).toEqual({
      stars: 3,
      planets: 1,
      galaxies: 0,
      constellations: 2,
    });
  });

  it("counts an all-empty snapshot as all zeros", () => {
    const snapshot = { constellations: [], stars: [], planets: [], galaxies: [] };

    expect(computeStats(snapshot)).toEqual({ stars: 0, planets: 0, galaxies: 0, constellations: 0 });
  });
});
