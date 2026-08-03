import { describe, it, expect } from "vitest";

const { computeChartLayout } = require("../public/chart.js");

describe("computeChartLayout", () => {
  it("maps azimuth 0/90/180/270/360 and altitude 0/45/90 to exact x/y on a 360x90 chart", () => {
    const snapshot = {
      constellations: [],
      stars: [
        { name: "North Horizon Star", altitude: 0, azimuth: 0, constellation: "Xxx", magnitude: 1.5 },
        { name: "East Mid Star", altitude: 45, azimuth: 90, constellation: "Xxx", magnitude: 2.5 },
      ],
      planets: [
        { name: "South Zenith Planet", altitude: 90, azimuth: 180 },
      ],
      galaxies: [
        { name: "West Horizon Galaxy", altitude: 0, azimuth: 270 },
        { name: "North Wrap Galaxy", altitude: 0, azimuth: 360 },
      ],
    };

    const layout = computeChartLayout(snapshot);

    expect(layout.width).toBe(360);
    expect(layout.height).toBe(90);
    expect(layout.items).toEqual([
      { type: "star", name: "North Horizon Star", x: 0, y: 90, magnitude: 1.5 },
      { type: "star", name: "East Mid Star", x: 90, y: 45, magnitude: 2.5 },
      { type: "planet", name: "South Zenith Planet", x: 180, y: 0, magnitude: null },
      { type: "galaxy", name: "West Horizon Galaxy", x: 270, y: 90, magnitude: null },
      { type: "galaxy", name: "North Wrap Galaxy", x: 360, y: 90, magnitude: null },
    ]);
  });

  it("honors custom width/height in opts", () => {
    const snapshot = {
      constellations: [],
      stars: [{ name: "Test Star", altitude: 45, azimuth: 180, constellation: "Xxx", magnitude: 1.0 }],
      planets: [],
      galaxies: [],
    };

    const layout = computeChartLayout(snapshot, { width: 720, height: 200 });

    expect(layout.width).toBe(720);
    expect(layout.height).toBe(200);
    expect(layout.items).toEqual([{ type: "star", name: "Test Star", x: 360, y: 100, magnitude: 1.0 }]);
  });
});
