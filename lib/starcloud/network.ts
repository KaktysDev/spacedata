import { distanceKm, type Location } from "./catalog";
export const EARTH_KM = 6371,
  ALTITUDE_KM = 550,
  NODE_COUNT = 48;
export const ORBIT_PERIOD_MS = 95.5 * 60 * 1000;
export const JOURNEY_MS = 12400;
export type OrbitalRoute = {
  at: number;
  nodes: Location[];
  ingress: number;
  compute: number;
  hops: number[];
  gateway: Location;
  gatewayKm: number;
  laserKm: number;
  rttMs: number;
};
const rad = Math.PI / 180;
// An illustrative retrograde, near-polar plane (98° inclination). No TLE or live tracking claim.
export function orbitalNodes(at: number): Location[] {
  const normal = {
    x: Math.cos(-8 * rad) * Math.sin(-91 * rad),
    y: Math.sin(-8 * rad),
    z: Math.cos(-8 * rad) * Math.cos(-91 * rad),
  };
  const len = Math.hypot(normal.x, normal.z),
    right = { x: normal.z / len, y: 0, z: -normal.x / len };
  const up = {
    x: normal.y * right.z,
    y: normal.z * right.x - normal.x * right.z,
    z: -normal.y * right.x,
  };
  const phase = ((at % ORBIT_PERIOD_MS) / ORBIT_PERIOD_MS) * Math.PI * 2;
  return Array.from({ length: NODE_COUNT }, (_, i) => {
    const angle = (i / NODE_COUNT) * Math.PI * 2 + phase,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const x = right.x * c + up.x * s,
      y = up.y * s,
      z = right.z * c + up.z * s;
    return {
      lat: Math.asin(Math.max(-1, Math.min(1, y))) / rad,
      lon: Math.atan2(x, z) / rad,
    };
  });
}
export function routeAt(origin: Location, at: number): OrbitalRoute {
  const nodes = orbitalNodes(at);
  const ingress = nodes.reduce(
    (best, p, i) =>
      distanceKm(origin, p) < distanceKm(origin, nodes[best]) ? i : best,
    0,
  );
  // Four neighboring optical hops model a remote compute allocation, not a paper specification.
  const hops = Array.from({ length: 5 }, (_, i) => (ingress + i) % NODE_COUNT),
    compute = hops[4],
    gateway = nodes[ingress];
  const gatewayKm = distanceKm(origin, gateway) * 1.3;
  // Lasers travel along straight chords between visible neighboring nodes, not around curved arcs.
  const laserKm = hops
    .slice(1)
    .reduce(
      (sum, index, i) =>
        sum +
        2 *
          (EARTH_KM + ALTITUDE_KM) *
          Math.sin(distanceKm(nodes[hops[i]], nodes[index]) / EARTH_KM / 2),
      0,
    );
  const rttMs =
    2 * (gatewayKm / 200000 + (ALTITUDE_KM + laserKm) / 299792.458) * 1000 + 12;
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
export function laserClearsEarth(a: Location, b: Location) {
  return (
    (EARTH_KM + ALTITUDE_KM) * Math.cos(distanceKm(a, b) / EARTH_KM / 2) >
    EARTH_KM
  );
}
