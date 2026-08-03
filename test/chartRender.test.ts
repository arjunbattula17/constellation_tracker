// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { JSDOM } from "jsdom";

const publicDir = path.join(__dirname, "..", "public");
const indexHtml = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
const chartJs = fs.readFileSync(path.join(publicDir, "chart.js"), "utf8");
const validateJs = fs.readFileSync(path.join(publicDir, "validate.js"), "utf8");
const appJs = fs.readFileSync(path.join(publicDir, "app.js"), "utf8");

function byId<T extends HTMLElement = HTMLElement>(doc: Document, id: string): T {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`Expected #${id} to exist`);
  return el as T;
}

function buildLargeSnapshot(starCount: number) {
  const stars = [];
  for (let i = 0; i < starCount; i++) {
    stars.push({
      name: `Star ${i}`,
      altitude: (i * 37) % 90,
      azimuth: (i * 53) % 360,
      constellation: "Xxx",
      magnitude: (i % 65) / 10,
    });
  }
  return {
    constellations: [],
    stars,
    planets: [{ name: "Test Planet", altitude: 30, azimuth: 100 }],
    galaxies: [{ name: "Test Galaxy", altitude: 10, azimuth: 200 }],
  };
}

function setup(snapshot: unknown) {
  const dom = new JSDOM(indexHtml, { runScripts: "outside-only", url: "http://localhost/" });
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => snapshot,
  });
  dom.window.fetch = fetchMock;
  // Order matches index.html's <script> tags — see appGeolocation.test.ts.
  dom.window.eval(chartJs);
  dom.window.eval(validateJs);
  dom.window.eval(appJs);
  return dom;
}

describe("renderChart smoke test", () => {
  it("renders one dot per object and a bounded number of labels for a ~200-object snapshot, without throwing", async () => {
    const snapshot = buildLargeSnapshot(200);
    const dom = setup(snapshot);

    await vi.waitFor(() => {
      expect(byId(dom.window.document, "lists").hidden).toBe(false);
    });

    const doc = dom.window.document;
    const circles = doc.querySelectorAll("#sky-chart circle");
    const titles = doc.querySelectorAll("#sky-chart circle title");
    const labels = doc.querySelectorAll("#sky-chart .dot-label");

    expect(circles.length).toBe(202); // 200 stars + 1 planet + 1 galaxy
    expect(titles.length).toBe(circles.length);
    // Bound is 10 brightest stars + all planets/galaxies (always labeled, no magnitude cap) = 10 + 5 + 2.
    expect(labels.length).toBeLessThanOrEqual(17);
  });

  it("keeps every label within the chart's horizontal bounds even when many labeled items cluster together", async () => {
    // 16 items packed into one azimuth region near the right edge of the chart
    // (10 bright stars + planets/galaxies, all always-labeled) so the
    // anti-collision nudge has to push several labels rightward from nearly
    // the same starting x, right where there's no room left before the edge.
    const stars = [];
    for (let i = 0; i < 10; i++) {
      stars.push({ name: `Star ${i}`, altitude: 30, azimuth: 350 + i * 0.1, constellation: "Xxx", magnitude: i / 10 });
    }
    const planets = [];
    for (let i = 0; i < 3; i++) {
      planets.push({ name: `Planet ${i}`, altitude: 30, azimuth: 350 + i * 0.1 });
    }
    const galaxies = [];
    for (let i = 0; i < 3; i++) {
      galaxies.push({ name: `Galaxy ${i}`, altitude: 30, azimuth: 350 + i * 0.1 });
    }
    const snapshot = { constellations: [], stars, planets, galaxies };
    const dom = setup(snapshot);

    await vi.waitFor(() => {
      expect(byId(dom.window.document, "lists").hidden).toBe(false);
    });

    const doc = dom.window.document;
    const svg = doc.querySelector("#sky-chart svg") as SVGSVGElement;
    const width = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
    const labels = doc.querySelectorAll("#sky-chart .dot-label");

    expect(labels.length).toBe(16);
    for (const label of Array.from(labels)) {
      const x = Number((label as SVGTextElement).getAttribute("x"));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(width);
    }
  });

  it("exposes a screen-reader-only text list of every chart item, since the chart itself is visual-only", async () => {
    const snapshot = buildLargeSnapshot(3);
    const dom = setup(snapshot);

    await vi.waitFor(() => {
      expect(byId(dom.window.document, "lists").hidden).toBe(false);
    });

    const doc = dom.window.document;
    const srList = doc.querySelector("#sky-chart .sr-only");
    expect(srList).not.toBeNull();

    const items = Array.from(srList!.querySelectorAll("li")).map((li) => li.textContent);
    expect(items).toEqual([
      "Star: Star 0",
      "Star: Star 1",
      "Star: Star 2",
      "Planet: Test Planet",
      "Galaxy: Test Galaxy",
    ]);
  });

  it("shows the server's explicit message instead of bare axes when nothing is visible", async () => {
    const snapshot = {
      constellations: ["Orion"],
      stars: [],
      planets: [],
      galaxies: [],
      message: "nothing bright visible right now",
    };
    const dom = setup(snapshot);

    await vi.waitFor(() => {
      expect(byId(dom.window.document, "lists").hidden).toBe(false);
    });

    const doc = dom.window.document;
    expect(doc.querySelector("#sky-chart svg")).toBeNull();
    expect(doc.querySelector("#sky-chart .chart-empty-message")!.textContent).toBe(
      "nothing bright visible right now"
    );
  });

  it("shows 'None currently visible' in the constellations list when none are visible", async () => {
    const snapshot = {
      constellations: [],
      stars: [],
      planets: [],
      galaxies: [],
      message: "nothing bright visible right now",
    };
    const dom = setup(snapshot);

    await vi.waitFor(() => {
      expect(byId(dom.window.document, "lists").hidden).toBe(false);
    });

    const doc = dom.window.document;
    const items = Array.from(doc.querySelectorAll("#constellations-list li")).map((li) => li.textContent);
    expect(items).toEqual(["None currently visible"]);
  });
});
