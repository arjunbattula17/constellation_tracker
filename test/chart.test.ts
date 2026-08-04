import { describe, it, expect } from "vitest";

const { describeItem } = require("../public/chart.js");

describe("describeItem", () => {
  it("lists type, name, altitude, azimuth, magnitude, and constellation for a star", () => {
    const lines = describeItem({
      type: "star",
      name: "Sirius",
      altitude: 30.25,
      azimuth: 100.4,
      magnitude: -1.44,
      constellation: "Canis Major",
    });
    expect(lines).toEqual([
      "Star: Sirius",
      "Altitude: 30.3°",
      "Azimuth: 100.4°",
      "Magnitude: -1.44",
      "Constellation: Canis Major",
    ]);
  });

  it("omits magnitude and constellation for a planet", () => {
    const lines = describeItem({ type: "planet", name: "Jupiter", altitude: 20, azimuth: 50 });
    expect(lines).toEqual(["Planet: Jupiter", "Altitude: 20.0°", "Azimuth: 50.0°"]);
  });

  it("includes an illumination percentage for the Moon", () => {
    const lines = describeItem({
      type: "moon",
      name: "Moon",
      altitude: 15,
      azimuth: 120,
      illumination: 0.732,
    });
    expect(lines).toContain("Illumination: 73%");
  });
});
