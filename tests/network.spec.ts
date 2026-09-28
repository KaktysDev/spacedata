import { test, expect } from "@playwright/test";
import {
  DEFAULT_LOCATION,
  PRESETS,
  PROVIDER_IDS,
  distanceKm,
  nearestSite,
} from "../lib/starcloud/catalog";
import { compare } from "../lib/starcloud/comparison";
import {
  NODE_COUNT,
  orbitalNodes,
  routeAt,
  groundRoute,
  elevationDeg,
  laserClearsEarth,
  interpolateLocation,
  orbitalPeriodMs,
  ORBIT_EPOCH_MS,
  opticalDistanceKm,
  RING_HALF_WIDTH_DEG,
  RING_INCLINATION_DEG,
  RING_LANES,
  RING_RAAN_DEG,
  dawnDuskSunEcef,
  sunSyncInclination,
} from "../lib/starcloud/network";

test("the shell is one dawn-dusk plane, tall and narrow", () => {
  const nodes = orbitalNodes(ORBIT_EPOCH_MS);
  expect(RING_INCLINATION_DEG).toBeCloseTo(sunSyncInclination(725), 6);
  expect(RING_INCLINATION_DEG).toBeGreaterThan(98);
  expect(RING_INCLINATION_DEG).toBeLessThan(99);
  expect(RING_RAAN_DEG).toBeCloseTo(110, 3);
  expect(RING_HALF_WIDTH_DEG).toBeLessThan(1);
  expect(RING_LANES).toBe(8);
  const sun = dawnDuskSunEcef();
  const incl = (RING_INCLINATION_DEG * Math.PI) / 180;
  const raan = (RING_RAAN_DEG * Math.PI) / 180;
  const hx = Math.sin(raan) * Math.sin(incl);
  const hy = -Math.cos(raan) * Math.sin(incl);
  const hz = Math.cos(incl);
  expect(hx * sun.x + hy * sun.y + hz * sun.z).toBeCloseTo(1, 6);
  const meridians = new Map<number, number[]>();
  for (const node of nodes) {
    const lon = ((node.lon % 360) + 360) % 360;
    const key = Math.round(lon / 2);
    const group = meridians.get(key);
    if (group) group.push(node.lat);
    else meridians.set(key, [node.lat]);
  }
  let stacks = 0;
  for (const group of meridians.values()) {
    if (group.length >= 200 && Math.max(...group) - Math.min(...group) > 12)
      stacks++;
  }
  expect(stacks).toBeGreaterThan(2);
});
function planeOffsetDeg(node: { lat: number; lon: number }) {
  const lat = (node.lat * Math.PI) / 180,
    lon = (node.lon * Math.PI) / 180,
    incl = (RING_INCLINATION_DEG * Math.PI) / 180,
    raan = (RING_RAAN_DEG * Math.PI) / 180;
  const ex = Math.cos(lat) * Math.cos(lon),
    ey = Math.cos(lat) * Math.sin(lon),
    ez = Math.sin(lat);
  const dot =
    ex * Math.sin(raan) * Math.sin(incl) +
    ey * -Math.cos(raan) * Math.sin(incl) +
    ez * Math.cos(incl);
  return (Math.asin(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}
function trackAngleDeg(node: { lat: number; lon: number }) {
  const lat = (node.lat * Math.PI) / 180,
    lon = (node.lon * Math.PI) / 180,
    incl = (RING_INCLINATION_DEG * Math.PI) / 180,
    raan = (RING_RAAN_DEG * Math.PI) / 180;
  const ex = Math.cos(lat) * Math.cos(lon),
    ey = Math.cos(lat) * Math.sin(lon),
    ez = Math.sin(lat);
  const hx = Math.sin(raan) * Math.sin(incl),
    hy = -Math.cos(raan) * Math.sin(incl),
    hz = Math.cos(incl);
  const dot = ex * hx + ey * hy + ez * hz;
  const px = ex - dot * hx,
    py = ey - dot * hy,
    pz = ez - dot * hz;
  const e1x = Math.cos(raan),
    e1y = Math.sin(raan);
  const e2x = -hz * e1y,
    e2y = hz * e1x,
    e2z = hx * e1y - hy * e1x;
  return (
    (Math.atan2(px * e2x + py * e2y + pz * e2z, px * e1x + py * e1y) * 180) /
    Math.PI
  );
}
test("the dawn-dusk shell stays narrow, poleward, and inside one altitude band", () => {
  const nodes = orbitalNodes(0);
  expect(nodes).toHaveLength(NODE_COUNT);
  expect(NODE_COUNT).toBe(8800);
  const lats = nodes.map((p) => p.lat);
  const alts = nodes.map((p) => p.altitudeKm);
  const offsets = nodes.map(planeOffsetDeg);
  const abs = offsets.map(Math.abs);
  expect(Math.max(...abs)).toBeGreaterThan(0.2);
  expect(Math.max(...abs)).toBeLessThanOrEqual(RING_HALF_WIDTH_DEG + 0.02);
  expect(Math.max(...lats)).toBeGreaterThan(78);
  expect(Math.max(...lats)).toBeLessThan(86);
  expect(Math.min(...lats)).toBeLessThan(-78);
  expect(Math.min(...lats)).toBeGreaterThan(-86);
  expect(Math.max(...alts) - Math.min(...alts)).toBeLessThan(14);
  expect(Math.min(...alts)).toBeGreaterThan(718);
  expect(Math.max(...alts)).toBeLessThan(732);
  expect(new Set(alts).size).toBe(NODE_COUNT);
  for (const p of nodes) {
    expect(p.band).toBe(0);
    expect(sunSyncInclination(p.altitudeKm)).toBeGreaterThan(97);
  }
  expect(
    new Set(nodes.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`)).size,
  ).toBe(NODE_COUNT);
});
test("the ring stays populated all the way around", () => {
  const nodes = orbitalNodes(ORBIT_EPOCH_MS);
  const angles = nodes.map(trackAngleDeg).sort((a, b) => a - b);
  let maxGap = angles[0] + 360 - angles[angles.length - 1];
  for (let i = 1; i < angles.length; i++)
    maxGap = Math.max(maxGap, angles[i] - angles[i - 1]);
  expect(maxGap).toBeLessThan(1);
});
test("ground and orbital routes leave the user independently", () => {
  const places = [
    ...PRESETS,
    { lat: 89.9, lon: 179.9 },
    { lat: -89.9, lon: -179.9 },
    { lat: 0, lon: 179.9 },
    { lat: 0, lon: -179.9 },
  ];
  for (const origin of places)
    for (const provider of PROVIDER_IDS)
      for (const at of [
        ORBIT_EPOCH_MS,
        ORBIT_EPOCH_MS + 3600000,
        ORBIT_EPOCH_MS + 86400000,
      ]) {
        const site = nearestSite(provider, origin),
          r = routeAt(origin, at, site);
        expect(r.ground.points[0]).toEqual(origin);
        expect(r.ground.points.at(-1)).toEqual(site);
        expect(r.gatewayRoute.points[0]).toEqual(origin);
        expect(r.gatewayRoute.points.at(-1)).toEqual(r.uplinkAnchor);
        const elevUser = elevationDeg(origin, r.nodes[r.ingress]);
        const elevAnchor = elevationDeg(r.uplinkAnchor, r.nodes[r.ingress]);
        expect(elevAnchor).toBeGreaterThanOrEqual(25);
        if (elevUser >= 25) expect(r.uplinkAnchor).toEqual(origin);
        else expect(r.uplinkAnchor).toEqual(r.gateway);
        expect(r.uplinkKm).toBeGreaterThan(400);
        expect(r.uplinkKm).toBeLessThan(3000);
        expect(r.hops[0]).toBe(r.ingress);
        expect(r.hops.at(-1)).toBe(r.computeRelay);
        expect(r.computeCraft).toBe(r.nodes[r.computeRelay]);
        expect(r.computeCraft.band).toBe(0);
        expect(r.carrierLinkKm).toBe(0);
        expect(r.laserKm).toBeGreaterThan(2500);
        expect(r.laserKm).toBeLessThan(12000);
        expect(r.hops.length).toBeGreaterThanOrEqual(3);
        expect(r.hops.length).toBeLessThanOrEqual(8);
        expect(new Set(r.hops).size).toBe(r.hops.length);
        for (let i = 1; i < r.hops.length; i++) {
          expect(
            laserClearsEarth(r.nodes[r.hops[i - 1]], r.nodes[r.hops[i]]),
          ).toBe(true);
          expect(
            opticalDistanceKm(r.nodes[r.hops[i - 1]], r.nodes[r.hops[i]]),
          ).toBeLessThanOrEqual(4000);
        }
        expect(r.rttMs).toBeGreaterThan(0);
        expect(
          compare(provider, origin, site, null, 256, 1.11, at).space.rttMs,
        ).toBe(r.rttMs);
        expect(
          compare(provider, origin, site, null, 256, 1.11, at).ground.rttMs,
        ).toBe(r.ground.rttMs);
      }
});
test("routing uses peering cities for long trips and avoids remote detours for local traffic", () => {
  const ny = DEFAULT_LOCATION,
    london = PRESETS[1];
  const transatlantic = groundRoute(ny, london);
  expect(transatlantic.stops.map((p) => p.name)).toEqual([
    "New York",
    "London",
  ]);
  expect(transatlantic.km).toBeGreaterThan(distanceKm(ny, london));
  const local = groundRoute(ny, nearestSite("gemini", ny));
  expect(local.stops.map((p) => p.name)).toEqual([
    "Local ISP",
    "Regional peering",
  ]);
  expect(local.km).toBeCloseTo(
    distanceKm(ny, nearestSite("gemini", ny)) * 1.15,
    5,
  );
  expect(groundRoute(ny, ny).rttMs).toBe(10);
});
test("surface interpolation crosses the date line and handles poles and antipodes", () => {
  expect(
    Math.abs(
      interpolateLocation({ lat: 0, lon: 179 }, { lat: 0, lon: -179 }, 0.5).lon,
    ),
  ).toBeCloseTo(180);
  for (const [a, b] of [
    [
      { lat: 90, lon: 0 },
      { lat: -90, lon: 0 },
    ],
    [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 180 },
    ],
  ]) {
    for (let i = 0; i <= 100; i++) {
      const p = interpolateLocation(a, b, i / 100);
      expect(Number.isFinite(p.lat) && Number.isFinite(p.lon)).toBe(true);
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
    }
    expect(distanceKm(interpolateLocation(a, b, 0), a)).toBeLessThan(0.001);
    expect(distanceKm(interpolateLocation(a, b, 1), b)).toBeLessThan(0.001);
  }
});
test("illustrative orbital motion is continuous and periodic", () => {
  const a = orbitalNodes(ORBIT_EPOCH_MS),
    b = orbitalNodes(ORBIT_EPOCH_MS + 16),
    c = orbitalNodes(ORBIT_EPOCH_MS + orbitalPeriodMs(a[0].altitudeKm));
  expect(distanceKm(a[0], b[0])).toBeGreaterThan(0);
  expect(distanceKm(a[0], b[0])).toBeLessThan(0.2);
  expect(c[0].lat).toBeCloseTo(a[0].lat, 6);
  expect(distanceKm(a[0], c[0])).toBeLessThan(0.001);
});
