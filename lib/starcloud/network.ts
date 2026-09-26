import { distanceKm, type Location } from "./catalog";

// IUGG conventional mean Earth radius.
export const EARTH_KM = 6371;
// Speed of light in km/s (defined exact value).
export const C_KM_S = 299792.458;
// Fiber group velocity used by the ground haul (~c / 1.5).
export const FIBER_KM_S = 200000;
// Processing and terminal overhead kept from the existing estimate.
export const RTT_OVERHEAD_MS = 12;

// Starlink Gen-1 Shell 1, the operational LEO shell this view models:
// 1,584 satellites, 72 planes × 22, 550 km, 53.0° inclination
// (SpaceX FCC SAT-MOD-20200417-00037 and later Gen-1 authorizations).
export const ALTITUDE_KM = 550;
export const INCLINATION_DEG = 53;
export const PLANE_COUNT = 72;
export const SATS_PER_PLANE = 22;
export const NODE_COUNT = PLANE_COUNT * SATS_PER_PLANE;
// Walker-delta phasing parameter F. Same-slot satellites in adjacent planes
// are separated by F/T of a revolution, here half an in-plane slot.
export const WALKER_F = 36;
// User-terminal elevation mask. SpaceX lowered the Gen-1 minimum from 40° to 25°.
export const MIN_ELEVATION_DEG = 25;
// Beams must clear the mesosphere, not merely the hard Earth ellipsoid.
const OCCULTATION_MARGIN_KM = 80;

// GM (km³/s²). Period at a = 6371+550 km is 2π√(a³/μ) ≈ 95.50 min.
export const ORBIT_PERIOD_MS = 95.5 * 60 * 1000;
export const JOURNEY_MS = 12400;

export type OrbitalNode = Location & {
  altKm: number;
  plane: number;
  slot: number;
};
export type OrbitalRoute = {
  at: number;
  nodes: OrbitalNode[];
  ingress: number;
  compute: number;
  hops: number[];
  gateway: Location;
  gatewayKm: number;
  laserKm: number;
  rttMs: number;
};

const rad = Math.PI / 180;
const INCLINATION = INCLINATION_DEG * rad;
const COS_I = Math.cos(INCLINATION);
const SIN_I = Math.sin(INCLINATION);
// Deterministic scatter so the shell is not a perfect lattice.
// Kept well below half the plane spacing (5°) and half the in-plane slot (8.18°)
// so neighbor order and line-of-sight clearance do not change.
const RAAN_JITTER_RAD = 0.45 * rad;
const ANOMALY_JITTER_RAD = 1.6 * rad;
const ALT_JITTER_KM = 3.5;

const unit = (x: number) => {
  let h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};
const signed = (plane: number, slot: number, salt: number) =>
  unit(plane * 131 + slot * 977 + salt * 524287) * 2 - 1;

const raanJitter = new Float64Array(PLANE_COUNT);
const anomalyJitter = new Float64Array(NODE_COUNT);
const altJitter = new Float64Array(NODE_COUNT);
for (let plane = 0; plane < PLANE_COUNT; plane++) {
  raanJitter[plane] = signed(plane, 0, 1) * RAAN_JITTER_RAD;
  for (let slot = 0; slot < SATS_PER_PLANE; slot++) {
    const index = plane * SATS_PER_PLANE + slot;
    anomalyJitter[index] = signed(plane, slot, 2) * ANOMALY_JITTER_RAD;
    altJitter[index] = signed(plane, slot, 3) * ALT_JITTER_KM;
  }
}

export function planeOf(index: number) {
  return Math.floor(index / SATS_PER_PLANE);
}
export function slotOf(index: number) {
  return index % SATS_PER_PLANE;
}
export function satIndex(plane: number, slot: number) {
  const p = ((plane % PLANE_COUNT) + PLANE_COUNT) % PLANE_COUNT;
  const s = ((slot % SATS_PER_PLANE) + SATS_PER_PLANE) % SATS_PER_PLANE;
  return p * SATS_PER_PLANE + s;
}

type Vec = { x: number; y: number; z: number };
function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function scale(a: Vec, s: number): Vec {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function dot(a: Vec, b: Vec) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function hypot(a: Vec) {
  return Math.hypot(a.x, a.y, a.z);
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// Scene-aligned ECEF: Y is north, lon 0 lies on +Z, matching the globe.
export function ecefKm(latDeg: number, lonDeg: number, altKm: number): Vec {
  const lat = latDeg * rad,
    lon = lonDeg * rad,
    r = EARTH_KM + altKm;
  return {
    x: r * Math.cos(lat) * Math.sin(lon),
    y: r * Math.sin(lat),
    z: r * Math.cos(lat) * Math.cos(lon),
  };
}

function direction(plane: number, slot: number, phase: number): Vec {
  const index = plane * SATS_PER_PLANE + slot;
  const raan = (plane / PLANE_COUNT) * Math.PI * 2 + raanJitter[plane];
  // u = mean anomaly + Walker phase + per-satellite anomaly jitter.
  const u =
    phase +
    (slot / SATS_PER_PLANE) * Math.PI * 2 +
    ((plane * WALKER_F) / NODE_COUNT) * Math.PI * 2 +
    anomalyJitter[index];
  const cosO = Math.cos(raan),
    sinO = Math.sin(raan),
    cosU = Math.cos(u),
    sinU = Math.sin(u);
  const ex = cosO * cosU - sinO * sinU * COS_I;
  const ey = sinO * cosU + cosO * sinU * COS_I;
  const ez = sinU * SIN_I;
  return { x: ey, y: ez, z: ex };
}

function nodeAt(plane: number, slot: number, phase: number): OrbitalNode {
  const index = plane * SATS_PER_PLANE + slot;
  const d = direction(plane, slot, phase);
  return {
    lat: Math.asin(clamp(d.y, -1, 1)) / rad,
    lon: Math.atan2(d.x, d.z) / rad,
    altKm: ALTITUDE_KM + altJitter[index],
    plane,
    slot,
  };
}

export function fillOrbit(
  at: number,
  lat: Float64Array,
  lon: Float64Array,
  altKm: Float64Array,
) {
  const phase = ((at % ORBIT_PERIOD_MS) / ORBIT_PERIOD_MS) * Math.PI * 2;
  for (let plane = 0; plane < PLANE_COUNT; plane++) {
    for (let slot = 0; slot < SATS_PER_PLANE; slot++) {
      const node = nodeAt(plane, slot, phase);
      const index = plane * SATS_PER_PLANE + slot;
      lat[index] = node.lat;
      lon[index] = node.lon;
      altKm[index] = node.altKm;
    }
  }
}

export function orbitalNodes(at: number): OrbitalNode[] {
  const phase = ((at % ORBIT_PERIOD_MS) / ORBIT_PERIOD_MS) * Math.PI * 2;
  const nodes = new Array<OrbitalNode>(NODE_COUNT);
  for (let plane = 0; plane < PLANE_COUNT; plane++) {
    for (let slot = 0; slot < SATS_PER_PLANE; slot++)
      nodes[plane * SATS_PER_PLANE + slot] = nodeAt(plane, slot, phase);
  }
  return nodes;
}

function centralAngle(a: Vec, b: Vec) {
  return Math.acos(clamp(dot(a, b), -1, 1));
}

// In-plane fore neighbor, and the nearest satellite in the next RAAN plane.
// Relative geometry is fixed (common mean motion), so the pairing does not change with time.
// That is the published 4-terminal pattern: fore/aft in plane, left/right into adjacent planes.
export const alongTrack = new Int16Array(NODE_COUNT);
export const crossRight = new Int16Array(NODE_COUNT);
for (let plane = 0; plane < PLANE_COUNT; plane++) {
  for (let slot = 0; slot < SATS_PER_PLANE; slot++) {
    const index = plane * SATS_PER_PLANE + slot;
    alongTrack[index] = satIndex(plane, slot + 1);
    const here = direction(plane, slot, 0);
    let bestSlot = 0;
    let best = Infinity;
    const nextPlane = (plane + 1) % PLANE_COUNT;
    for (let other = 0; other < SATS_PER_PLANE; other++) {
      const angle = centralAngle(here, direction(nextPlane, other, 0));
      if (angle < best) {
        best = angle;
        bestSlot = other;
      }
    }
    crossRight[index] = satIndex(nextPlane, bestSlot);
  }
}

export function isOpticalNeighbor(a: number, b: number) {
  return alongTrack[a] === b || crossRight[a] === b;
}

export function elevationDeg(user: Location, sat: OrbitalNode) {
  const ru = ecefKm(user.lat, user.lon, 0);
  const rs = ecefKm(sat.lat, sat.lon, sat.altKm);
  const los = { x: rs.x - ru.x, y: rs.y - ru.y, z: rs.z - ru.z };
  const range = hypot(los);
  if (range < 1e-6) return 90;
  return (Math.asin(clamp(dot(los, ru) / (range * EARTH_KM), -1, 1)) * 180) / Math.PI;
}

export function slantKm(user: Location, sat: OrbitalNode) {
  const ru = ecefKm(user.lat, user.lon, 0);
  const rs = ecefKm(sat.lat, sat.lon, sat.altKm);
  return Math.hypot(rs.x - ru.x, rs.y - ru.y, rs.z - ru.z);
}

export function laserClearsEarth(
  a: Location & { altKm?: number },
  b: Location & { altKm?: number },
) {
  const A = ecefKm(a.lat, a.lon, a.altKm ?? ALTITUDE_KM);
  const B = ecefKm(b.lat, b.lon, b.altKm ?? ALTITUDE_KM);
  const ab = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z };
  const ab2 = dot(ab, ab);
  let t = ab2 < 1e-8 ? 0 : -dot(A, ab) / ab2;
  t = clamp(t, 0, 1);
  const closest = add(A, scale(ab, t));
  return hypot(closest) > EARTH_KM + OCCULTATION_MARGIN_KM;
}

function chordKm(a: OrbitalNode, b: OrbitalNode) {
  const A = ecefKm(a.lat, a.lon, a.altKm);
  const B = ecefKm(b.lat, b.lon, b.altKm);
  return Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z);
}

function nearestVisible(origin: Location, nodes: OrbitalNode[]) {
  let ingress = -1;
  let bestSlant = Infinity;
  let fallback = 0;
  let bestElev = -Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const elev = elevationDeg(origin, nodes[i]);
    if (elev > bestElev) {
      bestElev = elev;
      fallback = i;
    }
    if (elev + 1e-6 >= MIN_ELEVATION_DEG) {
      const slant = slantKm(origin, nodes[i]);
      if (slant < bestSlant) {
        bestSlant = slant;
        ingress = i;
      }
    }
  }
  // Above ~70° latitude the 53° shell is below the mask. Use the highest bird.
  return ingress >= 0 ? ingress : fallback;
}

export function routeAt(origin: Location, at: number): OrbitalRoute {
  const nodes = orbitalNodes(at);
  const ingress = nearestVisible(origin, nodes);
  // Four optical hops: two stable in-plane fore links, one adjacent-plane
  // crosslink, then another fore link. Mirrors a 4-terminal LEO router
  // choosing a short path across the shell rather than a single meridian.
  const hops = [ingress];
  const plan = ["along", "along", "cross", "along"] as const;
  for (const kind of plan) {
    const from = hops[hops.length - 1];
    const preferred = kind === "along" ? alongTrack[from] : crossRight[from];
    const backup = kind === "along" ? crossRight[from] : alongTrack[from];
    const next = laserClearsEarth(nodes[from], nodes[preferred])
      ? preferred
      : backup;
    hops.push(next);
  }
  const compute = hops[4];
  const gateway = { lat: nodes[ingress].lat, lon: nodes[ingress].lon };
  const gatewayKm = distanceKm(origin, gateway) * 1.3;
  const uplinkKm = slantKm(gateway, nodes[ingress]);
  let laserKm = 0;
  for (let i = 1; i < hops.length; i++)
    laserKm += chordKm(nodes[hops[i - 1]], nodes[hops[i]]);
  const rttMs =
    2 *
      (gatewayKm / FIBER_KM_S + (uplinkKm + laserKm) / C_KM_S) *
      1000 +
    RTT_OVERHEAD_MS;
  return {
    at,
    nodes,
    ingress,
    compute,
    hops,
    gateway,
    gatewayKm,
    laserKm,
    rttMs,
  };
}
