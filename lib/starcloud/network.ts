import { distanceKm, type Location } from "./catalog";

export const EARTH_KM = 6371,
  ALTITUDE_KM = 550;
// One shell in the 600–850 km family. 8,800 satellites share this altitude,
// with only a few kilometers of scatter so the band has thickness without
// separating into visible layers.
export const SHELL_ALTITUDE_KM = 725;
export const SHELL_ALTITUDES_KM = [SHELL_ALTITUDE_KM] as const;
export const BAND_COUNT = 1,
  NODES_PER_BAND = 8800;
export const NODE_COUNT = BAND_COUNT * NODES_PER_BAND;
// Center of the illustrative access ribbon. 55° puts the east-west apex
// across Canada. The ribbon is not Starcloud's sun-synchronous compute orbit.
export const RING_INCLINATION_DEG = 55;
// Nominal cross-track half-width. The placed band breathes around this value
// so the edges are ragged, and a few columns share one argument of latitude.
export const RING_HALF_WIDTH_DEG = 10;
export const RING_LANES = 40;
// Northern apex near 100°W, over central Canada, instead of a steep meridian
// across the Americas.
export const RING_RAAN_DEG = 170;
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
export const MIN_ELEVATION_DEG = 25;
export const MAX_LASER_KM = 4000;
const C_KM_PER_MS = 299.792458;
const PROC_MS_PER_HOP = 1.5;
export const STAGES = [
  { at: 0, label: "Ground and orbital requests launched", short: "Launch" },
  { at: 2200, label: "Ground route reaches the provider", short: "Ground" },
  { at: 2800, label: "Laser links relay the orbital request", short: "Lasers" },
  { at: 6200, label: "Processing in the orbital scenario", short: "Compute" },
  { at: 10400, label: "Responses return to your location", short: "Return" },
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

const PER_LANE = NODE_COUNT / RING_LANES;
// A fixed inclination fan pinches every plane through the same two nodes and
// bulges only at the crests. Rotating about the local velocity keeps one ring.
// The half-width breathes along the track so that ring is not a ruled ribbon.
function localHalfWidth(u: number, halfWidth: number) {
  // One slow lap plus a weaker second harmonic. A faster wave hides inside
  // each along-track sector and the silhouette stays a constant width.
  const breathe = 0.34 * Math.sin(u + 0.7) + 0.12 * Math.sin(2 * u + 2.2);
  return halfWidth * (1 + breathe);
}
function ribbonPoint(u: number, inclination: number, raan: number, across: number) {
  const cosO = Math.cos(raan),
    sinO = Math.sin(raan),
    cosU = Math.cos(u),
    sinU = Math.sin(u),
    cosI = Math.cos(inclination),
    sinI = Math.sin(inclination);
  const px = cosO * cosU - sinO * sinU * cosI,
    py = sinO * cosU + cosO * sinU * cosI,
    pz = sinU * sinI;
  const vx = -cosO * sinU - sinO * cosU * cosI,
    vy = -sinO * sinU + cosO * cosU * cosI,
    vz = cosU * sinI;
  let nx = py * vz - pz * vy,
    ny = pz * vx - px * vz,
    nz = px * vy - py * vx;
  const nlen = Math.hypot(nx, ny, nz) || 1;
  nx /= nlen;
  ny /= nlen;
  nz /= nlen;
  const c = Math.cos(across),
    s = Math.sin(across);
  const x = px * c + nx * s,
    y = py * c + ny * s,
    z = pz * c + nz * s;
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, z))) / rad,
    lon: Math.atan2(y, x) / rad,
  };
}
export function orbitalNodes(at: number): OrbitalNode[] {
  const inclination = RING_INCLINATION_DEG * rad,
    raan = RING_RAAN_DEG * rad,
    halfWidth = RING_HALF_WIDTH_DEG * rad,
    slot = (2 * Math.PI) / PER_LANE;
  const columnSlot = (index: number) =>
    orbitalSeed((index + PER_LANE) % PER_LANE, 9) < 0.12;
  return Array.from({ length: NODE_COUNT }, (_, i) => {
    const lane = i % RING_LANES,
      along = Math.floor(i / RING_LANES);
    const altitudeKm =
      SHELL_ALTITUDE_KM +
      ((i + orbitalSeed(i, 1) * 0.999) / NODE_COUNT - 0.5) * 16;
    const period = orbitalPeriodMs(altitudeKm);
    let turns = ((at - ORBIT_EPOCH_MS) % period) / period;
    if (turns < 0) turns += 1;
    // A minority of slots are full columns. Every craft in that slot shares
    // one argument of latitude, so at the Canada crest the column is a
    // north-south stack on one meridian. Neighbors are biased away from that
    // argument so the stack stays readable. Everyone else wanders inside the
    // slot. Offsets stay cross-track, so the set remains one ring.
    const column = columnSlot(along);
    const u0 = turns * Math.PI * 2 + along * slot;
    let alongJitter = (orbitalSeed(i, 3) - 0.5) * slot * 0.5;
    if (!column) {
      if (columnSlot(along - 1)) alongJitter = Math.abs(alongJitter) + slot * 0.08;
      else if (columnSlot(along + 1))
        alongJitter = -Math.abs(alongJitter) - slot * 0.08;
    }
    const u = column ? u0 : u0 + alongJitter;
    const local = localHalfWidth(u, halfWidth);
    const laneFrac = (lane + 0.5) / RING_LANES - 0.5;
    const across = column
      ? laneFrac * 2 * local * 0.96 +
        (orbitalSeed(i, 4) - 0.5) * local * 0.05
      : laneFrac * 2 * local * (0.4 + 0.55 * orbitalSeed(i, 6)) +
        (orbitalSeed(i, 4) - 0.5) * local * 0.22;
    // Stay inside the local envelope. A global clamp would redraw a perfect edge.
    const limit = local;
    return {
      ...ribbonPoint(
        u,
        inclination,
        raan,
        Math.max(-limit, Math.min(limit, across)),
      ),
      altitudeKm,
      band: 0,
      slot: along,
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
  computeRelay: number;
  /** SSO-inclined craft one optical hop from the relay. Not a dawn-dusk ephemeris. */
  computeCraft: OrbitalNode;
  hops: number[];
  gateway: Location & { name: string };
  /** RF endpoint: the user when a relay is visible, otherwise a land gateway. */
  uplinkAnchor: Location;
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

const COMPUTE_ALTITUDE_KM = SHELL_ALTITUDE_KM + 36;

/**
 * Sun-synchronous inclination at the compute altitude, on the plane that
 * passes through the relay egress, stepped a few degrees ahead so the optical
 * hop is short. Dawn-dusk would also fix the node relative to the sun; this
 * picks the node that can actually see the handoff.
 */
function ssoCraftNear(egress: OrbitalNode): OrbitalNode {
  const altitudeKm = COMPUTE_ALTITUDE_KM;
  const incl = (sunSyncInclination(altitudeKm) * Math.PI) / 180;
  const lat = egress.lat * rad,
    lon = egress.lon * rad;
  const sinArg = Math.sin(lat) / Math.sin(incl);
  const u0 = Math.asin(Math.max(-1, Math.min(1, sinArg)));
  let best: OrbitalNode | null = null;
  let bestKm = Infinity;
  for (const u of [u0, Math.PI - u0]) {
    const cosU = Math.cos(u),
      sinU = Math.sin(u),
      cosI = Math.cos(incl);
    const ex = Math.cos(lat) * Math.cos(lon),
      ey = Math.cos(lat) * Math.sin(lon);
    const a = cosU,
      b = -sinU * cosI,
      c = sinU * cosI,
      d = cosU;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-8) continue;
    const raan = Math.atan2((-c * ex + a * ey) / det, (d * ex - b * ey) / det);
    const craft: OrbitalNode = {
      ...ribbonPoint(u + (4 * Math.PI) / 180, incl, raan, 0),
      altitudeKm,
      band: -1,
      slot: -1,
    };
    const km = opticalDistanceKm(egress, craft);
    if (
      km < bestKm &&
      km <= MAX_LASER_KM &&
      laserClearsEarth(egress, craft)
    ) {
      best = craft;
      bestKm = km;
    }
  }
  if (!best) throw new Error("No optical link to modeled ODC");
  return best;
}

/**
 * Two independent requests leave the user at the same time.
 * Ground: fiber to the provider, then back along that path.
 * Orbit: direct uplink when a relay is above the elevation mask; otherwise a
 * feeder to a land gateway, then uplink and laser links to a separate compute
 * craft. The reply retraces that orbital path and stops at the user.
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

  const visibleHubs = HUBS.filter(
    (h) => elevationDeg(h, nodes[ingress]) >= MIN_ELEVATION_DEG,
  );
  const gateway =
    typeof (uplinkAnchor as { name?: string }).name === "string"
      ? (uplinkAnchor as (typeof HUBS)[number])
      : (visibleHubs.length ? visibleHubs : HUBS).reduce((best, h) =>
          distanceKm(origin, h) < distanceKm(origin, best) ? h : best,
        );
  const gatewayRoute = groundRoute(origin, uplinkAnchor);
  const relay = { ...nodes[ingress] };
  const uplinkKm = opticalDistanceKm(
    { lat: uplinkAnchor.lat, lon: uplinkAnchor.lon, altitudeKm: 0 },
    nodes[ingress],
  );

  const local = nearestLaserLinks(nodes, ingress, 24);
  if (!local.length) throw new Error("No orbital compute neighbor");
  const computeRelay = local.sort((a, b) => a.km - b.km)[0].i;
  const path = shortestLaserPath(nodes, ingress, computeRelay);
  const hops = path.hops;
  const computeCraft = ssoCraftNear(nodes[computeRelay]);
  const carrierLinkKm = opticalDistanceKm(nodes[computeRelay], computeCraft);
  const laserKm = path.km + carrierLinkKm;
  const gatewayKm = gatewayRoute.km;
  const oneWayMs =
    gatewayRoute.km / 200 +
    uplinkKm / C_KM_PER_MS +
    laserKm / C_KM_PER_MS +
    (hops.length + 1) * PROC_MS_PER_HOP +
    4;
  return {
    at,
    nodes,
    relay,
    carrierLinkKm,
    ingress,
    computeRelay,
    computeCraft,
    hops,
    gateway,
    uplinkAnchor,
    ground,
    gatewayRoute,
    gatewayKm,
    uplinkKm,
    laserKm,
    rttMs: 2 * oneWayMs,
  };
}
