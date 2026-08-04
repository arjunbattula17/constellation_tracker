const DEFAULT_LOCATION = { lat: 51.4769, lon: -0.0005 }; // Royal Observatory, Greenwich

const liveClockEl = document.getElementById("live-clock");
const statusEl = document.getElementById("status");
const infoContentEl = document.getElementById("info-content");
const tooltipEl = document.getElementById("chart-tooltip");
const locationLabelEl = document.getElementById("location-label");
const useLocationBtn = document.getElementById("use-location-btn");
const manualLocationEl = document.getElementById("manual-location");
const manualLocationMessageEl = document.getElementById("manual-location-message");
const manualLocationFormEl = document.getElementById("manual-location-form");
const manualLatInput = document.getElementById("manual-lat");
const manualLonInput = document.getElementById("manual-lon");
const manualLocationErrorEl = document.getElementById("manual-location-error");
const skyViewRoot = document.getElementById("sky-view");
const viewToggleEl = document.getElementById("view-toggle");

const LOCATION_UNAVAILABLE_MESSAGE = "Location unavailable — enter coordinates manually";
const USE_LOCATION_LABEL = "Use my location";
const LOCATING_LABEL = "Locating…";
const GEOLOCATION_OPTIONS = { timeout: 10000, maximumAge: 60000 };
const POLL_INTERVAL_MS = 60000;

const skyView = createSkyView(skyViewRoot, { tooltipEl, infoEl: infoContentEl });
infoContentEl.textContent = INFO_PLACEHOLDER;

let latestRequestId = 0;
let lastLocation = null; // { lat, lon } most recently requested — what a poll tick re-fetches

// --- view toggle --------------------------------------------------------------

viewToggleEl.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-mode]");
  if (!btn) return;
  const mode = btn.dataset.mode;
  skyView.setMode(mode);
  for (const b of viewToggleEl.querySelectorAll("button[data-mode]")) {
    const active = b === btn;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  }
});

// --- render + fetch -----------------------------------------------------------

function renderSnapshot(snapshot) {
  skyView.setSnapshot(snapshot);
  statusEl.hidden = true;
  if (snapshot.message) {
    infoContentEl.textContent = snapshot.message;
  } else if (infoContentEl.textContent === "" || infoContentEl.textContent === "Loading…") {
    infoContentEl.textContent = INFO_PLACEHOLDER;
  }
}

// `silent` is for poll-triggered background refreshes: no "Loading…" flash, and a
// failure quietly keeps showing the last-known-good sky rather than blanking it out
// over a transient hiccup — it simply retries on the next poll tick.
async function fetchSkySnapshot(lat, lon, timestamp, { silent = false } = {}) {
  lastLocation = { lat, lon };
  const requestId = ++latestRequestId;
  if (!silent) {
    statusEl.hidden = false;
    statusEl.textContent = "Loading…";
  }

  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  if (timestamp) params.set("timestamp", timestamp);

  try {
    const response = await fetch(`/api/sky-snapshot?${params.toString()}`);
    const data = await response.json();
    if (requestId !== latestRequestId) return; // a newer request has since superseded this one
    if (!response.ok) {
      if (silent) return;
      statusEl.hidden = false;
      statusEl.textContent = data.error || "Something went wrong.";
      return;
    }
    renderSnapshot(data);
  } catch (err) {
    if (requestId !== latestRequestId) return;
    if (silent) return;
    statusEl.hidden = false;
    statusEl.textContent = "Couldn't reach the server, try again.";
  }
}

function pollTick() {
  if (document.hidden) return;
  if (!lastLocation) return;
  fetchSkySnapshot(lastLocation.lat, lastLocation.lon, undefined, { silent: true });
}
setInterval(pollTick, POLL_INTERVAL_MS);

// --- clock --------------------------------------------------------------------

function updateClock() {
  liveClockEl.textContent = new Date().toLocaleTimeString();
}
updateClock();
setInterval(updateClock, 1000);

// --- location controls --------------------------------------------------------

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
