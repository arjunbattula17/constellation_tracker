// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { JSDOM } from "jsdom";

const publicDir = path.join(__dirname, "..", "public");
const indexHtml = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
const projectionJs = fs.readFileSync(path.join(publicDir, "projection.js"), "utf8");
const chartJs = fs.readFileSync(path.join(publicDir, "chart.js"), "utf8");
const validateJs = fs.readFileSync(path.join(publicDir, "validate.js"), "utf8");
const skyviewJs = fs.readFileSync(path.join(publicDir, "skyview.js"), "utf8");
const appJs = fs.readFileSync(path.join(publicDir, "app.js"), "utf8");

const EMPTY_SNAPSHOT = {
  constellations: [],
  stars: [],
  planets: [],
  galaxies: [],
  starfield: [],
  constellationLines: [],
  moon: null,
  milkyway: [],
  message: null,
};

function snapshotWithPlanet(name: string) {
  return { ...EMPTY_SNAPSHOT, planets: [{ name, altitude: 40, azimuth: 120 }] };
}

function byId<T extends HTMLElement = HTMLElement>(doc: Document, id: string): T {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`Expected #${id} to exist`);
  return el as T;
}

// Evaluates the page scripts in index.html's <script> order: projection.js,
// chart.js, validate.js, skyview.js, then app.js (whose demo-load fetch fires
// immediately and depends on the others being defined).
function evalScripts(dom: JSDOM) {
  dom.window.eval(projectionJs);
  dom.window.eval(chartJs);
  dom.window.eval(validateJs);
  dom.window.eval(skyviewJs);
  dom.window.eval(appJs);
}

function setup(snapshot: unknown = EMPTY_SNAPSHOT) {
  const dom = new JSDOM(indexHtml, { runScripts: "outside-only", url: "http://localhost/" });
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot });
  dom.window.fetch = fetchMock;
  evalScripts(dom);
  return { dom, fetchMock };
}

function stubGeolocation(dom: JSDOM, geolocation: unknown) {
  Object.defineProperty(dom.window.navigator, "geolocation", { value: geolocation, configurable: true });
}

function overlayHas(doc: Document, name: string): boolean {
  return doc.querySelector(`#sky-view svg [aria-label="${name}"]`) !== null;
}

describe("Use my location button", () => {
  it("reveals the manual fallback when geolocation is unavailable (jsdom has no navigator.geolocation)", () => {
    const { dom } = setup();
    expect("geolocation" in dom.window.navigator).toBe(false);
    byId(dom.window.document, "use-location-btn").click();
    expect(byId(dom.window.document, "manual-location").hidden).toBe(false);
    expect(byId(dom.window.document, "manual-location-message").textContent).toBe(
      "Location unavailable — enter coordinates manually"
    );
  });

  it("reveals the manual fallback when permission is denied", () => {
    const { dom } = setup();
    stubGeolocation(dom, {
      getCurrentPosition: (_success: unknown, error: (err: unknown) => void) => error({ code: 1 }),
    });
    byId(dom.window.document, "use-location-btn").click();
    expect(byId(dom.window.document, "manual-location").hidden).toBe(false);
  });

  it("fetches the snapshot for the granted coordinates and updates the location label", async () => {
    const { dom, fetchMock } = setup();
    fetchMock.mockClear();
    stubGeolocation(dom, {
      getCurrentPosition: (success: (pos: unknown) => void) =>
        success({ coords: { latitude: 35.6762, longitude: 139.6503 } }),
    });

    byId(dom.window.document, "use-location-btn").click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("lat=35.6762");
    expect(calledUrl).toContain("lon=139.6503");
    expect(byId(dom.window.document, "location-label").textContent).toBe(
      "Showing the sky right now for your location."
    );
  });
});

describe("manual location form", () => {
  it("shows an inline error and does not send a request for an out-of-range coordinate", () => {
    const { dom, fetchMock } = setup();
    fetchMock.mockClear();
    byId<HTMLInputElement>(dom.window.document, "manual-lat").value = "200";
    byId<HTMLInputElement>(dom.window.document, "manual-lon").value = "0";
    const submitBtn = dom.window.document.querySelector<HTMLButtonElement>(
      '#manual-location-form button[type="submit"]'
    )!;
    submitBtn.click();
    expect(byId(dom.window.document, "manual-location-error").textContent).toMatch(/latitude/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the snapshot for a valid manual coordinate and clears the error", async () => {
    const { dom, fetchMock } = setup();
    fetchMock.mockClear();
    byId<HTMLInputElement>(dom.window.document, "manual-lat").value = "35.6762";
    byId<HTMLInputElement>(dom.window.document, "manual-lon").value = "139.6503";
    const submitBtn = dom.window.document.querySelector<HTMLButtonElement>(
      '#manual-location-form button[type="submit"]'
    )!;
    submitBtn.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(byId(dom.window.document, "manual-location-error").textContent).toBe("");
    expect((fetchMock.mock.calls[0][0] as string)).toContain("lat=35.6762");
  });
});

describe("view toggle", () => {
  it("switches the sky-view mode and the active button when Horizon is chosen", () => {
    const { dom } = setup();
    const toggle = byId(dom.window.document, "view-toggle");
    const horizonBtn = toggle.querySelector<HTMLButtonElement>('button[data-mode="landscape"]')!;
    horizonBtn.click();
    expect(byId(dom.window.document, "sky-view").getAttribute("data-mode")).toBe("landscape");
    expect(horizonBtn.classList.contains("active")).toBe(true);
    expect(horizonBtn.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("stale response handling", () => {
  it("keeps the newer snapshot when an older, slower request resolves later", async () => {
    const dom = new JSDOM(indexHtml, { runScripts: "outside-only", url: "http://localhost/" });
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    const firstResponse = new Promise((resolve) => (resolveFirst = resolve));
    const secondResponse = new Promise((resolve) => (resolveSecond = resolve));
    let callCount = 0;
    dom.window.fetch = vi.fn().mockImplementation(() => {
      callCount += 1;
      return callCount === 1 ? firstResponse : secondResponse;
    });
    evalScripts(dom);

    // The demo-load fetch (call #1, "stale") fired on load. Trigger a newer request
    // via the manual form before call #1 resolves.
    byId<HTMLInputElement>(dom.window.document, "manual-lat").value = "35.6762";
    byId<HTMLInputElement>(dom.window.document, "manual-lon").value = "139.6503";
    dom.window.document
      .querySelector<HTMLButtonElement>('#manual-location-form button[type="submit"]')!
      .click();

    resolveSecond({ ok: true, json: async () => snapshotWithPlanet("NewerPlanet") });
    await vi.waitFor(() => expect(overlayHas(dom.window.document, "NewerPlanet")).toBe(true));

    resolveFirst({ ok: true, json: async () => snapshotWithPlanet("StalePlanet") });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(overlayHas(dom.window.document, "NewerPlanet")).toBe(true);
    expect(overlayHas(dom.window.document, "StalePlanet")).toBe(false);
  });
});

describe("API error responses", () => {
  it("shows the friendly rate-limit message for a 429 response", async () => {
    const dom = new JSDOM(indexHtml, { runScripts: "outside-only", url: "http://localhost/" });
    dom.window.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "too many requests, try again shortly" }),
    });
    evalScripts(dom);
    await vi.waitFor(() =>
      expect(byId(dom.window.document, "status").textContent).toBe("too many requests, try again shortly")
    );
    expect(byId(dom.window.document, "status").hidden).toBe(false);
  });

  it("shows the friendly calculation-failure message for a 500 response", async () => {
    const dom = new JSDOM(indexHtml, { runScripts: "outside-only", url: "http://localhost/" });
    dom.window.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "couldn't calculate the sky right now, try again" }),
    });
    evalScripts(dom);
    await vi.waitFor(() =>
      expect(byId(dom.window.document, "status").textContent).toBe("couldn't calculate the sky right now, try again")
    );
  });
});

describe("auto-refresh polling", () => {
  it("re-fetches the last-used location on a poll tick, silently (no loading flash)", async () => {
    const { dom, fetchMock } = setup();
    // Wait for the initial demo render to finish (status hidden again) before polling.
    await vi.waitFor(() => expect(byId(dom.window.document, "status").hidden).toBe(true));
    fetchMock.mockClear();

    // jsdom defaults document.hidden to true (visibilityState "prerender") — force
    // visible to exercise the actually-polling path.
    Object.defineProperty(dom.window.document, "hidden", { value: false, configurable: true });
    (dom.window as unknown as { pollTick: () => void }).pollTick();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("lat=51.4769"); // DEFAULT_LOCATION
    expect(byId(dom.window.document, "status").hidden).toBe(true); // silent — no loading flash
  });

  it("re-fetches whichever location was most recently requested by the user, not always the default", async () => {
    const { dom, fetchMock } = setup();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    byId<HTMLInputElement>(dom.window.document, "manual-lat").value = "35.6762";
    byId<HTMLInputElement>(dom.window.document, "manual-lon").value = "139.6503";
    dom.window.document
      .querySelector<HTMLButtonElement>('#manual-location-form button[type="submit"]')!
      .click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fetchMock.mockClear();

    Object.defineProperty(dom.window.document, "hidden", { value: false, configurable: true });
    (dom.window as unknown as { pollTick: () => void }).pollTick();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((fetchMock.mock.calls[0][0] as string)).toContain("lat=35.6762");
  });

  it("skips a poll tick entirely while the document is hidden", async () => {
    const { dom, fetchMock } = setup();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockClear();
    Object.defineProperty(dom.window.document, "hidden", { value: true, configurable: true });
    (dom.window as unknown as { pollTick: () => void }).pollTick();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the last-known-good sky when a silent poll refresh fails", async () => {
    const { dom, fetchMock } = setup(snapshotWithPlanet("Jupiter"));
    await vi.waitFor(() => expect(overlayHas(dom.window.document, "Jupiter")).toBe(true));
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "boom" }) });

    Object.defineProperty(dom.window.document, "hidden", { value: false, configurable: true });
    (dom.window as unknown as { pollTick: () => void }).pollTick();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The sky stays up — a background refresh failure doesn't blank it or flash an error.
    expect(overlayHas(dom.window.document, "Jupiter")).toBe(true);
    expect(byId(dom.window.document, "status").hidden).toBe(true);
  });
});

describe("live clock", () => {
  it("ticks the live clock every second", async () => {
    const { dom } = setup();
    const clockEl = byId(dom.window.document, "live-clock");
    const initialText = clockEl.textContent;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(clockEl.textContent).not.toBe(initialText);
  });
});
