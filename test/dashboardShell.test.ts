// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
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

describe("dashboard shell", () => {
  // Note: this file constructs its own `new JSDOM(...)` window (see appGeolocation.test.ts
  // for the same pattern) — that inner window has its own independent Date/setInterval,
  // untouched by vi.useFakeTimers() (which only patches the outer test environment), so
  // the clock test below uses a short *real* wait rather than fake timers.
  it("ticks the live clock every second", async () => {
    const dom = new JSDOM(indexHtml, { runScripts: "outside-only", url: "http://localhost/" });
    dom.window.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ constellations: [], stars: [], planets: [], galaxies: [] }),
    });
    dom.window.eval(chartJs);
    dom.window.eval(statsJs);
    dom.window.eval(timeFormatJs);
    dom.window.eval(validateJs);
    dom.window.eval(appJs);

    const clockEl = byId(dom.window.document, "live-clock");
    const initialText = clockEl.textContent;

    await new Promise((resolve) => setTimeout(resolve, 1200));

    expect(clockEl.textContent).not.toBe(initialText);
  });

  it("shows stat counts matching the rendered snapshot", async () => {
    const dom = new JSDOM(indexHtml, { runScripts: "outside-only", url: "http://localhost/" });
    dom.window.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        constellations: ["Orion"],
        stars: [
          { name: "Sirius", altitude: 30, azimuth: 100, constellation: "Canis Major", magnitude: -1.4 },
          { name: "Vega", altitude: 40, azimuth: 200, constellation: "Lyra", magnitude: 0.03 },
        ],
        planets: [{ name: "Jupiter", altitude: 20, azimuth: 50 }],
        galaxies: [],
      }),
    });
    dom.window.eval(chartJs);
    dom.window.eval(statsJs);
    dom.window.eval(timeFormatJs);
    dom.window.eval(validateJs);
    dom.window.eval(appJs);

    await vi.waitFor(() => {
      expect(byId(dom.window.document, "lists").hidden).toBe(false);
    });

    const doc = dom.window.document;
    expect(byId(doc, "stat-stars").textContent).toBe("2");
    expect(byId(doc, "stat-planets").textContent).toBe("1");
    expect(byId(doc, "stat-galaxies").textContent).toBe("0");
    expect(byId(doc, "stat-constellations").textContent).toBe("1");
  });
});
