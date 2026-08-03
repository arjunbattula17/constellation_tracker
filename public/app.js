const DEFAULT_LOCATION = { lat: 51.4769, lon: -0.0005 }; // Royal Observatory, Greenwich

const statusEl = document.getElementById("status");
const listsEl = document.getElementById("lists");
const liveClockEl = document.getElementById("live-clock");
const statStarsEl = document.getElementById("stat-stars");
const statPlanetsEl = document.getElementById("stat-planets");
const statGalaxiesEl = document.getElementById("stat-galaxies");
const statConstellationsEl = document.getElementById("stat-constellations");
const lastUpdatedEl = document.getElementById("last-updated");
const tooltipEl = document.getElementById("chart-tooltip");
const focusPanelContentEl = document.getElementById("focus-panel-content");
const locationLabelEl = document.getElementById("location-label");
const useLocationBtn = document.getElementById("use-location-btn");
const manualLocationEl = document.getElementById("manual-location");
const manualLocationMessageEl = document.getElementById("manual-location-message");
const manualLocationFormEl = document.getElementById("manual-location-form");
const manualLatInput = document.getElementById("manual-lat");
const manualLonInput = document.getElementById("manual-lon");
const manualLocationErrorEl = document.getElementById("manual-location-error");

const LOCATION_UNAVAILABLE_MESSAGE = "Location unavailable — enter coordinates manually";
const USE_LOCATION_LABEL = "Use my location";
const LOCATING_LABEL = "Locating…";
const GEOLOCATION_OPTIONS = { timeout: 10000, maximumAge: 60000 };

let latestRequestId = 0;
let chartState = null; // null, or { svg, width, height, nodesByKey: Map<key, {circle, item}> }
let activeKey = null;
const FOCUS_PANEL_PLACEHOLDER = "Select an object to see details";
const DOT_TRANSITION_MS = 700;

let lastLocation = null; // { lat, lon } most recently requested, via any path — what a poll tick re-fetches
let lastUpdatedAt = null; // Date.now() of the last successful render
let previousStats = null; // last rendered stat counts, to detect a change worth flashing
const POLL_INTERVAL_MS = 60000;

function renderList(id, items, format) {
  const ul = document.getElementById(id);
  ul.innerHTML = "";
  if (items.length === 0) {
    const li = document.createElement("li");
    li.textContent = "None currently visible";
    ul.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = format(item);
    ul.appendChild(li);
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";
const TYPE_COLORS = { star: "#c9a227", planet: "#4682b4", galaxy: "#c2185b" };
const COMPASS_TICKS = [
  { azimuth: 0, label: "N" },
  { azimuth: 90, label: "E" },
  { azimuth: 180, label: "S" },
  { azimuth: 270, label: "W" },
  { azimuth: 360, label: "N" },
];
const CHART_PADDING = 10;
const BELOW_LABEL_OFFSET = 6; // mirrors the -6 "above" offset so below-labels don't reach into the tick-label row

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const key in attrs) {
    el.setAttribute(key, attrs[key]);
  }
  return el;
}

function showTooltipAt(x, y, item) {
  tooltipEl.textContent = describeItem(item).join("\n");
  tooltipEl.style.left = `${x + 12}px`;
  tooltipEl.style.top = `${y + 12}px`;
  tooltipEl.hidden = false;
}

function showTooltipAtCursor(event, item) {
  showTooltipAt(event.clientX, event.clientY, item);
}

function showTooltipNearElement(element, item) {
  const rect = element.getBoundingClientRect();
  showTooltipAt(rect.left, rect.top, item);
}

function hideTooltip() {
  tooltipEl.hidden = true;
}

function setActiveItem(key) {
  const node = chartState && chartState.nodesByKey.get(key);
  if (!node) return;
  if (activeKey && chartState.nodesByKey.has(activeKey)) {
    chartState.nodesByKey.get(activeKey).circle.classList.remove("dot-active");
  }
  activeKey = key;
  node.circle.classList.add("dot-active");
  focusPanelContentEl.textContent = describeItem(node.item).join("\n");
}

// Reads the item's *current* data at event time (via the nodesByKey lookup),
// not the item this listener closed over at creation time — a circle is
// reused across renders, so its underlying item can be updated in place.
function createDotNode(key, item, y) {
  const color = TYPE_COLORS[item.type] || "#333";
  const circle = svgEl("circle", {
    cx: item.x,
    cy: y,
    r: 3,
    fill: color,
    class: `dot dot-${item.type}`,
    tabindex: "0",
    role: "button",
    "aria-label": item.name,
  });
  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = item.name;
  circle.appendChild(title);

  const currentItem = () => chartState.nodesByKey.get(key).item;
  circle.addEventListener("mouseenter", (event) => showTooltipAtCursor(event, currentItem()));
  circle.addEventListener("mousemove", (event) => showTooltipAtCursor(event, currentItem()));
  circle.addEventListener("mouseleave", hideTooltip);
  circle.addEventListener("focus", () => showTooltipNearElement(circle, currentItem()));
  circle.addEventListener("blur", hideTooltip);
  circle.addEventListener("click", () => setActiveItem(key));
  circle.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setActiveItem(key);
    }
  });

  return circle;
}

function buildChartScaffold(width, height) {
  const svgHeight = height + CHART_PADDING * 2;
  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${svgHeight}`,
    class: "sky-chart-svg",
    role: "img",
    "aria-label": "Sky chart of visible stars, planets, and galaxies by compass direction and altitude",
  });

  svg.appendChild(
    svgEl("line", { x1: 0, y1: CHART_PADDING + height, x2: width, y2: CHART_PADDING + height, class: "horizon-line" })
  );

  for (const tick of COMPASS_TICKS) {
    const x = azimuthToX(tick.azimuth, width);
    svg.appendChild(
      svgEl("line", { x1: x, y1: CHART_PADDING + height, x2: x, y2: CHART_PADDING + height + 4, class: "tick-line" })
    );
    const label = svgEl("text", {
      x,
      y: CHART_PADDING + height + 14,
      class: "tick-label",
      "text-anchor": anchorForX(x, width),
    });
    label.textContent = tick.label;
    svg.appendChild(label);
  }

  return svg;
}

// Renders by diffing against the previously-rendered items (keyed by
// type+name) instead of tearing the chart down and rebuilding it every time:
// unchanged objects keep their existing <circle> and just get new cx/cy (the
// CSS transition on .dot animates the move), new objects fade in, and
// objects no longer visible fade out before being removed. This is what
// makes a data refresh read as "the sky updated" instead of "the page
// flashed." Labels are the exception — which items get labeled depends on
// the whole current item set's brightness ranking, not any single item's
// identity, so they're simplest rebuilt fresh every render.
function renderChart(snapshot) {
  const container = document.getElementById("sky-chart");
  const { width, height, items } = computeChartLayout(snapshot);

  if (items.length === 0) {
    chartState = null;
    activeKey = null;
    focusPanelContentEl.textContent = FOCUS_PANEL_PLACEHOLDER;
    container.innerHTML = "";
    const message = document.createElement("p");
    message.className = "chart-empty-message";
    message.textContent = snapshot.message || "Nothing bright visible right now.";
    container.appendChild(message);
    return;
  }

  if (!chartState || chartState.width !== width || chartState.height !== height) {
    container.innerHTML = "";
    activeKey = null;
    focusPanelContentEl.textContent = FOCUS_PANEL_PLACEHOLDER;
    const svg = buildChartScaffold(width, height);
    container.appendChild(svg);
    chartState = { svg, width, height, nodesByKey: new Map() };
  }

  const { svg, nodesByKey } = chartState;
  const prevItems = Array.from(nodesByKey.values()).map((node) => node.item);
  const diff = diffChartItems(prevItems, items);

  for (const { key, next } of diff.entering) {
    const circle = createDotNode(key, next, next.y + CHART_PADDING);
    circle.classList.add("dot-entering");
    svg.appendChild(circle);
    nodesByKey.set(key, { circle, item: next });
    setTimeout(() => circle.classList.remove("dot-entering"), 0);
  }

  for (const { key, next } of diff.updating) {
    const node = nodesByKey.get(key);
    node.circle.setAttribute("cx", next.x);
    node.circle.setAttribute("cy", next.y + CHART_PADDING);
    node.item = next;
    if (key === activeKey) {
      focusPanelContentEl.textContent = describeItem(next).join("\n");
    }
  }

  for (const { key } of diff.exiting) {
    const node = nodesByKey.get(key);
    node.circle.classList.add("dot-exiting");
    nodesByKey.delete(key);
    if (key === activeKey) {
      activeKey = null;
      focusPanelContentEl.textContent = FOCUS_PANEL_PLACEHOLDER;
    }
    setTimeout(() => node.circle.remove(), DOT_TRANSITION_MS);
  }

  svg.querySelectorAll(".dot-label").forEach((el) => el.remove());
  const labeledItems = selectLabeledItems(items);
  const labelPositions = layoutLabelPositions(Array.from(labeledItems), width);
  items.forEach((item) => {
    const position = labelPositions.get(item);
    if (!position) return;
    const y = item.y + CHART_PADDING;
    const labelY = position.above ? y - 6 : y + BELOW_LABEL_OFFSET;
    const label = svgEl("text", {
      x: position.x,
      y: labelY,
      class: "dot-label",
      "text-anchor": anchorForX(position.x, width),
    });
    label.textContent = item.name;
    svg.appendChild(label);
  });

  const oldLegend = container.querySelector(".chart-legend");
  if (oldLegend) oldLegend.remove();
  const oldSrList = container.querySelector(".sr-only");
  if (oldSrList) oldSrList.remove();
  container.appendChild(buildChartLegend());
  container.appendChild(buildChartSrList(items));
}

// The chart is visual-only (dot positions + hover <title>s), so screen-reader
// users get a plain-text enumeration of the same items instead.
function buildChartSrList(items) {
  const wrapper = document.createElement("div");
  wrapper.className = "sr-only";

  const heading = document.createElement("p");
  heading.textContent = "Currently visible in the sky chart:";
  wrapper.appendChild(heading);

  const ul = document.createElement("ul");
  for (const item of items) {
    const li = document.createElement("li");
    const type = item.type.charAt(0).toUpperCase() + item.type.slice(1);
    li.textContent = `${type}: ${item.name}`;
    ul.appendChild(li);
  }
  wrapper.appendChild(ul);

  return wrapper;
}

function buildChartLegend() {
  const legend = document.createElement("p");
  legend.className = "chart-legend";
  const parts = [
    { type: "star", label: "star" },
    { type: "planet", label: "planet" },
    { type: "galaxy", label: "galaxy" },
  ];
  for (const part of parts) {
    const swatch = document.createElement("span");
    swatch.className = `legend-swatch legend-${part.type}`;
    legend.appendChild(swatch);
    legend.appendChild(document.createTextNode(` ${part.label}  `));
  }
  return legend;
}

function setStatValue(el, value, previousValue) {
  el.textContent = value;
  if (previousValue !== undefined && previousValue !== value) {
    el.classList.remove("stat-flash");
    void el.offsetWidth; // restart the CSS animation even if it's already applied
    el.classList.add("stat-flash");
  }
}

function renderStats(snapshot) {
  const stats = computeStats(snapshot);
  setStatValue(statStarsEl, stats.stars, previousStats && previousStats.stars);
  setStatValue(statPlanetsEl, stats.planets, previousStats && previousStats.planets);
  setStatValue(statGalaxiesEl, stats.galaxies, previousStats && previousStats.galaxies);
  setStatValue(statConstellationsEl, stats.constellations, previousStats && previousStats.constellations);
  previousStats = stats;
}

function renderSnapshot(snapshot) {
  renderList("constellations-list", snapshot.constellations, (name) => name);
  renderChart(snapshot);
  renderStats(snapshot);
  lastUpdatedAt = Date.now();
  statusEl.hidden = true;
  listsEl.hidden = false;
}

function updateClock() {
  liveClockEl.textContent = new Date().toLocaleTimeString();
}
updateClock();
setInterval(updateClock, 1000);

function updateLastUpdatedTicker() {
  lastUpdatedEl.textContent = lastUpdatedAt === null ? "" : `Updated ${formatRelativeTime(Date.now() - lastUpdatedAt)}`;
}
setInterval(updateLastUpdatedTicker, 1000);

// `silent` is for poll-triggered background refreshes: no "Loading…" flash
// (the dashboard just updates in place once new data arrives via the normal
// diffed render), and a failure quietly keeps showing the last-known-good
// data rather than blanking the dashboard out over a transient hiccup — it
// simply retries on the next poll tick.
async function fetchSkySnapshot(lat, lon, timestamp, { silent = false } = {}) {
  lastLocation = { lat, lon };
  const requestId = ++latestRequestId;
  if (!silent) {
    statusEl.hidden = false;
    statusEl.textContent = "Loading…";
    listsEl.hidden = true;
  }

  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  if (timestamp) params.set("timestamp", timestamp);

  try {
    const response = await fetch(`/api/sky-snapshot?${params.toString()}`);
    const data = await response.json();
    if (requestId !== latestRequestId) return; // a newer request has since superseded this one
    if (!response.ok) {
      if (silent) return;
      statusEl.textContent = data.error || "Something went wrong.";
      return;
    }
    renderSnapshot(data);
  } catch (err) {
    if (requestId !== latestRequestId) return;
    if (silent) return;
    statusEl.textContent = "Couldn't reach the server, try again.";
  }
}

function pollTick() {
  if (document.hidden) return;
  if (!lastLocation) return;
  fetchSkySnapshot(lastLocation.lat, lastLocation.lon, undefined, { silent: true });
}
setInterval(pollTick, POLL_INTERVAL_MS);

function showManualFallback(message) {
  manualLocationMessageEl.textContent = message;
  manualLocationEl.hidden = false;
}

useLocationBtn.addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    showManualFallback(LOCATION_UNAVAILABLE_MESSAGE);
    return;
  }
  useLocationBtn.disabled = true;
  useLocationBtn.textContent = LOCATING_LABEL;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      useLocationBtn.disabled = false;
      useLocationBtn.textContent = USE_LOCATION_LABEL;
      manualLocationEl.hidden = true;
      locationLabelEl.textContent = "Showing the sky right now for your location.";
      fetchSkySnapshot(position.coords.latitude, position.coords.longitude);
    },
    () => {
      useLocationBtn.disabled = false;
      useLocationBtn.textContent = USE_LOCATION_LABEL;
      showManualFallback(LOCATION_UNAVAILABLE_MESSAGE);
    },
    GEOLOCATION_OPTIONS
  );
});

manualLocationFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const lat = manualLatInput.valueAsNumber;
  const lon = manualLonInput.valueAsNumber;
  const result = validateCoordinates(lat, lon);
  if (!result.valid) {
    manualLocationErrorEl.textContent = result.error;
    return;
  }
  manualLocationErrorEl.textContent = "";
  locationLabelEl.textContent = "Showing the sky right now for your entered location.";
  fetchSkySnapshot(lat, lon);
});

locationLabelEl.textContent = "Showing the sky right now for the default location (Greenwich, UK).";
fetchSkySnapshot(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon);
