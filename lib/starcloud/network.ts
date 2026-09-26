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
export type OrbitalNode = Location & {
  altitudeKm: number;
  band: number;
  slot: number;
};
export const JOURNEY_MS = 14800;
export const STAGES = [
  { at: 0, label: "Through your local network", short: "Fiber" },
  { at: 3400, label: "At the provider’s ground entry", short: "Provider" },
  { at: 4400, label: "Fiber to the ground gateway", short: "Gateway" },
  { at: 5900, label: "Uplink to a communications relay", short: "Uplink" },
  { at: 7600, label: "Laser links to orbital compute", short: "Lasers" },
  { at: 10000, label: "Processing in the orbital scenario", short: "Compute" },
  { at: 11400, label: "Returning through the same network", short: "Return" },
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

// Near-aligned dawn-dusk bands, slightly offset in node longitude and phase.
// This is a frozen Earth orientation for a short illustration, not a dated ephemeris.
// Different shell periods give natural relative motion; satellites do not hover over cities.
export function orbitalNodes(at: number): OrbitalNode[] {
  return Array.from({ length: NODE_COUNT }, (_, i) => {
    const band = Math.floor(i / NODES_PER_BAND),
      slot = i % NODES_PER_BAND;
    const altitudeKm =
        SHELL_ALTITUDES_KM[band] + (orbitalSeed(i, 1) - 0.5) * 40,
      inclination = sunSyncInclination(altitudeKm);
    const normalLat = (90 - inclination) * rad,
      normalLon = (-91 + (orbitalSeed(i, 2) - 0.5) * 2) * rad;
    const normal = {
      x: Math.cos(normalLat) * Math.sin(normalLon),
      y: Math.sin(normalLat),
      z: Math.cos(normalLat) * Math.cos(normalLon),
    };
    const length = Math.hypot(normal.x, normal.z),
      right = { x: normal.z / length, y: 0, z: -normal.x / length };
    const up = {
      x: normal.y * right.z,
      y: normal.z * right.x - normal.x * right.z,
      z: -normal.y * right.x,
    };
    const period = orbitalPeriodMs(altitudeKm);
    const phase =
      (((at - ORBIT_EPOCH_MS) % period) / period) * Math.PI * 2 +
      ((band * 0.618 + (orbitalSeed(i, 3) - 0.5) * 0.85) * Math.PI * 2) /
        NODES_PER_BAND;
    const angle = (slot / NODES_PER_BAND) * Math.PI * 2 + phase,
      c = Math.cos(angle),
      sn = Math.sin(angle);
    return {
      lat: Math.asin(up.y * sn) / rad,
      lon: Math.atan2(right.x * c + up.x * sn, right.z * c + up.z * sn) / rad,
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
export function routeAt(
  origin: Location,
  at: number,
  providerEntry: Location = origin,
): OrbitalRoute {
  const nodes = orbitalNodes(at);
  // Use a land gateway with access to the dawn-dusk bands. A generic carrier
  // relay provides RF access; Starcloud receives data over an optical crosslink.
  const gateways = HUBS.filter((h) =>
    nodes.some((n) => elevationDeg(h, n) >= 20),
  );
  if (!gateways.length)
    throw new Error("No gateway visible to the modeled shells");
  const gateway = gateways.reduce((best, h) =>
    distanceKm(providerEntry, h) < distanceKm(providerEntry, best) ? h : best,
  );
  const relay = { ...gateway, altitudeKm: ALTITUDE_KM };
  // Altitude matters: the nearest sub-satellite point can have a lower elevation
  // than a more distant node in a higher band. Restrict selection before ranking.
  const accessible = nodes
    .map((node, i) => ({ node, i }))
    .filter(
      ({ node }) =>
        elevationDeg(gateway, node) >= 20 &&
        laserClearsEarth(relay, node) &&
        opticalDistanceKm(relay, node) <= 4000,
    );
  if (!accessible.length) throw new Error("No accessible optical ingress");
  const ingress = accessible.reduce((best, entry) =>
    opticalDistanceKm(relay, entry.node) < opticalDistanceKm(relay, best.node)
      ? entry
      : best,
  ).i;
  // Route by the snapshot's actual angular neighbors, not array indices: differing
  // altitudes have differing periods, so slot order is not preserved over time.
  const heading = (p: Location) =>
    Math.atan2(
      Math.sin(p.lat * rad),
      Math.cos(p.lat * rad) * Math.cos((p.lon + 1) * rad),
    );
  const ordered = nodes
    .map((p, i) => ({ i, angle: heading(p) }))
    .sort((a, b) => a.angle - b.angle);
  let cursor = ordered.findIndex((n) => n.i === ingress);
  const hops = [ingress];
  for (let h = 0; h < 4; h++) {
    let next = (cursor + Math.round(NODE_COUNT / 60)) % NODE_COUNT;
    // Conservative fallback keeps every chosen laser clear of Earth and within
    // the 4,000 km terminal distance described in Starcloud's May 2026 announcement.
    while (
      !laserClearsEarth(nodes[hops[h]], nodes[ordered[next].i]) ||
      opticalDistanceKm(nodes[hops[h]], nodes[ordered[next].i]) > 4000
    ) {
      next = (next - 1 + NODE_COUNT) % NODE_COUNT;
      if (next === cursor) throw new Error("No visible optical neighbor");
    }
    hops.push(ordered[next].i);
    cursor = next;
  }
  const ground = groundRoute(origin, providerEntry),
    gatewayRoute = groundRoute(providerEntry, gateway);
  const uplinkKm = ALTITUDE_KM; // Illustrative carrier relay directly above the gateway.
  const carrierLinkKm = opticalDistanceKm(relay, nodes[ingress]);
  const laserKm =
    carrierLinkKm +
    hops
      .slice(1)
      .reduce(
        (sum, index, i) =>
          sum + opticalDistanceKm(nodes[hops[i]], nodes[index]),
        0,
      );
  const gatewayKm = ground.km + gatewayRoute.km;
  return {
    at,
    nodes,
    relay,
    carrierLinkKm,
    ingress,
    compute: hops[4],
    hops,
    gateway,
    ground,
    gatewayRoute,
    gatewayKm,
    uplinkKm,
    laserKm,
    rttMs:
      2 * (gatewayKm / 200000 + (uplinkKm + laserKm) / 299792.458) * 1000 + 12,
  };
}
