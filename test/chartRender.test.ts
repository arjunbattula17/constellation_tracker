// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { JSDOM } from "jsdom";

const publicDir = path.join(__dirname, "..", "public");
const indexHtml = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
const chartJs = fs.readFileSync(path.join(publicDir, "chart.js"), "utf8");
const statsJs = fs.readFileSync(path.join(publicDir, "stats.js"), "utf8");
const timeFormatJs = fs.readFileSync(path.join(publicDir, "timeFormat.js"), "utf8");
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
  dom.window.eval(statsJs);
  dom.window.eval(timeFormatJs);
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

  it("clicking a dot highlights it and fills the focus panel with its details", async () => {
    const snapshot = {
      constellations: [],
      stars: [],
      planets: [{ name: "Jupiter", altitude: 20, azimuth: 50 }],
      galaxies: [],
    };
    const dom = setup(snapshot);

    await vi.waitFor(() => {
      expect(byId(dom.window.document, "lists").hidden).toBe(false);
    });

    const doc = dom.window.document;
    const circle = doc.querySelector("#sky-chart circle") as SVGCircleElement;
    circle.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

    expect(circle.classList.contains("dot-active")).toBe(true);
    expect(byId(doc, "focus-panel-content").textContent).toBe(
      ["Planet: Jupiter", "Altitude: 20.0°", "Azimuth: 50.0°"].join("\n")
    );
  });

  it("activates a dot via keyboard Enter, same as a click", async () => {
    const snapshot = {
      constellations: [],
      stars: [{ name: "Sirius", altitude: 30, azimuth: 100, constellation: "Canis Major", magnitude: -1.44 }],
      planets: [],
      galaxies: [],
    };
    const dom = setup(snapshot);

    await vi.waitFor(() => {
      expect(byId(dom.window.document, "lists").hidden).toBe(false);
    });

    const doc = dom.window.document;
    const circle = doc.querySelector("#sky-chart circle") as SVGCircleElement;
    circle.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(circle.classList.contains("dot-active")).toBe(true);
    expect(byId(doc, "focus-panel-content").textContent).toBe(
      ["Star: Sirius", "Altitude: 30.0°", "Azimuth: 100.0°", "Magnitude: -1.44", "Constellation: Canis Major"].join(
        "\n"
      )
    );
  });

  it("shows a tooltip with the item's details on hover, and hides it on mouseleave", async () => {
    const snapshot = {
      constellations: [],
      stars: [],
      planets: [{ name: "Jupiter", altitude: 20, azimuth: 50 }],
      galaxies: [],
    };
    const dom = setup(snapshot);

    await vi.waitFor(() => {
      expect(byId(dom.window.document, "lists").hidden).toBe(false);
    });

    const doc = dom.window.document;
    const circle = doc.querySelector("#sky-chart circle") as SVGCircleElement;
    const tooltip = byId(doc, "chart-tooltip");
    expect(tooltip.hidden).toBe(true);

    circle.dispatchEvent(new dom.window.MouseEvent("mouseenter", { bubbles: true, clientX: 10, clientY: 20 }));
    expect(tooltip.hidden).toBe(false);
    expect(tooltip.textContent).toBe(["Planet: Jupiter", "Altitude: 20.0°", "Azimuth: 50.0°"].join("\n"));

    circle.dispatchEvent(new dom.window.MouseEvent("mouseleave", { bubbles: true }));
    expect(tooltip.hidden).toBe(true);
  });

  it("preserves DOM node identity for an unchanged item across a refresh, and animates entering/exiting items", async () => {
    const firstSnapshot = {
      constellations: [],
      stars: [],
      planets: [
        { name: "Jupiter", altitude: 20, azimuth: 50 },
        { name: "Saturn", altitude: 10, azimuth: 80 },
      ],
      galaxies: [],
    };
    const secondSnapshot = {
      constellations: [],
      stars: [],
      // Jupiter persists (moved); Saturn is gone; Mars is new.
      planets: [
        { name: "Jupiter", altitude: 25, azimuth: 55 },
        { name: "Mars", altitude: 15, azimuth: 90 },
      ],
      galaxies: [],
    };

    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      fetchCount += 1;
      return Promise.resolve({ ok: true, json: async () => (fetchCount === 1 ? firstSnapshot : secondSnapshot) });
    });

    const dom = new JSDOM(indexHtml, { runScripts: "outside-only", url: "http://localhost/" });
    dom.window.fetch = fetchMock;
    dom.window.eval(chartJs);
    dom.window.eval(statsJs);
    dom.window.eval(timeFormatJs);
    dom.window.eval(validateJs);
    dom.window.eval(appJs);

    await vi.waitFor(() => {
      expect(byId(dom.window.document, "lists").hidden).toBe(false);
    });

    const doc = dom.window.document;
    const findCircleByTitle = (name: string) =>
      Array.from(doc.querySelectorAll("#sky-chart circle")).find((c) => c.querySelector("title")?.textContent === name);

    const jupiterBefore = findCircleByTitle("Jupiter");
    const saturnBefore = findCircleByTitle("Saturn");
    expect(jupiterBefore).toBeTruthy();
    expect(saturnBefore).toBeTruthy();
    const jupiterCxBefore = jupiterBefore!.getAttribute("cx"); // captured now — jupiterBefore is a live node reference,
    // so reading its attribute later would reflect the post-update value too, not what it was before the refresh.

    // Trigger a second fetch via the manual form.
    byId<HTMLInputElement>(doc, "manual-lat").value = "10";
    byId<HTMLInputElement>(doc, "manual-lon").value = "10";
    const submitBtn = doc.querySelector<HTMLButtonElement>('#manual-location-form button[type="submit"]');
    if (!submitBtn) throw new Error("Expected manual-location-form submit button to exist");
    submitBtn.click();

    await vi.waitFor(() => {
      expect(findCircleByTitle("Mars")).toBeTruthy();
    });

    const jupiterAfter = findCircleByTitle("Jupiter");
    expect(jupiterAfter).toBe(jupiterBefore); // same DOM node reused, not recreated
    expect(jupiterAfter!.getAttribute("cx")).not.toBe(jupiterCxBefore);

    // Saturn is no longer in the snapshot — its node is marked exiting (fading
    // out), not removed the instant it drops out, per the animated-exit design.
    const saturnAfter = findCircleByTitle("Saturn");
    expect(saturnAfter).toBe(saturnBefore);
    expect(saturnAfter!.classList.contains("dot-exiting")).toBe(true);
  });
});
