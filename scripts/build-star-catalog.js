// One-off data-prep script: filters the HYG database CSV down to the
// naked-eye magnitude subset used by the app and writes data/stars.json.
// Not part of the runtime server — run manually when refreshing the catalog.
const fs = require("fs");
const path = require("path");

const csvPath = path.join(__dirname, "hygdata_v41.csv");
const outPath = path.join(__dirname, "..", "data", "stars.json");
const MAG_LIMIT = 6.5;

function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

const raw = fs.readFileSync(csvPath, "utf8");
const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
const header = parseCsvLine(lines[0]);
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const stars = [];
for (let i = 1; i < lines.length; i++) {
  const f = parseCsvLine(lines[i]);
  if (f[idx.id] === "0") continue; // HYG row 0 is the Sun itself, not a background star.

  const mag = parseFloat(f[idx.mag]);
  if (!Number.isFinite(mag) || mag > MAG_LIMIT) continue;

  const raHours = parseFloat(f[idx.ra]);
  const decDeg = parseFloat(f[idx.dec]);
  if (!Number.isFinite(raHours) || !Number.isFinite(decDeg)) continue;

  const proper = f[idx.proper] || "";
  const con = f[idx.con] || "";

  stars.push({
    proper: proper || null,
    raHours,
    decDeg,
    mag,
    con,
  });
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(stars));

const named = stars.filter((s) => s.proper).length;
console.log(`Wrote ${stars.length} stars (mag <= ${MAG_LIMIT}), ${named} with proper names, to ${outPath}`);
