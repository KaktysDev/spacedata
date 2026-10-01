import { distanceKm, type Location } from "./catalog";

export const EARTH_KM = 6371,
  ALTITUDE_KM = 725;
// Starcloud's FCC application (SAT-LOA-20260202-00073) proposes sun-synchronous
// shells between 600 and 850 km. 725 km is the midpoint of that published band,
// used only where a single reference altitude is required. The drawn ring is
// raised off the globe; propagation uses these physical altitudes.
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
// reference plane can stay perpendicular to the sun. Craft stay on this one
// plane: the filing describes narrow shells, not a spread of longitudes.
export const RING_INCLINATION_DEG = sunSyncInclination(SHELL_ALTITUDE_KM);
export const INCLINATION_SPREAD_DEG = 0;
export const RAAN_SPREAD_DEG = 0;
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
// Whitepaper: the speed of light in vacuum is 35% faster than in typical glass fiber.
export const C_KM_PER_MS = 299.792458;
export const VACUUM_OVER_FIBER = 1.35;
export const FIBER_KM_PER_MS = C_KM_PER_MS / VACUUM_OVER_FIBER;
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

export type GroundRoute = {
  points: Location[];
  stops: (Location & { name: string })[];
  km: number;
  rttMs: number;
};
/**
 * Surface distance from the user to a public provider site.
 * Starcloud does not publish a fiber map. The length is the great-circle
 * surface path, and the speed is the whitepaper's glass figure: vacuum is
 * 35% faster than typical fiber, so fiber travels at c / 1.35.
 */
export function groundRoute(
  origin: Location,
  destination: Location,
): GroundRoute {
  const km = distanceKm(origin, destination);
  return {
    points: [origin, destination],
    stops: [],
    km,
    rttMs: (2 * km) / FIBER_KM_PER_MS,
  };
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
    // Even stations on one plane. Altitude is the only spread, across the
    // filed 600–850 km band, so the shell stays one longitude.
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
    const u = (turns + (i + 0.5) / NODE_COUNT) * Math.PI * 2;
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
  /** Starcloud-2, one spacecraft on this dawn-dusk shell. */
  computeCraft: OrbitalNode;
  hops: number[];
  /** Points of the optical leg, on the shell. Straight when it clears Earth, otherwise the shorter arc. */
  opticalPoints: OrbitalNode[];
  gateway: Location & { name: string };
  /** RF leaves the user. Starcloud does not publish a separate gateway site. */
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
// One visual millisecond per physical millisecond, times this factor.
// No fixed base: a longer light-time stays proportionally longer on screen.
const PLAYBACK_MS_PER_PROP_MS = 48;
const PLAYBACK_COMPUTE_PROXY_MS = 1200;
const PLAYBACK_RELEASE_MARGIN_MS = 100;
const window = (startMs: number, endMs: number): PlaybackWindow => ({
  startMs,
  endMs,
});

/**
 * Playback for two parallel paths. Visual duration is physical propagation
 * time multiplied by one constant, so the longer light-time takes longer on
 * screen by the same ratio. The API calls are both served on Earth; their
 * measured durations are not the route times.
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
    oneWayMs * PLAYBACK_MS_PER_PROP_MS;
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

  // Published legs only: RF at c, then the optical link at c. No feeder and
  // no per-hop processing delay — Starcloud does not publish either.
  const feederMs = 0;
  const uplinkMs = positive(route.uplinkKm) / C_KM_PER_MS;
  const laserMs = positive(route.laserKm) / C_KM_PER_MS;
  const physicalLegTotal = feederMs + uplinkMs + laserMs;
  const visualOutboundMs = spaceOutEnd - launchMs;
  const share = physicalLegTotal > 0 ? physicalLegTotal : 1;
  const feederEnd = launchMs + (visualOutboundMs * feederMs) / share;
  const uplinkEnd = feederEnd + (visualOutboundMs * uplinkMs) / share;
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
/** One commercial spacecraft. Starcloud-2 is not a fleet of stand-ins. */
export const STARCLOUD2_SLOT = 0;

/** Shorter arc along the shell, in kilometres. */
export function shellArcKm(a: ElevatedLocation, b: ElevatedLocation) {
  const theta = distanceKm(a, b) / EARTH_KM;
  const ra = EARTH_KM + (a.altitudeKm ?? ALTITUDE_KM);
  const rb = EARTH_KM + (b.altitudeKm ?? ALTITUDE_KM);
  return theta * ((ra + rb) / 2);
}

function opticalLeg(from: OrbitalNode, to: OrbitalNode) {
  if (laserClearsEarth(from, to))
    return { km: opticalDistanceKm(from, to), points: [from, to] };
  const steps = 64;
  const points: OrbitalNode[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const loc = interpolateLocation(from, to, t);
    points.push({
      ...loc,
      altitudeKm: from.altitudeKm + (to.altitudeKm - from.altitudeKm) * t,
      band: 0,
      slot: -1,
    });
  }
  return { km: shellArcKm(from, to), points };
}

/**
 * Two requests leave the user at the same time.
 * Ground: surface fiber to the public reference site and back. That site is
 * not a location the provider returned.
 * Orbit, from the Starcloud-2 diagram: RF from the end user to a backhaul
 * spacecraft, then one optical link to Starcloud-2, then the same path home.
 * The third-party backhaul orbit is not published. The RF satellite is the
 * other craft in the filed 600–850 km dawn-dusk shell with the highest
 * elevation. The optical leg is the straight vacuum path when it clears
 * Earth, otherwise the shorter arc on that shell. Starcloud-1 is not this path.
 */
export function routeAt(
  origin: Location,
  at: number,
  providerEntry: Location = origin,
): OrbitalRoute {
  const nodes = orbitalNodes(at);
  const ground = groundRoute(origin, providerEntry);
  const computeRelay = STARCLOUD2_SLOT;
  const computeCraft = nodes[computeRelay];

  let ingress = computeRelay === 0 ? 1 : 0;
  let bestElev = -Infinity;
  for (let i = 0; i < nodes.length; i++) {
    if (i === computeRelay) continue;
    const elev = elevationDeg(origin, nodes[i]);
    if (elev > bestElev) {
      bestElev = elev;
      ingress = i;
    }
  }

  const uplinkAnchor = origin;
  const gateway = { ...origin, name: "You" };
  const gatewayRoute: GroundRoute = {
    points: [origin],
    stops: [],
    km: 0,
    rttMs: 0,
  };
  const relay = { ...nodes[ingress] };
  const uplinkKm = opticalDistanceKm(
    { lat: origin.lat, lon: origin.lon, altitudeKm: 0 },
    nodes[ingress],
  );
  const optical = opticalLeg(nodes[ingress], computeCraft);
  const hops = [ingress, computeRelay];
  const oneWayMs = uplinkKm / C_KM_PER_MS + optical.km / C_KM_PER_MS;
  return {
    at,
    nodes,
    relay,
    carrierLinkKm: 0,
    ingress,
    computeRelay,
    computeCraft,
    hops,
    opticalPoints: optical.points,
    gateway,
    uplinkAnchor,
    ground,
    gatewayRoute,
    gatewayKm: 0,
    uplinkKm,
    laserKm: optical.km,
    rttMs: 2 * oneWayMs,
  };
}
