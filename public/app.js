const DEFAULT_LOCATION = { lat: 51.4769, lon: -0.0005 }; // Royal Observatory, Greenwich

const statusEl = document.getElementById("status");
const listsEl = document.getElementById("lists");
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
const TYPE_COLORS = { star: "#c9a227", planet: "#4682b4", galaxy: "#8a2be2" };
const COMPASS_TICKS = [
  { azimuth: 0, label: "N" },
  { azimuth: 90, label: "E" },
  { azimuth: 180, label: "S" },
  { azimuth: 270, label: "W" },
  { azimuth: 360, label: "N" },
];
const CHART_PADDING = 10;
const LABEL_LIMIT = 10;
const EDGE_MARGIN = 15;
const MIN_LABEL_GAP = 10;

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const key in attrs) {
    el.setAttribute(key, attrs[key]);
  }
  return el;
}

function anchorForX(x, width) {
  if (x < EDGE_MARGIN) return "start";
  if (x > width - EDGE_MARGIN) return "end";
  return "middle";
}

// Labels the ~LABEL_LIMIT brightest (lowest-magnitude) stars, plus every
// planet/galaxy (they carry no magnitude, so always label) — avoids
// dozens of overlapping labels when many faint catalog stars are visible.
function selectLabeledItems(items) {
  const labeled = new Set();
  const rankable = items
    .filter((item) => item.magnitude !== null && item.magnitude !== undefined)
    .slice()
    .sort((a, b) => a.magnitude - b.magnitude);
  for (const item of rankable.slice(0, LABEL_LIMIT)) {
    labeled.add(item);
  }
  for (const item of items) {
    if (item.magnitude === null || item.magnitude === undefined) {
      labeled.add(item);
    }
  }
  return labeled;
}

// Lays out only the labeled items, ordered by azimuth so neighboring labels
// alternate above/below deterministically (not by their position in the
// unrelated star/planet/galaxy item list), and nudges apart any pair whose
// x-positions are close enough to collide.
//
// Two passes: first push right to separate overlapping labels, then pull
// back within [width] so a cluster of nudges can't march labels off the
// right edge of the chart. When a cluster is too dense to fit the gap and
// the bound at once, the bound wins and labels overlap rather than clip.
function layoutLabelPositions(labeledItems, width) {
  const sorted = labeledItems.slice().sort((a, b) => a.x - b.x);
  const positions = sorted.map((item) => item.x);

  for (let i = 1; i < positions.length; i++) {
    positions[i] = Math.max(positions[i], positions[i - 1] + MIN_LABEL_GAP);
  }

  const maxX = width - EDGE_MARGIN;
  for (let i = positions.length - 1; i >= 0; i--) {
    const cap = i === positions.length - 1 ? maxX : Math.min(maxX, positions[i + 1] - MIN_LABEL_GAP);
    positions[i] = Math.min(positions[i], cap);
  }

  const result = new Map();
  sorted.forEach((item, index) => {
    result.set(item, { x: positions[index], above: index % 2 === 0 });
  });
  return result;
}

function renderChart(snapshot) {
  const container = document.getElementById("sky-chart");
  container.innerHTML = "";

  const { width, height, items } = computeChartLayout(snapshot);
  const svgHeight = height + CHART_PADDING * 2;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${svgHeight}`,
    class: "sky-chart-svg",
    role: "img",
    "aria-label": "Sky chart of visible stars, planets, and galaxies by compass direction and altitude",
  });

  svg.appendChild(
    svgEl("line", {
      x1: 0,
      y1: CHART_PADDING + height,
      x2: width,
      y2: CHART_PADDING + height,
      class: "horizon-line",
    })
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

  const labeledItems = selectLabeledItems(items);
  const labelPositions = layoutLabelPositions(Array.from(labeledItems), width);

  items.forEach((item) => {
    const y = item.y + CHART_PADDING;
    const color = TYPE_COLORS[item.type] || "#333";
    const circle = svgEl("circle", { cx: item.x, cy: y, r: 3, fill: color, class: `dot dot-${item.type}` });
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = item.name;
    circle.appendChild(title);
    svg.appendChild(circle);

    const position = labelPositions.get(item);
    if (position) {
      const labelY = position.above ? y - 6 : y + 12;
      const label = svgEl("text", {
        x: position.x,
        y: labelY,
        class: "dot-label",
        "text-anchor": anchorForX(position.x, width),
      });
      label.textContent = item.name;
      svg.appendChild(label);
    }
  });

  container.appendChild(svg);
  container.appendChild(buildChartLegend());
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

function renderSnapshot(snapshot) {
  renderList("constellations-list", snapshot.constellations, (name) => name);
  renderChart(snapshot);
  statusEl.hidden = true;
  listsEl.hidden = false;
}

async function fetchSkySnapshot(lat, lon, timestamp) {
  const requestId = ++latestRequestId;
  statusEl.hidden = false;
  statusEl.textContent = "Loading…";
  listsEl.hidden = true;

  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  if (timestamp) params.set("timestamp", timestamp);

  try {
    const response = await fetch(`/api/sky-snapshot?${params.toString()}`);
    const data = await response.json();
    if (requestId !== latestRequestId) return; // a newer request has since superseded this one
    if (!response.ok) {
      statusEl.textContent = data.error || "Something went wrong.";
      return;
    }
    renderSnapshot(data);
  } catch (err) {
    if (requestId !== latestRequestId) return;
    statusEl.textContent = "Couldn't reach the server, try again.";
  }
}

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
