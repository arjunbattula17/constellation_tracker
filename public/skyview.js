// Renders a sky snapshot as either a circular all-sky chart or a pannable landscape
// horizon slice, over a hybrid Canvas (dense starfield, figure lines, Milky Way,
// gradient, horizon) + SVG overlay (interactive planets/Moon/named stars/galaxies).
// Both layers share one view transform so they stay aligned under pan/zoom.
//
// Pure projection/styling math lives in projection.js (globals here). This file owns
// pixels, DOM, canvas, and interaction, so it is exercised via the jsdom render test
// rather than pure unit tests; all canvas work is guarded so it no-ops where
// getContext() returns null (jsdom without the native canvas package).

const SKY_SVG_NS = "http://www.w3.org/2000/svg";
const BODY_COLORS = { planet: "#7cb3e8", galaxy: "#e06fa8", star: "#ffe9b0", moon: "#f4f0e0" };

const CIRCULAR_ZOOM = { min: 1, max: 8 };
const LANDSCAPE_PXPERDEG = { min: 4, max: 40 };
const LANDSCAPE_DEFAULT_PXPERDEG = 9; // ~ a 90°-wide window on a ~800px canvas

// Named/bright objects get a text label; faint background stars never do.
const STAR_LABEL_MAX_MAG = 2.4;

function createSkyView(root, opts) {
  const tooltipEl = opts && opts.tooltipEl;
  const infoEl = opts && opts.infoEl;

  const canvas = document.createElement("canvas");
  canvas.className = "sky-canvas";
  const svg = document.createElementNS(SKY_SVG_NS, "svg");
  svg.setAttribute("class", "sky-overlay");
  root.appendChild(canvas);
  root.appendChild(svg);

  const state = {
    mode: "circular",
    snapshot: null,
    width: 0,
    height: 0,
    dpr: 1,
    circular: { zoom: 1, panX: 0, panY: 0 },
    landscape: { centerAz: 180, vPanPx: 0, pxPerDeg: LANDSCAPE_DEFAULT_PXPERDEG },
    nodes: new Map(), // key -> { el, item, hit }
    activeKey: null,
  };

  // --- geometry: alt/az -> pixel, per mode --------------------------------------

  function circularGeom() {
    const base = (Math.min(state.width, state.height) / 2) * 0.9;
    return {
      cx: state.width / 2 + state.circular.panX,
      cy: state.height / 2 + state.circular.panY,
      radius: base * state.circular.zoom,
    };
  }

  function landscapeHorizonY() {
    return state.height * 0.82 + state.landscape.vPanPx;
  }

  // Returns { x, y, visible } in CSS pixels, or visible=false when the point is
  // outside the drawable region for the current mode.
  function toPixel(altitude, azimuth) {
    if (state.mode === "circular") {
      const g = circularGeom();
      const p = projectCircular(altitude, azimuth);
      const r = Math.hypot(p.x, p.y);
      return { x: g.cx + p.x * g.radius, y: g.cy + p.y * g.radius, visible: r <= 1.02 };
    }
    const ls = state.landscape;
    const p = projectLandscape(altitude, azimuth, ls.centerAz);
    const horizonY = landscapeHorizonY();
    const x = state.width / 2 + p.dxDeg * ls.pxPerDeg;
    const y = horizonY - p.altDeg * ls.pxPerDeg;
    const halfFov = state.width / 2 / ls.pxPerDeg;
    const visible = Math.abs(p.dxDeg) <= halfFov + 2 && altitude >= 0 && y >= -20;
    return { x, y, visible };
  }

  // --- canvas layers ------------------------------------------------------------

  function drawBackground(ctx) {
    if (state.mode === "circular") {
      const g = circularGeom();
      const grad = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.radius);
      grad.addColorStop(0, "#0b1026");
      grad.addColorStop(0.75, "#0a0e20");
      grad.addColorStop(1, "#141a33");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const horizonY = landscapeHorizonY();
      const grad = ctx.createLinearGradient(0, 0, 0, horizonY);
      grad.addColorStop(0, "#070b1c");
      grad.addColorStop(0.6, "#0e1430");
      grad.addColorStop(0.88, "#26304f");
      grad.addColorStop(1, "#c98a4a"); // warm twilight band at the horizon
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, state.width, horizonY);
    }
  }

  // Clips subsequent canvas drawing to the visible sky region (the disk in circular
  // mode; above the horizon in landscape mode).
  function clipToSky(ctx) {
    if (state.mode === "circular") {
      const g = circularGeom();
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2);
      ctx.clip();
    } else {
      ctx.beginPath();
      ctx.rect(0, 0, state.width, landscapeHorizonY());
      ctx.clip();
    }
  }

  function drawMilkyWay(ctx) {
    const mw = state.snapshot.milkyway || [];
    for (const poly of mw) {
      ctx.beginPath();
      let started = false;
      for (const [az, alt] of poly.points) {
        const px = toPixel(alt, az);
        if (!started) {
          ctx.moveTo(px.x, px.y);
          started = true;
        } else {
          ctx.lineTo(px.x, px.y);
        }
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(150, 170, 220, ${0.015 * poly.level + 0.008})`;
      ctx.fill();
    }
  }

  function drawConstellationLines(ctx) {
    ctx.strokeStyle = "rgba(130, 170, 230, 0.38)";
    ctx.lineWidth = 1;
    for (const fig of state.snapshot.constellationLines || []) {
      for (const seg of fig.segments) {
        ctx.beginPath();
        seg.forEach(([az, alt], i) => {
          const px = toPixel(alt, az);
          if (i === 0) ctx.moveTo(px.x, px.y);
          else ctx.lineTo(px.x, px.y);
        });
        ctx.stroke();
      }
    }
  }

  function drawStarfield(ctx) {
    // Bucket by opacity so we set globalAlpha once per bucket and fill one path,
    // instead of thousands of per-star state changes.
    const buckets = new Map();
    for (const s of state.snapshot.starfield || []) {
      if (s.name) continue; // named stars are drawn as interactive SVG markers
      const px = toPixel(s.altitude, s.azimuth);
      if (!px.visible) continue;
      const alpha = Math.round(magnitudeToAlpha(s.magnitude) * 6) / 6;
      const r = magnitudeToRadius(s.magnitude) * (state.mode === "landscape" ? 1.1 : 1);
      let path = buckets.get(alpha);
      if (!path) {
        path = new Path2D();
        buckets.set(alpha, path);
      }
      path.moveTo(px.x + r, px.y);
      path.arc(px.x, px.y, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = "#dfe6ff";
    for (const [alpha, path] of buckets) {
      ctx.globalAlpha = alpha;
      ctx.fill(path);
    }
    ctx.globalAlpha = 1;
  }

  function drawHorizonFurniture(ctx) {
    if (state.mode === "circular") {
      const g = circularGeom();
      ctx.strokeStyle = "rgba(160, 180, 230, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(200, 210, 240, 0.85)";
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const cardinals = [
        ["N", 0],
        ["E", 90],
        ["S", 180],
        ["W", 270],
      ];
      for (const [label, az] of cardinals) {
        const p = projectCircular(0, az);
        ctx.fillText(label, g.cx + p.x * (g.radius + 14), g.cy + p.y * (g.radius + 14));
      }
    } else {
      const horizonY = landscapeHorizonY();
      // rolling hill silhouette
      ctx.fillStyle = "#05060d";
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      const w = state.width;
      for (let x = 0; x <= w; x += 20) {
        const h = 10 * Math.sin(x / 140 + state.landscape.centerAz / 40) + 6 * Math.sin(x / 47);
        ctx.lineTo(x, horizonY + 6 - h);
      }
      ctx.lineTo(w, state.height);
      ctx.lineTo(0, state.height);
      ctx.closePath();
      ctx.fill();

      // cardinal ticks along the horizon
      ctx.fillStyle = "rgba(210, 218, 245, 0.8)";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const marks = [
        ["N", 0],
        ["NE", 45],
        ["E", 90],
        ["SE", 135],
        ["S", 180],
        ["SW", 225],
        ["W", 270],
        ["NW", 315],
      ];
      for (const [label, az] of marks) {
        const p = projectLandscape(0, az, state.landscape.centerAz);
        if (Math.abs(p.dxDeg) > state.width / 2 / state.landscape.pxPerDeg) continue;
        ctx.fillText(label, state.width / 2 + p.dxDeg * state.landscape.pxPerDeg, horizonY + 8);
      }
    }
  }

  function drawCanvas() {
    const ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return; // jsdom / unsupported: SVG overlay + interaction still work
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.width, state.height);
    drawBackground(ctx);
    ctx.save();
    clipToSky(ctx);
    if (state.snapshot) {
      drawMilkyWay(ctx);
      drawConstellationLines(ctx);
      drawStarfield(ctx);
    }
    ctx.restore();
    drawHorizonFurniture(ctx);
  }

  // --- SVG interactive overlay --------------------------------------------------

  function overlayItems() {
    if (!state.snapshot) return [];
    const items = [];
    for (const p of state.snapshot.planets || []) {
      items.push({ type: "planet", name: p.name, altitude: p.altitude, azimuth: p.azimuth });
    }
    for (const g of state.snapshot.galaxies || []) {
      items.push({ type: "galaxy", name: g.name, altitude: g.altitude, azimuth: g.azimuth });
    }
    for (const s of state.snapshot.stars || []) {
      items.push({
        type: "star",
        name: s.name,
        altitude: s.altitude,
        azimuth: s.azimuth,
        magnitude: s.magnitude,
        constellation: s.constellation,
      });
    }
    if (state.snapshot.moon) {
      const m = state.snapshot.moon;
      items.push({
        type: "moon",
        name: "Moon",
        altitude: m.altitude,
        azimuth: m.azimuth,
        illumination: m.illumination,
        phase: m.phase,
      });
    }
    return items;
  }

  function itemKey(item) {
    return `${item.type}:${item.name}`;
  }

  function describe(item) {
    // describeItem (from chart.js) formats type/name/alt/az/magnitude/constellation.
    return describeItem(item).join("\n");
  }

  function showTooltip(clientX, clientY, item) {
    if (!tooltipEl) return;
    tooltipEl.textContent = describe(item);
    tooltipEl.style.left = `${clientX + 12}px`;
    tooltipEl.style.top = `${clientY + 12}px`;
    tooltipEl.hidden = false;
  }
  function hideTooltip() {
    if (tooltipEl) tooltipEl.hidden = true;
  }

  function setActive(key) {
    if (state.activeKey && state.nodes.has(state.activeKey)) {
      state.nodes.get(state.activeKey).el.classList.remove("body-active");
    }
    state.activeKey = key;
    const node = state.nodes.get(key);
    if (node) {
      node.el.classList.add("body-active");
      if (infoEl) infoEl.textContent = describe(node.item);
    }
  }

  function makeMoonGlyph(item) {
    const g = document.createElementNS(SKY_SVG_NS, "g");
    const disk = document.createElementNS(SKY_SVG_NS, "circle");
    disk.setAttribute("r", "7");
    disk.setAttribute("fill", "#3a3f52");
    const lit = document.createElementNS(SKY_SVG_NS, "path");
    lit.setAttribute("fill", BODY_COLORS.moon);
    // Terminator: a half-disk plus an ellipse whose x-radius encodes the lit fraction.
    const r = 7;
    const k = (item.illumination - 0.5) * 2 * r; // -r (new) .. +r (full)
    const waxing = item.phase < 180; // lit limb on the appropriate side
    const sweepDir = waxing ? 1 : 0;
    const ex = Math.abs(k);
    const large = 0;
    lit.setAttribute(
      "d",
      `M 0 ${-r} A ${r} ${r} 0 ${large} ${sweepDir} 0 ${r} A ${ex} ${r} 0 ${large} ${k >= 0 ? sweepDir : 1 - sweepDir} 0 ${-r} Z`
    );
    g.appendChild(disk);
    g.appendChild(lit);
    return g;
  }

  function createNode(item) {
    let el;
    if (item.type === "moon") {
      el = makeMoonGlyph(item);
      el.setAttribute("class", "sky-body sky-moon");
    } else {
      el = document.createElementNS(SKY_SVG_NS, "circle");
      const r = item.type === "star" ? Math.max(1.6, magnitudeToRadius(item.magnitude) + 0.8) : 4;
      el.setAttribute("r", String(r));
      el.setAttribute("fill", BODY_COLORS[item.type] || "#f4f6ff");
      el.setAttribute("class", `sky-body sky-${item.type}`);
    }
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", item.name);

    const key = itemKey(item);
    const current = () => state.nodes.get(key).item;
    el.addEventListener("mouseenter", (e) => showTooltip(e.clientX, e.clientY, current()));
    el.addEventListener("mousemove", (e) => showTooltip(e.clientX, e.clientY, current()));
    el.addEventListener("mouseleave", hideTooltip);
    el.addEventListener("focus", () => {
      const rect = el.getBoundingClientRect();
      showTooltip(rect.left, rect.top, current());
    });
    el.addEventListener("blur", hideTooltip);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      setActive(key);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setActive(key);
      }
    });
    return el;
  }

  // Reconciles overlay SVG nodes with the current snapshot by stable key, so a poll
  // refresh reuses nodes (positions transition) rather than tearing the layer down.
  function syncOverlayNodes() {
    const items = overlayItems();
    const nextKeys = new Set(items.map(itemKey));
    for (const [key, node] of state.nodes) {
      if (!nextKeys.has(key)) {
        node.el.remove();
        state.nodes.delete(key);
        if (state.activeKey === key) {
          state.activeKey = null;
          if (infoEl) infoEl.textContent = INFO_PLACEHOLDER;
        }
      }
    }
    for (const item of items) {
      const key = itemKey(item);
      const existing = state.nodes.get(key);
      if (existing) {
        existing.item = item;
      } else {
        const el = createNode(item);
        svg.appendChild(el);
        state.nodes.set(key, { el, item });
      }
    }
  }

  function positionOverlay() {
    for (const [, node] of state.nodes) {
      const px = toPixel(node.item.altitude, node.item.azimuth);
      node.el.style.display = px.visible ? "" : "none";
      if (!px.visible) continue;
      if (node.item.type === "moon") {
        node.el.setAttribute("transform", `translate(${px.x} ${px.y})`);
      } else {
        node.el.setAttribute("cx", px.x);
        node.el.setAttribute("cy", px.y);
      }
    }
    positionLabels();
  }

  let labelLayer = null;
  function positionLabels() {
    if (!labelLayer) {
      labelLayer = document.createElementNS(SKY_SVG_NS, "g");
      labelLayer.setAttribute("class", "sky-labels");
      svg.appendChild(labelLayer);
    }
    labelLayer.textContent = "";
    const labeled = [];
    for (const [, node] of state.nodes) {
      const it = node.item;
      const worthLabel =
        it.type === "planet" ||
        it.type === "moon" ||
        it.type === "galaxy" ||
        (it.type === "star" && it.magnitude <= STAR_LABEL_MAX_MAG);
      if (!worthLabel) continue;
      const px = toPixel(it.altitude, it.azimuth);
      if (!px.visible) continue;
      labeled.push({ name: it.name, x: px.x, y: px.y });
    }
    // constellation figure labels
    if (state.snapshot) {
      for (const fig of state.snapshot.constellationLines || []) {
        if (!fig.label) continue;
        const px = toPixel(fig.label.altitude, fig.label.azimuth);
        if (!px.visible) continue;
        const t = document.createElementNS(SKY_SVG_NS, "text");
        t.setAttribute("x", px.x);
        t.setAttribute("y", px.y);
        t.setAttribute("class", "constellation-label");
        t.textContent = fig.name;
        labelLayer.appendChild(t);
      }
    }
    for (const l of labeled) {
      const t = document.createElementNS(SKY_SVG_NS, "text");
      t.setAttribute("x", l.x + 8);
      t.setAttribute("y", l.y + 4);
      t.setAttribute("class", "body-label");
      t.textContent = l.name;
      labelLayer.appendChild(t);
    }
  }

  // --- render + resize ----------------------------------------------------------

  let rafPending = false;
  function scheduleRender() {
    if (rafPending) return;
    rafPending = true;
    const run = () => {
      rafPending = false;
      drawCanvas();
      positionOverlay();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0); // jsdom has no rAF (ADR-010 pattern)
  }

  function resize() {
    const rect = root.getBoundingClientRect();
    state.width = rect.width || root.clientWidth || 800;
    state.height = rect.height || root.clientHeight || 600;
    state.dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    canvas.width = state.width * state.dpr;
    canvas.height = state.height * state.dpr;
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    svg.setAttribute("viewBox", `0 0 ${state.width} ${state.height}`);
    svg.setAttribute("width", state.width);
    svg.setAttribute("height", state.height);
    scheduleRender();
  }

  // --- interaction: pan + zoom --------------------------------------------------

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  svg.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    svg.setPointerCapture && svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (state.mode === "circular") {
      state.circular.panX += dx;
      state.circular.panY += dy;
    } else {
      state.landscape.centerAz = (state.landscape.centerAz - dx / state.landscape.pxPerDeg + 360) % 360;
      state.landscape.vPanPx += dy;
    }
    scheduleRender();
  });
  const endDrag = (e) => {
    dragging = false;
    svg.releasePointerCapture && e.pointerId != null && svg.releasePointerCapture(e.pointerId);
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("click", () => {
    // click on empty sky clears the selection
    if (state.activeKey) {
      const n = state.nodes.get(state.activeKey);
      if (n) n.el.classList.remove("body-active");
      state.activeKey = null;
      if (infoEl) infoEl.textContent = INFO_PLACEHOLDER;
    }
  });

  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      if (state.mode === "circular") {
        state.circular.zoom = clamp(state.circular.zoom * factor, CIRCULAR_ZOOM.min, CIRCULAR_ZOOM.max);
      } else {
        state.landscape.pxPerDeg = clamp(
          state.landscape.pxPerDeg * factor,
          LANDSCAPE_PXPERDEG.min,
          LANDSCAPE_PXPERDEG.max
        );
      }
      scheduleRender();
    },
    { passive: false }
  );

  // --- public API ---------------------------------------------------------------

  function setSnapshot(snapshot) {
    state.snapshot = snapshot;
    syncOverlayNodes();
    scheduleRender();
  }

  function setMode(mode) {
    if (mode !== "circular" && mode !== "landscape") return;
    state.mode = mode;
    root.setAttribute("data-mode", mode);
    scheduleRender();
  }

  function getMode() {
    return state.mode;
  }

  resize();
  if (typeof window !== "undefined") window.addEventListener("resize", resize);

  return { setSnapshot, setMode, getMode, resize, _state: state };
}

// var (not const) so this global is visible to app.js when each script is evaluated
// in its own scope by the jsdom test harness; in the browser's shared script scope
// either would work.
var INFO_PLACEHOLDER = "Tap a star, planet, or the Moon for details.";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createSkyView, INFO_PLACEHOLDER };
}
