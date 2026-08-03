function computeStats(snapshot) {
  return {
    stars: snapshot.stars.length,
    planets: snapshot.planets.length,
    galaxies: snapshot.galaxies.length,
    constellations: snapshot.constellations.length,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { computeStats };
}
