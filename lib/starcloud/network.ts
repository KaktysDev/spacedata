import { distanceKm, type Location } from "./catalog";

export const EARTH_KM = 6371,
  ALTITUDE_KM = 725;
// Reference altitude for the sun-synchronous plane used by routing and the
// fixed dawn-dusk sun. The drawn ring is visually raised from the globe;
// propagation and line-of-sight calculations use these physical altitudes.
export const SHELL_ALTITUDE_KM = 725;
export const SHELL_ALTITUDE_MIN_KM = 600;
export const SHELL_ALTITUDE_MAX_KM = 850;
export const SHELL_ALTITUDES_KM = [SHELL_ALTITUDE_KM] as const;
export const BAND_COUNT = 1,
  NODES_PER_BAND = 8800;
export const NODE_COUNT = BAND_COUNT * NODES_PER_BAND;
const MU = 398600.4418,
  J2 = 0.00108262668;
// Sun-synchronous inclination at the reference altitude. Retrograde, so the
// reference plane can stay perpendicular to the sun. Individual spacecraft
// are spread far from this plane.
export const RING_INCLINATION_DEG = sunSyncInclination(SHELL_ALTITUDE_KM);
// Modest body on one ring. Wide enough that craft are not a razor line,
// narrow enough that the fleet stays an annulus instead of a shell.
export const INCLINATION_SPREAD_DEG = 12;
export const RAAN_SPREAD_DEG = 16;
// Dawn-dusk means the orbit normal is the sun direction, so the plane is the
// terminator. 20°E is a fixed subsolar longitude chosen so the lit hemisphere
// matches the white-paper figure (Africa and Europe in daylight). It is not a
// propagated ephemeris.
export const DAWN_DUSK_SUBSOLAR_LON_DEG = 20;
export const RING_RAAN_DEG = dawnDuskRaanDeg(
  RING_INCLINATION_DEG,
  DAWN_DUSK_SUBSOLAR_LON_DEG,
);
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
/** RAAN that puts the orbit normal on the sun, so the plane is the terminator. */
export function dawnDuskRaanDeg(inclinationDeg: number, subsolarLonDeg: number) {
  const incl = (inclinationDeg * Math.PI) / 180;
  const lat = Math.asin(Math.max(-1, Math.min(1, Math.cos(incl))));
  const lon = (subsolarLonDeg * Math.PI) / 180;
  const sx = Math.cos(lat) * Math.cos(lon);
  const sy = Math.cos(lat) * Math.sin(lon);
  let raan = Math.atan2(sx, -sy);
  if (raan < 0) raan += 2 * Math.PI;
  return (raan * 180) / Math.PI;
}
/** Unit sun vector in ECEF for the illustrative dawn-dusk alignment. */
export function dawnDuskSunEcef() {
  const incl = (RING_INCLINATION_DEG * Math.PI) / 180;
  const lat = Math.asin(Math.max(-1, Math.min(1, Math.cos(incl))));
  const lon = (DAWN_DUSK_SUBSOLAR_LON_DEG * Math.PI) / 180;
  return {
    x: Math.cos(lat) * Math.cos(lon),
    y: Math.cos(lat) * Math.sin(lon),
    z: Math.sin(lat),
  };
}
export type OrbitalNode = Location & {
  altitudeKm: number;
  band: number;
  slot: number;
};
export const MIN_ELEVATION_DEG = 25;
export const MAX_LASER_KM = 4000;
const C_KM_PER_MS = 299.792458;
const PROC_MS_PER_HOP = 1.5;
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
  const altSpan = SHELL_ALTITUDE_MAX_KM - SHELL_ALTITUDE_MIN_KM;
  return Array.from({ length: NODE_COUNT }, (_, i) => {
    // One unique station along the ring. Cross-track and altitude use other
    // strides so neighbors do not stack on that station.
    const alongJ = (orbitalSeed(i, 3) - 0.5) * 0.45;
    const inclT = ((i * 17) % 48) / 47;
    const raanT = ((i * 29) % 40) / 39;
    const altT = ((i * 13) % 32) / 31;
    const inclinationDeg =
      RING_INCLINATION_DEG +
      (inclT - 0.5 + (orbitalSeed(i, 2) - 0.5) * 0.08) *
        INCLINATION_SPREAD_DEG;
    const raanDeg =
      RING_RAAN_DEG +
      (raanT - 0.5 + (orbitalSeed(i, 4) - 0.5) * 0.08) * RAAN_SPREAD_DEG;
    const altitudeKm =
      SHELL_ALTITUDE_MIN_KM +
      Math.min(
        0.999,
        Math.max(0, altT + (orbitalSeed(i, 1) - 0.5) * 0.04),
      ) *
        altSpan;
    const period = orbitalPeriodMs(altitudeKm);
    let turns = ((at - ORBIT_EPOCH_MS) % period) / period;
    if (turns < 0) turns += 1;
    const u = (turns + (i + 0.5 + alongJ) / NODE_COUNT) * Math.PI * 2;
    return {
      ...ribbonPoint(u, inclinationDeg * rad, raanDeg * rad, 0),
      altitudeKm,
      band: 0,
      slot: i,
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
  /** Compute spacecraft on this same dawn-dusk shell, reached by optical ISLs. */
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

export type PlaybackWindow = { startMs: number; endMs: number };
export type PlaybackLane = {
  outbound: PlaybackWindow;
  compute: PlaybackWindow;
  return: PlaybackWindow;
  finishedMs: number;
  /** Shared illustrative compute proxy plus this lane's modeled RTT. */
  modeledTotalMs: number;
};
export type RoutePlayback = {
  launchMs: number;
  ground: PlaybackLane;
  space: PlaybackLane & {
    feeder: PlaybackWindow;
    uplink: PlaybackWindow;
    laser: PlaybackWindow;
  };
  firstArrivalMs: number;
  firstFinished: "ground" | "space" | "tie";
  totalMs: number;
  waitingForAnswer: boolean;
};
type PlaybackRoute = Pick<
  OrbitalRoute,
  "ground" | "gatewayRoute" | "uplinkKm" | "laserKm" | "hops" | "rttMs"
>;
const PLAYBACK_LAUNCH_MS = 700;
const PLAYBACK_TRAVEL_BASE_MS = 1250;
const PLAYBACK_PROPAGATION_STRETCH = 12;
const PLAYBACK_COMPUTE_PROXY_MS = 1200;
const PLAYBACK_RELEASE_MARGIN_MS = 100;
const window = (startMs: number, endMs: number): PlaybackWindow => ({
  startMs,
  endMs,
});

/**
 * Educational playback for two parallel paths. Every physical propagation
 * interval receives the same visual time transform. This makes a millisecond
 * network hop visible while preserving which modeled route would finish first
 * under an identical compute workload. The API calls are both served on Earth;
 * their measured durations must not be presented as orbital service times.
 *
 * The compute window holds until both API responses are available because the
 * client receives them together. No return packet is drawn before that point.
 */
export function createRoutePlayback(
  route: PlaybackRoute,
  {
    elapsedMs = 0,
    answerReadyAtMs = null,
  }: { elapsedMs?: number; answerReadyAtMs?: number | null } = {},
): RoutePlayback {
  const positive = (value: number) =>
    Number.isFinite(value) ? Math.max(0, value) : 0;
  const groundOneWayMs = positive(route.ground.rttMs) / 2;
  const spaceOneWayMs = positive(route.rttMs) / 2;
  const travelVisualMs = (oneWayMs: number) =>
    PLAYBACK_TRAVEL_BASE_MS +
    oneWayMs * PLAYBACK_PROPAGATION_STRETCH;
  const launchMs = PLAYBACK_LAUNCH_MS;
  const groundOutEnd = launchMs + travelVisualMs(groundOneWayMs);
  const spaceOutEnd = launchMs + travelVisualMs(spaceOneWayMs);
  const firstArrivalMs = Math.min(groundOutEnd, spaceOutEnd);
  const releaseAtMs =
    answerReadyAtMs === null
      ? positive(elapsedMs) + PLAYBACK_RELEASE_MARGIN_MS
      : positive(answerReadyAtMs) + PLAYBACK_RELEASE_MARGIN_MS;
  const computeVisualMs = Math.max(
    PLAYBACK_COMPUTE_PROXY_MS,
    releaseAtMs - firstArrivalMs,
  );
  const lane = (outEnd: number, oneWayMs: number): PlaybackLane => {
    const computeEnd = outEnd + computeVisualMs;
    const finishedMs = computeEnd + travelVisualMs(oneWayMs);
    return {
      outbound: window(launchMs, outEnd),
      compute: window(outEnd, computeEnd),
      return: window(computeEnd, finishedMs),
      finishedMs,
      modeledTotalMs: PLAYBACK_COMPUTE_PROXY_MS + 2 * oneWayMs,
    };
  };
  const ground = lane(groundOutEnd, groundOneWayMs);
  const spaceBase = lane(spaceOutEnd, spaceOneWayMs);

  // A feeder is zero-length for direct user uplinks. The terminal delay is
  // assigned to the uplink and optical relay processing to the laser leg.
  const feederMs = positive(route.gatewayRoute.km) / 200;
  const uplinkMs = positive(route.uplinkKm) / C_KM_PER_MS + 4;
  const laserMs =
    positive(route.laserKm) / C_KM_PER_MS +
    Math.max(0, route.hops.length - 1) * PROC_MS_PER_HOP;
  const physicalLegTotal = feederMs + uplinkMs + laserMs;
  const visualOutboundMs = spaceOutEnd - launchMs;
  const feederEnd =
    launchMs + (visualOutboundMs * feederMs) / physicalLegTotal;
  const uplinkEnd =
    feederEnd + (visualOutboundMs * uplinkMs) / physicalLegTotal;
  const space = {
    ...spaceBase,
    feeder: window(launchMs, feederEnd),
    uplink: window(feederEnd, uplinkEnd),
    laser: window(uplinkEnd, spaceOutEnd),
  };
  const difference = route.ground.rttMs - route.rttMs;
  return {
    launchMs,
    ground,
    space,
    firstArrivalMs,
    firstFinished:
      Math.abs(difference) < 1e-9
        ? "tie"
        : difference < 0
          ? "ground"
          : "space",
    totalMs: Math.max(ground.finishedMs, space.finishedMs),
    waitingForAnswer: answerReadyAtMs === null,
  };
}
// The chosen craft stands in for Starcloud-2, one commercial smallsat.
// Extra slots keep a reachable stand-in; they are not a commercial fleet.
export const COMPUTE_SLOTS = [0, 1760, 3520, 5280, 7040] as const;
/** Return the nearest reachable compute craft by direct distance. */
function laserRelayToCompute(nodes: OrbitalNode[], ingress: number) {
  const candidates = COMPUTE_SLOTS.slice().sort(
    (a, b) =>
      opticalDistanceKm(nodes[ingress], nodes[a]) -
      opticalDistanceKm(nodes[ingress], nodes[b]),
  );
  for (const goal of candidates) {
    const path = laserPathToGoal(nodes, ingress, goal);
    if (path) return path;
  }
  throw new Error("No optical path to compute");
}
/** Greedy Earth-clear laser path with a bounded number of relay terminals. */
function laserPathToGoal(
  nodes: OrbitalNode[],
  ingress: number,
  goal: number,
): { hops: number[]; km: number; compute: number } | null {
  if (goal === ingress) return { hops: [ingress], km: 0, compute: goal };
  const hops = [ingress];
  let km = 0;
  const seen = new Set<number>([ingress]);
  for (let guard = 0; guard < 12 && hops[hops.length - 1] !== goal; guard++) {
    const cur = hops[hops.length - 1];
    const goalDist = opticalDistanceKm(nodes[cur], nodes[goal]);
    if (
      goalDist > 40 &&
      goalDist <= MAX_LASER_KM &&
      laserClearsEarth(nodes[cur], nodes[goal])
    ) {
      km += goalDist;
      hops.push(goal);
      break;
    }
    let pick = -1,
      bestRemain = goalDist;
    for (let i = 0; i < nodes.length; i++) {
      if (seen.has(i)) continue;
      const dist = opticalDistanceKm(nodes[cur], nodes[i]);
      if (dist <= 200 || dist > MAX_LASER_KM) continue;
      if (!laserClearsEarth(nodes[cur], nodes[i])) continue;
      const remain = opticalDistanceKm(nodes[i], nodes[goal]);
      if (remain < bestRemain - 100) {
        bestRemain = remain;
        pick = i;
      }
    }
    if (pick < 0) return null;
    km += opticalDistanceKm(nodes[cur], nodes[pick]);
    seen.add(pick);
    hops.push(pick);
  }
  if (hops[hops.length - 1] !== goal) return null;
  return { hops, km, compute: goal };
}

/**
 * Two independent requests leave the user at the same time.
 * Ground: fiber to the nearest public reference site, then back. That site is
 * not a location returned by the provider.
 * Orbit: RF uplink when a relay is above the elevation mask; otherwise a
 * feeder to a land gateway, then the uplink. Optical links cross the relay
 * shell to the nearest reachable craft standing in for Starcloud-2. The reply
 * returns across that shell to the user. The shell is not Starcloud-2, and
 * Starcloud-1 is a separate demonstration spacecraft.
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
      const groundPoint = { ...origin, altitudeKm: 0 };
      return opticalDistanceKm(groundPoint, entry.node) <
        opticalDistanceKm(groundPoint, best.node)
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

  const path = laserRelayToCompute(nodes, ingress);
  const hops = path.hops;
  const computeRelay = hops[hops.length - 1];
  const computeCraft = nodes[computeRelay];
  const carrierLinkKm = 0;
  const laserKm = path.km;
  const gatewayKm = gatewayRoute.km;
  const opticalHops = Math.max(0, hops.length - 1);
  const oneWayMs =
    gatewayRoute.km / 200 +
    uplinkKm / C_KM_PER_MS +
    laserKm / C_KM_PER_MS +
    opticalHops * PROC_MS_PER_HOP +
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
