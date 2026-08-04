// Pure projection + styling math for the sky views. No DOM, no canvas — everything
// here is unit-tested in the node environment. skyview.js layers pixels, pan/zoom,
// and drawing on top of these functions.

// --- angle helpers -------------------------------------------------------------

const DEG = Math.PI / 180;

// Wraps a degree delta into (-180, 180], so azimuth differences don't jump at the
// 0/360 seam (e.g. az 350 relative to center 10 is -20, not +340).
function wrapDegrees180(delta) {
  let d = ((delta + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

// --- circular all-sky projection ----------------------------------------------

// Azimuthal-equidistant projection onto a unit disk, looking straight up:
// zenith at the center (r=0), horizon at the rim (r=1), north at top, east to the
// left, west to the right (the standard "facing up" planisphere orientation).
// Returns normalized coordinates in [-1, 1] with y pointing down (screen convention).
// Points below the horizon project outside the disk (r > 1); the caller clips them.
function projectCircular(altitude, azimuth) {
  const r = (90 - altitude) / 90;
  const a = azimuth * DEG;
  return { x: -r * Math.sin(a), y: -r * Math.cos(a) };
}

// --- landscape (horizon slice) projection -------------------------------------

// Flat angular projection of a horizon-facing window centered on `centerAz`.
// Returns the horizontal offset from the view center in degrees (east/right
// positive) and the altitude in degrees above the horizon. The caller scales
// degrees→pixels (uniformly, so the view isn't distorted) and decides what falls
// inside the viewport.
function projectLandscape(altitude, azimuth, centerAz) {
  return { dxDeg: wrapDegrees180(azimuth - centerAz), altDeg: altitude };
}

// Whether a landscape-projected point lies within the current viewport, given the
// half-width/height of the window in degrees and the altitude range on screen.
function inLandscapeWindow(dxDeg, altDeg, halfFovDeg, minAltDeg, maxAltDeg) {
  return Math.abs(dxDeg) <= halfFovDeg && altDeg >= minAltDeg && altDeg <= maxAltDeg;
}

// --- star styling from magnitude ----------------------------------------------

// Brighter stars (lower magnitude) render larger and more opaque. Values are tuned
// for the naked-eye range roughly [-1.5, 6.5]. `radius` is the base (zoom-1) radius
// in px; skyview.js multiplies it by the zoom factor.
function magnitudeToRadius(mag) {
  const r = (6.5 - mag) * 0.26 + 0.35;
  return Math.max(0.35, Math.min(3.2, r));
}

function magnitudeToAlpha(mag) {
  const a = 1.05 - mag * 0.11;
  return Math.max(0.28, Math.min(1, a));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    wrapDegrees180,
    projectCircular,
    projectLandscape,
    inLandscapeWindow,
    magnitudeToRadius,
    magnitudeToAlpha,
    DEG,
  };
}
