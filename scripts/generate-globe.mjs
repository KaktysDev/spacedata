import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { geoContains, geoDistance, geoInterpolate } from "d3-geo";
const require = createRequire(import.meta.url);
const { feature, mesh } = require("topojson-client");
const atlas = require("world-atlas/countries-110m.json");
const land = feature(atlas, atlas.objects.land),
  dots = [],
  borderDots = [];
const rad = Math.PI / 180;
// A 3D spatial hash is continuous at the antimeridian and poles. Shared border
// junctions are accepted only once; interior dots leave breathing room around them.
const cell = 0.65 * rad,
  grid = new Map();
const vector = ([lon, lat]) => [
  Math.cos(lat * rad) * Math.sin(lon * rad),
  Math.sin(lat * rad),
  Math.cos(lat * rad) * Math.cos(lon * rad),
];
const key = (v) => v.map((n) => Math.floor(n / cell));
function near(p, gap) {
  const v = vector(p),
    k = key(v),
    limit = (2 * Math.sin((gap * rad) / 2)) ** 2;
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++)
        for (const q of grid.get([k[0] + x, k[1] + y, k[2] + z].join(",")) ??
          [])
          if (v.reduce((s, n, i) => s + (n - q[i]) ** 2, 0) < limit)
            return true;
  return false;
}
function insert(p) {
  const v = vector(p),
    k = key(v).join(",");
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(v);
}
const spacing = 0.85 * rad;
for (const border of mesh(atlas, atlas.objects.countries).coordinates) {
  let remaining = 0;
  for (let i = 1; i < border.length; i++) {
    const a = border[i - 1],
      b = border[i],
      length = geoDistance(a, b),
      interpolate = geoInterpolate(a, b);
    if (length === 0) continue;
    for (; remaining < length; remaining += spacing) {
      const p = interpolate(remaining / length).map((n) => +n.toFixed(4));
      if (!near(p, 0.54)) {
        borderDots.push(p);
        insert(p);
      }
    }
    remaining -= length;
  }
}
for (let lat = -82; lat <= 84; lat += 1.3) {
  const step = 1.3 / Math.max(0.18, Math.cos(lat * rad));
  for (
    let lon = -180 + ((Math.round((lat + 82) / 1.3) % 2) * step) / 2;
    lon < 180;
    lon += step
  ) {
    const p = [+lon.toFixed(4), +lat.toFixed(4)];
    if (geoContains(land, p) && !near(p, 0.64)) dots.push(p);
  }
}
writeFileSync(
  new URL("../public/globe-land.json", import.meta.url),
  JSON.stringify({ dots, borderDots }),
);
console.log(
  `${dots.length} interior dots, ${borderDots.length} deduplicated border dots`,
);
