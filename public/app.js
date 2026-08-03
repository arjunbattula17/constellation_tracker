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
      const labelY = position.above ? y - 6 : y + BELOW_LABEL_OFFSET;
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
