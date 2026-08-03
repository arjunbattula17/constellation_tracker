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

const EMPTY_SNAPSHOT = { constellations: [], stars: [], planets: [], galaxies: [] };

function byId<T extends HTMLElement = HTMLElement>(doc: Document, id: string): T {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`Expected #${id} to exist`);
  return el as T;
}

function setup() {
  const dom = new JSDOM(indexHtml, { runScripts: "outside-only", url: "http://localhost/" });
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => EMPTY_SNAPSHOT,
  });
  dom.window.fetch = fetchMock;
  // Order matches index.html's <script> tags: app.js's demo-load fetch fires
  // immediately, and its renderSnapshot path needs chart.js's computeChartLayout,
  // stats.js's computeStats, and validate.js's validateCoordinates already defined.
  dom.window.eval(chartJs);
  dom.window.eval(statsJs);
  dom.window.eval(timeFormatJs);
  dom.window.eval(validateJs);
  dom.window.eval(appJs);
  return { dom, fetchMock };
}

function stubGeolocation(dom: JSDOM, geolocation: unknown) {
  Object.defineProperty(dom.window.navigator, "geolocation", {
    value: geolocation,
    configurable: true,
  });
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
    expect(byId(dom.window.document, "manual-location-message").textContent).toBe(
      "Location unavailable — enter coordinates manually"
    );
  });

  it("fetches the snapshot for the granted coordinates and updates the location label", async () => {
    const { dom, fetchMock } = setup();
    fetchMock.mockClear(); // drop the initial demo-load call
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
    );
    if (!submitBtn) throw new Error("Expected manual-location-form submit button to exist");
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
    );
    if (!submitBtn) throw new Error("Expected manual-location-form submit button to exist");
    submitBtn.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(byId(dom.window.document, "manual-location-error").textContent).toBe("");
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("lat=35.6762");
    expect(calledUrl).toContain("lon=139.6503");
  });
});

describe("stale response handling", () => {
  it("keeps the newer snapshot when an older, slower request resolves later", async () => {
    const dom = new JSDOM(indexHtml, { runScripts: "outside-only", url: "http://localhost/" });
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount += 1;
      return callCount === 1 ? firstResponse : secondResponse;
    });
    dom.window.fetch = fetchMock;
    dom.window.eval(chartJs);
    dom.window.eval(statsJs);
    dom.window.eval(timeFormatJs);
    dom.window.eval(validateJs);
    dom.window.eval(appJs);
    // The demo-load fetch (call #1, "stale") fires immediately above. Trigger a
    // second, "newer" request via the manual form before call #1 resolves.
    byId<HTMLInputElement>(dom.window.document, "manual-lat").value = "35.6762";
    byId<HTMLInputElement>(dom.window.document, "manual-lon").value = "139.6503";
    const submitBtn = dom.window.document.querySelector<HTMLButtonElement>(
      '#manual-location-form button[type="submit"]'
    );
    if (!submitBtn) throw new Error("Expected manual-location-form submit button to exist");
    submitBtn.click();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Resolve the newer request first, then the stale one — the stale response
    // must not be allowed to overwrite the newer one once it finally arrives.
    resolveSecond({ ok: true, json: async () => ({ constellations: ["Newer-Marker"], stars: [], planets: [], galaxies: [] }) });
    await vi.waitFor(() =>
      expect(byId(dom.window.document, "constellations-list").textContent).toContain("Newer-Marker")
    );

    resolveFirst({ ok: true, json: async () => ({ constellations: ["Stale-Marker"], stars: [], planets: [], galaxies: [] }) });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const constellationsText = byId(dom.window.document, "constellations-list").textContent;
    expect(constellationsText).toContain("Newer-Marker");
    expect(constellationsText).not.toContain("Stale-Marker");
  });
});

describe("API error responses", () => {
  it("shows the friendly rate-limit message for a 429 response", async () => {
    const dom = new JSDOM(indexHtml, { runScripts: "outside-only", url: "http://localhost/" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "too many requests, try again shortly" }),
    });
    dom.window.fetch = fetchMock;
    dom.window.eval(chartJs);
    dom.window.eval(statsJs);
    dom.window.eval(timeFormatJs);
    dom.window.eval(validateJs);
    dom.window.eval(appJs);

    await vi.waitFor(() =>
      expect(byId(dom.window.document, "status").textContent).toBe("too many requests, try again shortly")
    );
    expect(byId(dom.window.document, "lists").hidden).toBe(true);
  });

  it("shows the friendly calculation-failure message for a 500 response", async () => {
    const dom = new JSDOM(indexHtml, { runScripts: "outside-only", url: "http://localhost/" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "couldn't calculate the sky right now, try again" }),
    });
    dom.window.fetch = fetchMock;
    dom.window.eval(chartJs);
    dom.window.eval(statsJs);
    dom.window.eval(timeFormatJs);
    dom.window.eval(validateJs);
    dom.window.eval(appJs);

    await vi.waitFor(() =>
      expect(byId(dom.window.document, "status").textContent).toBe("couldn't calculate the sky right now, try again")
    );
    expect(byId(dom.window.document, "lists").hidden).toBe(true);
  });
});

describe("auto-refresh polling", () => {
  it("re-fetches the last-used location on a poll tick, without flashing the loading state", async () => {
    const { dom, fetchMock } = setup();
    await vi.waitFor(() => expect(byId(dom.window.document, "lists").hidden).toBe(false));
    fetchMock.mockClear();

    // jsdom defaults a freshly-constructed window's document.hidden to true
    // (visibilityState "prerender") — force it to "visible" to exercise the
    // actually-polling path; the separate hidden-tab test below relies on
    // this same jsdom default instead of overriding it.
    Object.defineProperty(dom.window.document, "hidden", { value: false, configurable: true });
    (dom.window as unknown as { pollTick: () => void }).pollTick();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("lat=51.4769"); // DEFAULT_LOCATION — the last (and only) location requested so far
    expect(calledUrl).toContain("lon=-0.0005");
    // A poll tick is a silent background refresh — the #status/"Loading…" element must
    // never become visible for it, unlike a user-triggered fetch.
    expect(byId(dom.window.document, "status").hidden).toBe(true);
    expect(byId(dom.window.document, "lists").hidden).toBe(false);
  });

  it("re-fetches whichever location was most recently requested by the user, not always the default", async () => {
    const { dom, fetchMock } = setup();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    byId<HTMLInputElement>(dom.window.document, "manual-lat").value = "35.6762";
    byId<HTMLInputElement>(dom.window.document, "manual-lon").value = "139.6503";
    const submitBtn = dom.window.document.querySelector<HTMLButtonElement>(
      '#manual-location-form button[type="submit"]'
    );
    if (!submitBtn) throw new Error("Expected manual-location-form submit button to exist");
    submitBtn.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fetchMock.mockClear();

    Object.defineProperty(dom.window.document, "hidden", { value: false, configurable: true });
    (dom.window as unknown as { pollTick: () => void }).pollTick();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("lat=35.6762");
    expect(calledUrl).toContain("lon=139.6503");
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

  it("keeps showing the last-known-good dashboard when a silent poll refresh fails", async () => {
    const { dom, fetchMock } = setup();
    await vi.waitFor(() => expect(byId(dom.window.document, "lists").hidden).toBe(false));
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "boom" }) });

    Object.defineProperty(dom.window.document, "hidden", { value: false, configurable: true });
    (dom.window as unknown as { pollTick: () => void }).pollTick();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The dashboard stays up — a background refresh failure doesn't blank it out.
    expect(byId(dom.window.document, "lists").hidden).toBe(false);
    expect(byId(dom.window.document, "status").hidden).toBe(true);
  });
});
