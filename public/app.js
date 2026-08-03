const DEFAULT_LOCATION = { lat: 51.4769, lon: -0.0005 }; // Royal Observatory, Greenwich

const statusEl = document.getElementById("status");
const listsEl = document.getElementById("lists");
const locationLabelEl = document.getElementById("location-label");

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

function renderSnapshot(snapshot) {
  renderList("constellations-list", snapshot.constellations, (name) => name);
  renderList("stars-list", snapshot.stars, (s) => `${s.name} — ${s.constellation} (alt ${s.altitude.toFixed(1)}°, az ${s.azimuth.toFixed(1)}°)`);
  renderList("planets-list", snapshot.planets, (p) => `${p.name} (alt ${p.altitude.toFixed(1)}°, az ${p.azimuth.toFixed(1)}°)`);
  renderList("galaxies-list", snapshot.galaxies, (g) => `${g.name} (alt ${g.altitude.toFixed(1)}°, az ${g.azimuth.toFixed(1)}°)`);
  statusEl.hidden = true;
  listsEl.hidden = false;
}

async function fetchSkySnapshot(lat, lon, timestamp) {
  statusEl.hidden = false;
  statusEl.textContent = "Loading…";
  listsEl.hidden = true;

  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  if (timestamp) params.set("timestamp", timestamp);

  try {
    const response = await fetch(`/api/sky-snapshot?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      statusEl.textContent = data.error || "Something went wrong.";
      return;
    }
    renderSnapshot(data);
  } catch (err) {
    statusEl.textContent = "Couldn't reach the server, try again.";
  }
}

locationLabelEl.textContent = "Showing the sky right now for the default location (Greenwich, UK).";
fetchSkySnapshot(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon);
