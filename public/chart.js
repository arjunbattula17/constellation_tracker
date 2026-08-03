const CHART_DEFAULTS = { width: 360, height: 90 };
const LABEL_LIMIT = 10;
const EDGE_MARGIN = 15;
const MIN_LABEL_GAP = 10;

function azimuthToX(azimuth, width) {
  return (azimuth / 360) * width;
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

function computeChartLayout(snapshot, opts) {
  const width = (opts && opts.width) || CHART_DEFAULTS.width;
  const height = (opts && opts.height) || CHART_DEFAULTS.height;

  const items = [];
  for (const star of snapshot.stars) {
    items.push(layoutItem("star", star, width, height, star.magnitude));
  }
  for (const planet of snapshot.planets) {
    items.push(layoutItem("planet", planet, width, height, null));
  }
  for (const galaxy of snapshot.galaxies) {
    items.push(layoutItem("galaxy", galaxy, width, height, null));
  }

  return { width, height, items };
}

function layoutItem(type, obj, width, height, magnitude) {
  return {
    type,
    name: obj.name,
    x: azimuthToX(obj.azimuth, width),
    y: height - (obj.altitude / 90) * height,
    magnitude,
    altitude: obj.altitude,
    azimuth: obj.azimuth,
    constellation: obj.constellation,
  };
}

// Formats an item's detail fields for the tooltip/focus panel — plain data in,
// plain strings out, so the content is unit-testable without touching the DOM.
function describeItem(item) {
  const lines = [
    `${item.type.charAt(0).toUpperCase() + item.type.slice(1)}: ${item.name}`,
    `Altitude: ${item.altitude.toFixed(1)}°`,
    `Azimuth: ${item.azimuth.toFixed(1)}°`,
  ];
  if (item.magnitude !== null && item.magnitude !== undefined) {
    lines.push(`Magnitude: ${item.magnitude.toFixed(2)}`);
  }
  if (item.constellation) {
    lines.push(`Constellation: ${item.constellation}`);
  }
  return lines;
}

function itemKey(item) {
  return `${item.type}:${item.name}`;
}

// Classifies items across two renders by stable identity (type+name), so the
// caller can update existing DOM nodes in place (and animate the change)
// instead of tearing everything down and rebuilding it on every refresh.
function diffChartItems(prevItems, nextItems) {
  const prevByKey = new Map(prevItems.map((item) => [itemKey(item), item]));
  const nextByKey = new Map(nextItems.map((item) => [itemKey(item), item]));

  const entering = [];
  const updating = [];
  const exiting = [];

  for (const [key, next] of nextByKey) {
    const prev = prevByKey.get(key);
    if (prev) {
      updating.push({ key, prev, next });
    } else {
      entering.push({ key, next });
    }
  }
  for (const [key, prev] of prevByKey) {
    if (!nextByKey.has(key)) {
      exiting.push({ key, prev });
    }
  }

  return { entering, updating, exiting };
}

if (typeof module !== "undefined") {
  module.exports = {
    computeChartLayout,
    CHART_DEFAULTS,
    azimuthToX,
    anchorForX,
    selectLabeledItems,
    layoutLabelPositions,
    describeItem,
    itemKey,
    diffChartItems,
    LABEL_LIMIT,
    EDGE_MARGIN,
    MIN_LABEL_GAP,
  };
}
