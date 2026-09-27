import { distanceKm, type Location } from "./catalog";

export const EARTH_KM = 6371,
  ALTITUDE_KM = 550;
// Representative shell centers within the requested 600–850 km range. The
// filing does not specify six shells or these node counts; those are display choices.
export const SHELL_ALTITUDES_KM = [620, 662, 704, 746, 788, 830] as const;
export const BAND_COUNT = SHELL_ALTITUDES_KM.length,
  NODES_PER_BAND = 1000;
export const NODE_COUNT = BAND_COUNT * NODES_PER_BAND;
const MU = 398600.4418,
  J2 = 0.00108262668;
export const orbitalPeriodMs = (altitudeKm: number) =>
  2 * Math.PI * Math.sqrt((EARTH_KM + altitudeKm) ** 3 / MU) * 1000;
export const ORBIT_PERIOD_MS = orbitalPeriodMs(SHELL_ALTITUDES_KM[0]);
export const ORBIT_EPOCH_MS = Date.UTC(2026, 8, 25, 12);
const orbitalSeed = (i: number, salt: number) => {
  const x = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453123;
  return x - Math.floor(x);
};
export function sunSyncInclination(altitudeKm: number) {
  const a = EARTH_KM + altitudeKm,
    meanMotion = Math.sqrt(MU / a ** 3);
  const precession = (2 * Math.PI) / (365.2422 * 86400);
  return (
    (Math.acos(-precession / (1.5 * J2 * meanMotion * (EARTH_KM / a) ** 2)) *
      180) /
    Math.PI
  );
}
/**
 * Ring inclination. The northern apex reaches southern/eastern Canada (~55°N),
 * not a polar meridian and not an equatorial belt.
 */
export const SHELL_INCLINATION_DEG = 55;
/**
 * Orbital-pole longitude (deg). The northern arc sits opposite this pole,
 * so the ring crosses the northeast United States (New England, ~70°W)
 * instead of the Pacific Northwest.
 */
export const POLE_LON_DEG = 140;
/**
 * East-west fan of orbital poles (deg). A ±1° fan stacked the ring on one
 * meridian. This spreads longitudes across the northern crossing — a broad
 * band, still one ring.
 */
export const RAAN_SPREAD_DEG = 28;
export const MIN_ELEVATION_DEG = 25;
export const MAX_LASER_KM = 4000;
const C_KM_PER_MS = 299.792458;
const PROC_MS_PER_HOP = 1.5;
export type OrbitalNode = Location & {
  altitudeKm: number;
  band: number;
  slot: number;
};
export const JOURNEY_MS = 14800;
export const STAGES = [
  { at: 0, label: "Through your local network", short: "Fiber" },
  { at: 3400, label: "At the provider’s ground entry", short: "Provider" },
  { at: 4400, label: "Uplink to a visible LEO satellite", short: "Uplink" },
  { at: 6200, label: "Laser links to orbital compute", short: "Lasers" },
  { at: 9000, label: "Processing in the orbital scenario", short: "Compute" },
  { at: 10400, label: "Returning through the same network", short: "Return" },
] as const;
export function journeyStage(elapsed: number) {
  return STAGES.reduce((best, s, i) => (elapsed >= s.at ? i : best), 0);
}
const rad = Math.PI / 180;
export function interpolateLocation(
  a: Location,
  b: Location,
  t: number,
): Location {
  const vec = (p: Location) => [
    Math.cos(p.lat * rad) * Math.sin(p.lon * rad),
    Math.sin(p.lat * rad),
    Math.cos(p.lat * rad) * Math.cos(p.lon * rad),
  ];
  const av = vec(a),
    bv = vec(b);
  const angle = Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        av.reduce((s, v, i) => s + v * bv[i], 0),
      ),
    ),
  );
  if (angle < 1e-8) return { ...a };
  // Deterministic great-circle fallback for exact antipodes.
  if (Math.PI - angle < 1e-6) {
    const mid = { lat: 0, lon: a.lon + 90 };
    return t < 0.5
      ? interpolateLocation(a, mid, t * 2)
      : interpolateLocation(mid, b, t * 2 - 1);
  }
  const x = av.map(
    (v, i) =>
      (v * Math.sin((1 - t) * angle) + bv[i] * Math.sin(t * angle)) /
      Math.sin(angle),
  );
  return {
    lat: Math.atan2(x[1], Math.hypot(x[0], x[2])) / rad,
    lon: Math.atan2(x[0], x[2]) / rad,
  };
}

// Illustrative exchange/landing-city graph; these are NOT live ISP routes or a cable inventory.
const hubRows: [string, number, number][] = [
  ["New York", 40.71, -74.01],
  ["Virginia", 38.9, -77.4],
  ["Chicago", 41.88, -87.63],
  ["Dallas", 32.78, -96.8],
  ["Los Angeles", 34.05, -118.24],
  ["Seattle", 47.61, -122.33],
  ["Miami", 25.76, -80.19],
  ["Mexico City", 19.43, -99.13],
  ["Panama", 8.98, -79.52],
  ["Bogotá", 4.71, -74.07],
  ["Lima", -12.05, -77.04],
  ["São Paulo", -23.55, -46.63],
  ["Santiago", -33.45, -70.67],
  ["London", 51.51, -0.13],
  ["Paris", 48.86, 2.35],
  ["Frankfurt", 50.11, 8.68],
  ["Lisbon", 38.72, -9.14],
  ["Marseille", 43.3, 5.37],
  ["Helsinki", 60.17, 24.94],
  ["Istanbul", 41.01, 28.98],
  ["Cairo", 30.04, 31.24],
  ["Lagos", 6.52, 3.38],
  ["Cape Town", -33.92, 18.42],
  ["Nairobi", -1.29, 36.82],
  ["Dubai", 25.2, 55.27],
  ["Mumbai", 19.08, 72.88],
  ["Singapore", 1.35, 103.82],
  ["Hong Kong", 22.32, 114.17],
  ["Tokyo", 35.68, 139.69],
  ["Seoul", 37.57, 126.98],
  ["Jakarta", -6.21, 106.85],
  ["Perth", -31.95, 115.86],
  ["Sydney", -33.87, 151.21],
  ["Auckland", -36.85, 174.76],
  ["Honolulu", 21.31, -157.86],
  ["Guam", 13.44, 144.79],
];
export const HUBS = hubRows.map(([name, lat, lon]) => ({ name, lat, lon }));
const corridors = [
  [0, 1],
  [0, 2],
  [1, 6],
  [2, 3],
  [3, 4],
  [4, 5],
  [2, 5],
  [3, 7],
  [6, 8],
  [7, 8],
  [8, 9],
  [9, 10],
  [10, 12],
  [12, 11],
  [6, 11],
  [0, 13],
  [6, 16],
  [11, 16],
  [13, 14],
  [14, 15],
  [14, 16],
  [14, 17],
  [15, 18],
  [15, 19],
  [17, 20],
  [19, 20],
  [16, 21],
  [21, 22],
  [22, 23],
  [23, 20],
  [20, 24],
  [24, 25],
  [25, 26],
  [23, 25],
  [26, 27],
  [27, 28],
  [28, 29],
  [26, 30],
  [30, 31],
  [31, 32],
  [32, 33],
  [4, 34],
  [34, 28],
  [34, 33],
  [28, 35],
  [35, 32],
  [35, 27],
  [5, 28],
];
function nearestHub(p: Location) {
  return HUBS.reduce(
    (best, h, i) => (distanceKm(p, h) < distanceKm(p, HUBS[best]) ? i : best),
    0,
  );
}
export type GroundRoute = {
  points: Location[];
  stops: (Location & { name: string })[];
  km: number;
  rttMs: number;
};
export function groundRoute(
  origin: Location,
  destination: Location,
): GroundRoute {
  let stops: GroundRoute["stops"];
  if (distanceKm(origin, destination) < 900) {
    stops = [
      { ...interpolateLocation(origin, destination, 0.2), name: "Local ISP" },
      {
        ...interpolateLocation(origin, destination, 0.7),
        name: "Regional peering",
      },
    ];
  } else {
    const start = nearestHub(origin),
      end = nearestHub(destination);
    const dist = HUBS.map(() => Infinity),
      previous = HUBS.map(() => -1),
      visited = new Set<number>();
    dist[start] = 0;
    while (!visited.has(end)) {
      let u = -1;
      for (let i = 0; i < HUBS.length; i++)
        if (!visited.has(i) && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || !Number.isFinite(dist[u]))
        throw new Error("Disconnected fiber model");
      visited.add(u);
      for (const [a, b] of corridors) {
        const v = a === u ? b : b === u ? a : -1;
        if (v < 0) continue;
        const cost = dist[u] + distanceKm(HUBS[u], HUBS[v]);
        if (cost < dist[v]) {
          dist[v] = cost;
          previous[v] = u;
        }
      }
    }
    const path = [end];
    while (path[0] !== start) path.unshift(previous[path[0]]);
    stops = path.map((i) => HUBS[i]);
  }
  const points = [origin, ...stops, destination];
  const km =
    points.slice(1).reduce((sum, p, i) => sum + distanceKm(points[i], p), 0) *
    1.15;
  return { points, stops, km, rttMs: ((2 * km) / 200000) * 1000 + 10 };
}

// One inclined ring around the whole Earth. Satellites run the full orbit
// (argument of latitude 0–360°). A few degrees of pole and inclination fan
// thicken it. Not a dated ephemeris — period differences drift the ring.
export function orbitalNodes(at: number): OrbitalNode[] {
  return Array.from({ length: NODE_COUNT }, (_, i) => {
    const band = Math.floor(i / NODES_PER_BAND),
      slot = i % NODES_PER_BAND;
    const altitudeKm =
      SHELL_ALTITUDES_KM[band] + (orbitalSeed(i, 1) - 0.5) * 40;
    const inclination =
      SHELL_INCLINATION_DEG + (orbitalSeed(i, 4) - 0.5) * 4;
    const normalLat = (90 - inclination) * rad,
      normalLon =
        (POLE_LON_DEG + (orbitalSeed(i, 2) - 0.5) * RAAN_SPREAD_DEG) * rad;
    const normal = {
      x: Math.cos(normalLat) * Math.sin(normalLon),
      y: Math.sin(normalLat),
      z: Math.cos(normalLat) * Math.cos(normalLon),
    };
    const length = Math.hypot(normal.x, normal.z) || 1,
      right = { x: normal.z / length, y: 0, z: -normal.x / length };
    const up = {
      x: normal.y * right.z,
      y: normal.z * right.x - normal.x * right.z,
      z: -normal.y * right.x,
    };
    const period = orbitalPeriodMs(altitudeKm);
    const elapsed = at - ORBIT_EPOCH_MS;
    const turns = ((elapsed % period) + period) % period;
    const phase =
      (turns / period) * Math.PI * 2 +
      ((band * 0.618 + (orbitalSeed(i, 3) - 0.5) * 0.85) * Math.PI * 2) /
        NODES_PER_BAND;
    const angle = (slot / NODES_PER_BAND) * Math.PI * 2 + phase,
      c = Math.cos(angle),
      sn = Math.sin(angle);
    const x = right.x * c + up.x * sn,
      y = up.y * sn,
      z = right.z * c + up.z * sn;
    return {
      lat: Math.asin(Math.max(-1, Math.min(1, y))) / rad,
      lon: Math.atan2(x, z) / rad,
      altitudeKm,
      band,
      slot,
    };
  });
}
type ElevatedLocation = Location & { altitudeKm?: number };
export function opticalDistanceKm(a: ElevatedLocation, b: ElevatedLocation) {
  const ra = EARTH_KM + (a.altitudeKm ?? ALTITUDE_KM),
    rb = EARTH_KM + (b.altitudeKm ?? ALTITUDE_KM);
  return Math.sqrt(
    Math.max(
      0,
      ra * ra + rb * rb - 2 * ra * rb * Math.cos(distanceKm(a, b) / EARTH_KM),
    ),
  );
}
export function laserClearsEarth(a: ElevatedLocation, b: ElevatedLocation) {
  const ra = EARTH_KM + (a.altitudeKm ?? ALTITUDE_KM),
    rb = EARTH_KM + (b.altitudeKm ?? ALTITUDE_KM);
  const dot = ra * rb * Math.cos(distanceKm(a, b) / EARTH_KM),
    d2 = ra * ra + rb * rb - 2 * dot;
  const t = Math.max(0, Math.min(1, (ra * ra - dot) / (d2 || 1)));
  return ra * ra + 2 * t * (dot - ra * ra) + t * t * d2 > EARTH_KM * EARTH_KM;
}
export function elevationDeg(gateway: Location, satellite: ElevatedLocation) {
  const theta = distanceKm(gateway, satellite) / EARTH_KM,
    radius = EARTH_KM + (satellite.altitudeKm ?? ALTITUDE_KM);
  return (
    Math.atan2(radius * Math.cos(theta) - EARTH_KM, radius * Math.sin(theta)) /
    rad
  );
}
export type OrbitalRoute = {
  at: number;
  nodes: OrbitalNode[];
  relay: ElevatedLocation;
  carrierLinkKm: number;
  ingress: number;
  compute: number;
  hops: number[];
  gateway: Location & { name: string };
  ground: GroundRoute;
  gatewayRoute: GroundRoute;
  gatewayKm: number;
  uplinkKm: number;
  laserKm: number;
  rttMs: number;
};

/** Up to `limit` optical ISL neighbors within range, using a lat/lon window. */
function nearestLaserLinks(
  nodes: OrbitalNode[],
  from: number,
  limit = 14,
  maxKm = MAX_LASER_KM,
) {
  const a = nodes[from];
  const candidates: { i: number; km: number }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (i === from) continue;
    const dlat = Math.abs(a.lat - nodes[i].lat);
    let dlon = Math.abs(a.lon - nodes[i].lon);
    if (dlon > 180) dlon = 360 - dlon;
    if (dlat > 32 || dlon > 38) continue;
    const km = opticalDistanceKm(a, nodes[i]);
    if (km > 40 && km <= maxKm && laserClearsEarth(a, nodes[i]))
      candidates.push({ i, km });
  }
  return candidates.sort((x, y) => x.km - y.km).slice(0, limit);
}

/**
 * Dijkstra on the local ISL neighborhood. Cost = light time + switching delay.
 * Explores only the nearest laser links per node (Starlink-like mesh degree).
 */
function shortestLaserPath(
  nodes: OrbitalNode[],
  start: number,
  goal: number,
): { hops: number[]; km: number } {
  if (start === goal) return { hops: [start], km: 0 };
  const dist = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const open = new Set<number>([start]);
  const done = new Set<number>();
  while (open.size) {
    let u = -1,
      best = Infinity;
    for (const i of open) {
      const d = dist.get(i) ?? Infinity;
      if (d < best) {
        best = d;
        u = i;
      }
    }
    if (u < 0) break;
    open.delete(u);
    if (u === goal) break;
    done.add(u);
    if (done.size > 400) break;
    for (const { i, km } of nearestLaserLinks(nodes, u)) {
      if (done.has(i)) continue;
      const cost = best + km / C_KM_PER_MS + PROC_MS_PER_HOP;
      if (cost < (dist.get(i) ?? Infinity)) {
        dist.set(i, cost);
        prev.set(i, u);
        open.add(i);
      }
    }
  }
  if (!prev.has(goal) && start !== goal)
    throw new Error("No optical path to compute");
  const hops = [goal];
  while (hops[0] !== start) {
    const p = prev.get(hops[0]);
    if (p === undefined) throw new Error("No optical path to compute");
    hops.unshift(p);
  }
  let km = 0;
  for (let i = 1; i < hops.length; i++)
    km += opticalDistanceKm(nodes[hops[i - 1]], nodes[hops[i]]);
  return { hops, km };
}

/**
 * Starlink-style LEO routing for an orbital AI request:
 * 1. Ground comparison: fiber user → terrestrial provider site (unchanged).
 * 2. Space: RF/optical user uplink to the best visible LEO ingress (elevation
 *    mask, no GEO), then shortest ISL path to a nearby orbital compute node.
 * 3. Hop cost = light time + small per-ISL processing — prefer short low-latency paths.
 */
export function routeAt(
  origin: Location,
  at: number,
  providerEntry: Location = origin,
): OrbitalRoute {
  const nodes = orbitalNodes(at);
  const ground = groundRoute(origin, providerEntry);

  const ranked = nodes
    .map((node, i) => ({ node, i, elev: elevationDeg(origin, node) }))
    .sort((a, b) => b.elev - a.elev);
  const visibleFromUser = ranked.filter(
    ({ elev }) => elev >= MIN_ELEVATION_DEG,
  );

  let ingress: number;
  let uplinkAnchor: Location & { name?: string };
  if (visibleFromUser.length) {
    const ingressEntry = visibleFromUser.reduce((best, entry) => {
      if (entry.elev !== best.elev) return entry.elev > best.elev ? entry : best;
      return opticalDistanceKm(origin, entry.node) <
        opticalDistanceKm(origin, best.node)
        ? entry
        : best;
    });
    ingress = ingressEntry.i;
    uplinkAnchor = origin;
  } else {
    // High-latitude / out-of-cone: fiber to a land gateway that sees the shell,
    // then RF uplink (still LEO — never GEO).
    const gateways = HUBS.map((h) => {
      const vis = nodes
        .map((node, i) => ({ i, elev: elevationDeg(h, node) }))
        .filter(({ elev }) => elev >= MIN_ELEVATION_DEG);
      return { h, vis };
    }).filter((g) => g.vis.length);
    if (!gateways.length) throw new Error("No LEO-visible land gateway");
    const pick = gateways.reduce((best, g) =>
      distanceKm(origin, g.h) < distanceKm(origin, best.h) ? g : best,
    );
    ingress = pick.vis.reduce((best, entry) =>
      entry.elev > best.elev ? entry : best,
    ).i;
    uplinkAnchor = pick.h;
  }

  // Prefer the uplink land site when used; else nearest hub that still sees ingress.
  const visibleHubs = HUBS.filter(
    (h) => elevationDeg(h, nodes[ingress]) >= MIN_ELEVATION_DEG,
  );
  const gateway =
    typeof (uplinkAnchor as { name?: string }).name === "string"
      ? (uplinkAnchor as (typeof HUBS)[number])
      : (visibleHubs.length ? visibleHubs : HUBS).reduce((best, h) =>
          distanceKm(providerEntry, h) < distanceKm(providerEntry, best)
            ? h
            : best,
        );
  const gatewayRoute = groundRoute(providerEntry, gateway);
  const relay = { ...nodes[ingress] };
  const uplinkKm = opticalDistanceKm(
    { lat: uplinkAnchor.lat, lon: uplinkAnchor.lon, altitudeKm: 0 },
    nodes[ingress],
  );

  // Compute node: laser-reachable neighbor, prefer a higher shell (ODC), not ingress.
  const local = nearestLaserLinks(nodes, ingress, 24);
  if (!local.length) throw new Error("No orbital compute neighbor");
  const compute = local.sort((a, b) => {
    const bandScore =
      (nodes[b.i].band - nodes[a.i].band) * 120 + (a.km - b.km);
    return bandScore;
  })[0].i;

  const path = shortestLaserPath(nodes, ingress, compute);
  const hops = path.hops;
  const laserKm = path.km;
  const gatewayKm = ground.km + gatewayRoute.km;
  const oneWayMs =
    uplinkKm / C_KM_PER_MS +
    laserKm / C_KM_PER_MS +
    hops.length * PROC_MS_PER_HOP +
    4;
  return {
    at,
    nodes,
    relay,
    carrierLinkKm: 0,
    ingress,
    compute: hops[hops.length - 1],
    hops,
    gateway,
    ground,
    gatewayRoute,
    gatewayKm,
    uplinkKm,
    laserKm,
    rttMs: 2 * oneWayMs,
  };
}
