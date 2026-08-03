const CHART_DEFAULTS = { width: 360, height: 90 };

function azimuthToX(azimuth, width) {
  return (azimuth / 360) * width;
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
  };
}

if (typeof module !== "undefined") {
  module.exports = { computeChartLayout, CHART_DEFAULTS, azimuthToX };
}
