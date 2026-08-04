// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { JSDOM } from "jsdom";

const publicDir = path.join(__dirname, "..", "public");
const indexHtml = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
const projectionJs = fs.readFileSync(path.join(publicDir, "projection.js"), "utf8");
const chartJs = fs.readFileSync(path.join(publicDir, "chart.js"), "utf8");
const skyviewJs = fs.readFileSync(path.join(publicDir, "skyview.js"), "utf8");

const SNAPSHOT = {
  constellations: ["Orion"],
  stars: [
    { name: "Rigel", altitude: 35, azimuth: 150, magnitude: 0.13, constellation: "Orion" },
  ],
  planets: [{ name: "Jupiter", altitude: 40, azimuth: 120 }],
  galaxies: [{ name: "Andromeda Galaxy", altitude: 55, azimuth: 300 }],
  starfield: [
    { altitude: 20, azimuth: 10, magnitude: 4.5, name: null },
    { altitude: 60, azimuth: 200, magnitude: 2.1, name: null },
    { altitude: 35, azimuth: 150, magnitude: 0.13, name: "Rigel" },
  ],
  constellationLines: [
    {
      id: "Ori",
      name: "Orion",
      segments: [[[150, 35], [155, 40], [160, 30]]],
      label: { altitude: 38, azimuth: 152 },
    },
  ],
  moon: { name: "Moon", altitude: 25, azimuth: 90, phase: 90, illumination: 0.5 },
  milkyway: [{ level: 3, points: [[100, 10], [120, 40], [140, 20]] }],
  message: null,
};

// Builds a JSDOM window with projection.js, chart.js, skyview.js evaluated, then
// creates a SkyView on #sky-view. app.js is intentionally not evaluated here — this
// exercises the renderer in isolation.
function setup() {
  const dom = new JSDOM(indexHtml, { runScripts: "outside-only", url: "http://localhost/" });
  const win = dom.window as unknown as {
    createSkyView: (root: Element, opts: unknown) => {
      setSnapshot: (s: unknown) => void;
      setMode: (m: string) => void;
      getMode: () => string;
    };
    document: Document;
    eval: (s: string) => void;
  };
  dom.window.eval(projectionJs);
  dom.window.eval(chartJs);
  dom.window.eval(skyviewJs);
  const root = win.document.getElementById("sky-view")!;
  const view = win.createSkyView(root, {
    tooltipEl: win.document.getElementById("chart-tooltip"),
    infoEl: win.document.getElementById("info-content"),
  });
  return { dom, win, view, root };
}

describe("SkyView rendering", () => {
  it("renders an interactive SVG marker for each planet, star, galaxy, and the Moon", async () => {
    const { win, view } = setup();
    view.setSnapshot(SNAPSHOT);

    const svg = win.document.querySelector("#sky-view svg")!;
    await vi.waitFor(() => {
      expect(svg.querySelector('[aria-label="Jupiter"]')).not.toBeNull();
    });
    expect(svg.querySelector('[aria-label="Rigel"]')).not.toBeNull();
    expect(svg.querySelector('[aria-label="Andromeda Galaxy"]')).not.toBeNull();
    expect(svg.querySelector('[aria-label="Moon"]')).not.toBeNull();
  });

  it("labels bright bodies and the constellation figure", async () => {
    const { win, view } = setup();
    view.setSnapshot(SNAPSHOT);
    const svg = win.document.querySelector("#sky-view svg")!;
    await vi.waitFor(() => {
      const labels = Array.from(svg.querySelectorAll("text")).map((t) => t.textContent);
      expect(labels).toContain("Orion"); // constellation figure label
      expect(labels).toContain("Jupiter"); // body label
    });
  });

  it("selecting a body writes its details into the info overlay", async () => {
    const { win, view } = setup();
    view.setSnapshot(SNAPSHOT);
    const svg = win.document.querySelector("#sky-view svg")!;
    await vi.waitFor(() => expect(svg.querySelector('[aria-label="Jupiter"]')).not.toBeNull());

    (svg.querySelector('[aria-label="Jupiter"]') as unknown as { dispatchEvent: (e: Event) => void }).dispatchEvent(
      new win.document.defaultView!.MouseEvent("click", { bubbles: true })
    );

    expect(win.document.getElementById("info-content")!.textContent).toContain("Jupiter");
  });

  it("toggles between circular and landscape modes", () => {
    const { view, root } = setup();
    expect(view.getMode()).toBe("circular");
    view.setMode("landscape");
    expect(view.getMode()).toBe("landscape");
    expect(root.getAttribute("data-mode")).toBe("landscape");
  });

  it("does not throw when the canvas 2D context is unavailable (jsdom) or the sky is empty", () => {
    const { view } = setup();
    // getContext returns null in jsdom — rendering must degrade to the SVG overlay only.
    expect(() => view.setSnapshot(SNAPSHOT)).not.toThrow();
    expect(() =>
      view.setSnapshot({
        constellations: [],
        stars: [],
        planets: [],
        galaxies: [],
        starfield: [],
        constellationLines: [],
        moon: null,
        milkyway: [],
        message: "nothing bright visible right now",
      })
    ).not.toThrow();
  });

  it("removes overlay markers for objects that drop out on a refresh", async () => {
    const { win, view } = setup();
    view.setSnapshot(SNAPSHOT);
    const svg = win.document.querySelector("#sky-view svg")!;
    await vi.waitFor(() => expect(svg.querySelector('[aria-label="Jupiter"]')).not.toBeNull());

    view.setSnapshot({ ...SNAPSHOT, planets: [] });
    expect(svg.querySelector('[aria-label="Jupiter"]')).toBeNull();
    expect(svg.querySelector('[aria-label="Rigel"]')).not.toBeNull();
  });
});
