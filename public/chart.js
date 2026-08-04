// Formats a sky object's detail fields for the tooltip/info overlay — plain data in,
// plain strings out, so the content is unit-testable without touching the DOM.
// Shared by skyview.js for both the hover tooltip and the selected-object panel.
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
  if (item.illumination !== null && item.illumination !== undefined) {
    lines.push(`Illumination: ${(item.illumination * 100).toFixed(0)}%`);
  }
  return lines;
}

if (typeof module !== "undefined") {
  module.exports = { describeItem };
}
