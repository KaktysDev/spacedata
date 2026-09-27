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
  sunSyncInclination,
} from "../lib/starcloud/network";

test("satellites occupy every longitude bin instead of one meridian", () => {
  const nodes = orbitalNodes(ORBIT_EPOCH_MS);
  const bins = Array.from({ length: 12 }, () => 0);
  for (const node of nodes) {
    const lon = ((node.lon % 360) + 360) % 360;
    bins[Math.min(11, Math.floor(lon / 30))]++;
  }
  expect(bins.filter((count) => count > 0)).toHaveLength(12);
  // A steep ring spends a little more time in some longitude bins than a
  // uniform shell. One meridian would put nearly every satellite in one bin.
  expect(Math.max(...bins)).toBeLessThan(NODE_COUNT * 0.36);
  expect(Math.min(...bins)).toBeGreaterThan(100);
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
test("the access ring keeps a ragged width, Canada crest, and meridian stacks", () => {
  const nodes = orbitalNodes(0);
  expect(nodes).toHaveLength(NODE_COUNT);
  expect(NODE_COUNT).toBe(8800);
  expect(RING_INCLINATION_DEG).toBe(55);
  expect(RING_HALF_WIDTH_DEG).toBe(10);
  expect(RING_RAAN_DEG).toBe(170);
  expect(RING_LANES).toBe(40);
  const lats = nodes.map((p) => p.lat);
  const alts = nodes.map((p) => p.altitudeKm);
  const offsets = nodes.map(planeOffsetDeg);
  const abs = offsets.map(Math.abs);
  // Nominal half-width is 10°. Breathing and ragged placement pass that edge
  // without opening a second shell.
  expect(Math.max(...abs)).toBeGreaterThan(RING_HALF_WIDTH_DEG + 0.4);
  expect(Math.max(...abs)).toBeLessThan(14.5);
  expect(Math.max(...lats)).toBeGreaterThan(62);
  expect(Math.max(...lats)).toBeLessThan(72);
  // The opposite crest can be the narrow part of the breath, so it does not
  // have to match the wide crest.
  expect(Math.min(...lats)).toBeLessThan(-58);
  expect(Math.min(...lats)).toBeGreaterThan(-72);
  const crest = nodes.filter((n) => n.lat > 60);
  expect(crest.length).toBeGreaterThan(40);
  expect(crest.every((n) => n.lon > -145 && n.lon < -55)).toBe(true);
  const sectorMax = Array.from({ length: 8 }, () => 0);
  const sectorMin = Array.from({ length: 8 }, () => 90);
  nodes.forEach((node, i) => {
    let angle = trackAngleDeg(node);
    if (angle < 0) angle += 360;
    const sector = Math.min(7, Math.floor(angle / 45));
    const off = Math.abs(offsets[i]);
    sectorMax[sector] = Math.max(sectorMax[sector], off);
    sectorMin[sector] = Math.min(sectorMin[sector], off);
  });
  for (let sector = 0; sector < 8; sector++) {
    expect(sectorMax[sector]).toBeGreaterThan(6);
    expect(sectorMin[sector]).toBeLessThan(2);
  }
  expect(Math.max(...sectorMax) - Math.min(...sectorMax)).toBeGreaterThan(1.5);
  const columns = new Map<number, number[]>();
  nodes.forEach((node, i) => {
    const key = Math.round(trackAngleDeg(node) / 0.12);
    const group = columns.get(key);
    if (group) group.push(offsets[i]);
    else columns.set(key, [offsets[i]]);
  });
  let stacks = 0;
  for (const group of columns.values()) {
    if (group.length < 8) continue;
    if (Math.max(...group) - Math.min(...group) > 8) stacks++;
  }
  expect(stacks).toBeGreaterThan(15);
  const north = nodes.filter(
    (n) => n.lat > 48 && n.lon > -140 && n.lon < -60,
  );
  const meridians = new Map<number, number[]>();
  for (const node of north) {
    const key = Math.round(node.lon / 0.4);
    const group = meridians.get(key);
    if (group) group.push(node.lat);
    else meridians.set(key, [node.lat]);
  }
  let vertical = 0;
  for (const group of meridians.values()) {
    if (group.length >= 6 && Math.max(...group) - Math.min(...group) > 8)
      vertical++;
  }
  expect(vertical).toBeGreaterThan(2);
  expect(Math.max(...alts) - Math.min(...alts)).toBeLessThan(20);
  expect(Math.min(...alts)).toBeGreaterThan(710);
  expect(Math.max(...alts)).toBeLessThan(740);
  expect(new Set(nodes.map((p) => p.altitudeKm)).size).toBe(NODE_COUNT);
  for (const p of nodes)
    expect(sunSyncInclination(p.altitudeKm)).toBeGreaterThan(97);
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
  // A two-clump shell would leave a multi-degree empty arc.
  expect(maxGap).toBeLessThan(2.6);
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
        expect(r.computeCraft.band).toBe(-1);
        expect(laserClearsEarth(r.nodes[r.computeRelay], r.computeCraft)).toBe(
          true,
        );
        expect(
          opticalDistanceKm(r.nodes[r.computeRelay], r.computeCraft),
        ).toBeLessThanOrEqual(4000);
        expect(r.carrierLinkKm).toBeCloseTo(
          opticalDistanceKm(r.nodes[r.computeRelay], r.computeCraft),
        );
        expect(r.hops.length).toBeGreaterThanOrEqual(2);
        expect(r.hops.length).toBeLessThanOrEqual(12);
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
