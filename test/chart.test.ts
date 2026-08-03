import { describe, it, expect } from "vitest";

const {
  computeChartLayout,
  anchorForX,
  selectLabeledItems,
  layoutLabelPositions,
  LABEL_LIMIT,
  EDGE_MARGIN,
  MIN_LABEL_GAP,
} = require("../public/chart.js");

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

describe("anchorForX", () => {
  it("anchors start near the left edge, end near the right edge, and middle elsewhere", () => {
    const width = 360;
    expect(anchorForX(EDGE_MARGIN - 1, width)).toBe("start");
    expect(anchorForX(EDGE_MARGIN, width)).toBe("middle");
    expect(anchorForX(width - EDGE_MARGIN, width)).toBe("middle");
    expect(anchorForX(width - EDGE_MARGIN + 1, width)).toBe("end");
  });
});

describe("selectLabeledItems", () => {
  it("labels the LABEL_LIMIT brightest (lowest-magnitude) stars, plus every item without a magnitude", () => {
    const stars = Array.from({ length: LABEL_LIMIT + 5 }, (_, i) => ({
      type: "star",
      name: `Star ${i}`,
      x: i,
      magnitude: i, // ascending magnitude: Star 0 is brightest
    }));
    const planet = { type: "planet", name: "Planet", x: 0, magnitude: null };
    const galaxy = { type: "galaxy", name: "Galaxy", x: 0, magnitude: undefined };
    const items = [...stars, planet, galaxy];

    const labeled = selectLabeledItems(items);

    expect(labeled.size).toBe(LABEL_LIMIT + 2);
    expect(labeled.has(planet)).toBe(true);
    expect(labeled.has(galaxy)).toBe(true);
    for (let i = 0; i < LABEL_LIMIT; i++) {
      expect(labeled.has(stars[i])).toBe(true);
    }
    for (let i = LABEL_LIMIT; i < stars.length; i++) {
      expect(labeled.has(stars[i])).toBe(false);
    }
  });
});

describe("layoutLabelPositions", () => {
  it("keeps each item's own x when items are already spaced apart", () => {
    const items = [
      { name: "A", x: 0 },
      { name: "B", x: 100 },
      { name: "C", x: 200 },
    ];

    const positions = layoutLabelPositions(items, 360);

    expect(positions.get(items[0])).toEqual({ x: 0, above: true });
    expect(positions.get(items[1])).toEqual({ x: 100, above: false });
    expect(positions.get(items[2])).toEqual({ x: 200, above: true });
  });

  it("nudges overlapping items apart by at least MIN_LABEL_GAP", () => {
    const items = [
      { name: "A", x: 100 },
      { name: "B", x: 101 },
      { name: "C", x: 102 },
    ];

    const positions = layoutLabelPositions(items, 360);
    const xs = items.map((item) => positions.get(item).x);

    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(MIN_LABEL_GAP);
    expect(xs[2] - xs[1]).toBeGreaterThanOrEqual(MIN_LABEL_GAP);
  });

  it("clamps a dense cluster to width - EDGE_MARGIN instead of pushing labels off-chart", () => {
    const width = 360;
    // 16 items packed together near the right edge — the gap-preserving nudge
    // alone would push the last several past `width`.
    const items = Array.from({ length: 16 }, (_, i) => ({ name: `Item ${i}`, x: 350 + i * 0.1 }));

    const positions = layoutLabelPositions(items, width);

    for (const item of items) {
      const x = positions.get(item).x;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(width - EDGE_MARGIN);
    }
  });
});
