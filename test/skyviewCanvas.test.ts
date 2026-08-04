// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
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
  stars: [{ name: "Rigel", altitude: 35, azimuth: 150, magnitude: 0.13, constellation: "Orion" }],
  planets: [{ name: "Jupiter", altitude: 40, azimuth: 120 }],
  galaxies: [],
  starfield: Array.from({ length: 300 }, (_, i) => ({
    altitude: (i * 37) % 90,
    azimuth: (i * 53) % 360,
    magnitude: (i % 60) / 10,
    name: null,
  })),
  constellationLines: [
    { id: "Ori", name: "Orion", segments: [[[150, 35], [155, 40], [160, 30]]], label: { altitude: 38, azimuth: 152 } },
  ],
  moon: { name: "Moon", altitude: 25, azimuth: 90, phase: 90, illumination: 0.5 },
  milkyway: [{ level: 3, points: [[100, 10], [120, 40], [140, 20], [130, 5]] }],
  message: null,
};

// A recording 2D context: counts the draw calls skyview issues so we can assert the
// canvas path actually ran (jsdom's real getContext returns null, so this branch is
// otherwise never exercised). Not a pixel check — that needs a real browser.
function makeRecorder() {
  const calls: Record<string, number> = {};
  const bump = (k: string) => (calls[k] = (calls[k] || 0) + 1);
  const grad = { addColorStop() {} };
  const ctx = {
    calls,
    setTransform: () => bump("setTransform"),
    clearRect: () => bump("clearRect"),
    fillRect: () => bump("fillRect"),
    createRadialGradient: () => (bump("createRadialGradient"), grad),
    createLinearGradient: () => (bump("createLinearGradient"), grad),
    beginPath: () => bump("beginPath"),
    closePath: () => bump("closePath"),
    moveTo: () => bump("moveTo"),
    lineTo: () => bump("lineTo"),
    arc: () => bump("arc"),
    rect: () => bump("rect"),
    clip: () => bump("clip"),
    save: () => bump("save"),
    restore: () => bump("restore"),
    fill: () => bump("fill"),
    stroke: () => bump("stroke"),
    fillText: () => bump("fillText"),
    set fillStyle(_v: unknown) {},
    set strokeStyle(_v: unknown) {},
    set lineWidth(_v: unknown) {},
    set globalAlpha(_v: unknown) {},
    set font(_v: unknown) {},
    set textAlign(_v: unknown) {},
    set textBaseline(_v: unknown) {},
  };
  return ctx;
}

function setup() {
  const dom = new JSDOM(indexHtml, { runScripts: "outside-only", url: "http://localhost/" });
  const win = dom.window as unknown as Record<string, unknown> & {
    HTMLCanvasElement: { prototype: { getContext: unknown } };
    document: Document;
    eval: (s: string) => void;
  };
  const recorder = makeRecorder();
  win.HTMLCanvasElement.prototype.getContext = () => recorder;
  // Starfield dots are batched into Path2D objects (not ctx.arc), so count arcs here.
  const pathArcs = { count: 0 };
  (win as Record<string, unknown>).Path2D = class {
    moveTo() {}
    arc() {
      pathArcs.count++;
    }
    lineTo() {}
    closePath() {}
  };
  (win as Record<string, unknown>).requestAnimationFrame = (cb: () => void) => {
    cb(); // draw synchronously so the recorder is populated immediately
    return 0;
  };
  dom.window.eval(projectionJs);
  dom.window.eval(chartJs);
  dom.window.eval(skyviewJs);
  const create = (win as unknown as { createSkyView: (r: Element, o: unknown) => { setSnapshot: (s: unknown) => void; setMode: (m: string) => void } }).createSkyView;
  const view = create(win.document.getElementById("sky-view")!, {
    tooltipEl: win.document.getElementById("chart-tooltip"),
    infoEl: win.document.getElementById("info-content"),
  });
  return { view, recorder, pathArcs };
}

describe("SkyView canvas drawing (recording context)", () => {
  it("draws the starfield, figure lines, Milky Way, and cardinal labels in circular mode", () => {
    const { view, recorder, pathArcs } = setup();
    expect(() => view.setSnapshot(SNAPSHOT)).not.toThrow();
    expect(pathArcs.count).toBeGreaterThan(50); // hundreds of starfield dots (batched Path2D arcs)
    expect(recorder.calls.stroke).toBeGreaterThan(0); // constellation figure lines
    expect(recorder.calls.fill).toBeGreaterThan(0); // Milky Way + starfield buckets
    expect(recorder.calls.fillText).toBeGreaterThanOrEqual(4); // N/E/S/W
    expect(recorder.calls.clip).toBeGreaterThan(0); // clipped to the sky disk
  });

  it("draws the twilight gradient and horizon in landscape mode", () => {
    const { view, recorder, pathArcs } = setup();
    view.setSnapshot(SNAPSHOT);
    const before = recorder.calls.fillRect || 0;
    pathArcs.count = 0;
    view.setMode("landscape");
    expect(recorder.calls.createLinearGradient).toBeGreaterThan(0); // vertical twilight gradient
    expect(recorder.calls.fillRect).toBeGreaterThan(before); // gradient sky rectangle
    expect(pathArcs.count).toBeGreaterThan(0); // starfield within the window still drawn
  });
});
