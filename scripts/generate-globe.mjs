import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { geoContains, geoDistance, geoInterpolate } from "d3-geo";
const require = createRequire(import.meta.url);
const { feature, mesh } = require("topojson-client");
const atlas = require("world-atlas/countries-110m.json");
const land = feature(atlas, atlas.objects.land),
  dots = [],
  borderDots = [];
for (let lat = -82; lat <= 84; lat += 1.25)
  for (
    let lon = -180;
    lon < 180;
    lon += 1.25 / Math.max(0.18, Math.cos((lat * Math.PI) / 180))
  )
    if (geoContains(land, [lon, lat])) dots.push([+lon.toFixed(3), lat]);
const spacing = (1.0 * Math.PI) / 180;
for (const border of mesh(atlas, atlas.objects.countries).coordinates) {
  let remaining = 0;
  for (let i = 1; i < border.length; i++) {
    const a = border[i - 1],
      b = border[i],
      length = geoDistance(a, b),
      interpolate = geoInterpolate(a, b);
    if (length === 0) continue;
    for (; remaining < length; remaining += spacing) {
      const p = interpolate(remaining / length);
      borderDots.push(p.map((n) => +n.toFixed(3)));
    }
    remaining -= length;
  }
}
writeFileSync(
  new URL("../public/globe-land.json", import.meta.url),
  JSON.stringify({ dots, borderDots }),
);
