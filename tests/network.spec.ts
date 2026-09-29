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
  COMPUTE_SLOTS,
  createRoutePlayback,
  RING_INCLINATION_DEG,
  RING_RAAN_DEG,
  INCLINATION_SPREAD_DEG,
  RAAN_SPREAD_DEG,
  SHELL_ALTITUDE_MIN_KM,
  SHELL_ALTITUDE_MAX_KM,
  dawnDuskSunEcef,
  sunSyncInclination,
} from "../lib/starcloud/network";

test("the reference plane stays dawn-dusk and the fleet is one thick ring", () => {
  const nodes = orbitalNodes(ORBIT_EPOCH_MS);
  expect(RING_INCLINATION_DEG).toBeCloseTo(sunSyncInclination(725), 6);
  expect(RING_INCLINATION_DEG).toBeGreaterThan(98);
  expect(RING_INCLINATION_DEG).toBeLessThan(99);
  expect(RING_RAAN_DEG).toBeCloseTo(110, 3);
  expect(INCLINATION_SPREAD_DEG).toBeGreaterThan(8);
  expect(INCLINATION_SPREAD_DEG).toBeLessThan(20);
  expect(RAAN_SPREAD_DEG).toBeGreaterThan(8);
  expect(RAAN_SPREAD_DEG).toBeLessThan(24);
  const sun = dawnDuskSunEcef();
  const incl = (RING_INCLINATION_DEG * Math.PI) / 180;
  const raan = (RING_RAAN_DEG * Math.PI) / 180;
  const hx = Math.sin(raan) * Math.sin(incl);
  const hy = -Math.cos(raan) * Math.sin(incl);
  const hz = Math.cos(incl);
  expect(hx * sun.x + hy * sun.y + hz * sun.z).toBeCloseTo(1, 6);
  const abs = nodes.map((node) => Math.abs(planeOffsetDeg(node)));
  expect(Math.max(...abs)).toBeGreaterThan(2);
  expect(Math.max(...abs)).toBeLessThan(16);
  expect(abs.filter((v) => v > 20).length).toBe(0);
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
test("the modeled fleet occupies one 600–850 km ring with thickness", () => {
  const nodes = orbitalNodes(0);
  expect(nodes).toHaveLength(NODE_COUNT);
  expect(NODE_COUNT).toBe(8800);
  const alts = nodes.map((p) => p.altitudeKm);
  const span = Math.max(...alts) - Math.min(...alts);
  expect(span).toBeGreaterThan(240);
  expect(span).toBeLessThan(260);
  expect(Math.min(...alts)).toBeGreaterThanOrEqual(SHELL_ALTITUDE_MIN_KM - 1);
  expect(Math.min(...alts)).toBeLessThan(SHELL_ALTITUDE_MIN_KM + 40);
  expect(Math.max(...alts)).toBeGreaterThan(SHELL_ALTITUDE_MAX_KM - 40);
  expect(Math.max(...alts)).toBeLessThanOrEqual(SHELL_ALTITUDE_MAX_KM + 1);
  for (const p of nodes) expect(p.band).toBe(0);
  expect(
    new Set(nodes.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`)).size,
  ).toBe(NODE_COUNT);
  const sample = nodes.filter((_, i) => i % 80 === 0);
  const nearest = sample.map((node) => {
    let best = Infinity;
    for (const other of nodes) {
      if (other === node) continue;
      const d = Math.hypot(
        distanceKm(node, other),
        node.altitudeKm - other.altitudeKm,
      );
      if (d < best) best = d;
    }
    return best;
  });
  nearest.sort((a, b) => a - b);
  expect(nearest[0]).toBeGreaterThan(1);
  expect(nearest[Math.floor(nearest.length / 2)]).toBeGreaterThan(3);
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
        expect(COMPUTE_SLOTS).toContain(r.computeRelay);
        expect(r.computeCraft.band).toBe(0);
        expect(r.carrierLinkKm).toBe(0);
        expect(r.laserKm).toBeGreaterThanOrEqual(0);
        expect(r.laserKm).toBeLessThan(25000);
        expect(r.hops.length).toBeGreaterThanOrEqual(1);
        expect(r.hops.length).toBeLessThanOrEqual(13);
        if (r.hops.length === 1) expect(r.laserKm).toBe(0);
        else expect(r.laserKm).toBeGreaterThan(0);
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
        expect(r.rttMs / 2).toBeCloseTo(
          r.gatewayRoute.km / 200 +
            r.uplinkKm / 299.792458 +
            r.laserKm / 299.792458 +
            (r.hops.length - 1) * 1.5 +
            4,
          8,
        );
        expect(
          compare(provider, origin, site, null, 256, 1.11, at).space.rttMs,
        ).toBe(r.rttMs);
        expect(
          compare(provider, origin, site, null, 256, 1.11, at).ground.rttMs,
        ).toBe(r.ground.rttMs);
      }
});
test("parallel playback keeps modeled completion order and waits for both API replies", () => {
  const route = routeAt(DEFAULT_LOCATION, ORBIT_EPOCH_MS, nearestSite("gemini", DEFAULT_LOCATION));
  const initial = createRoutePlayback(route);
  expect(initial.ground.outbound.startMs).toBe(initial.launchMs);
  expect(initial.space.outbound.startMs).toBe(initial.launchMs);
  expect(initial.space.feeder.startMs).toBe(initial.launchMs);
  expect(initial.space.laser.endMs).toBe(initial.space.outbound.endMs);
  expect(initial.ground.compute.startMs).toBe(initial.ground.outbound.endMs);
  expect(initial.space.compute.startMs).toBe(initial.space.outbound.endMs);
  expect(initial.ground.modeledTotalMs).toBeCloseTo(1200 + route.ground.rttMs);
  expect(initial.space.modeledTotalMs).toBeCloseTo(1200 + route.rttMs);
  expect(initial.firstFinished).toBe(
    route.ground.rttMs < route.rttMs
      ? "ground"
      : route.ground.rttMs > route.rttMs
        ? "space"
        : "tie",
  );
  const pending = createRoutePlayback(route, { elapsedMs: 9000 });
  expect(pending.ground.return.startMs).toBeGreaterThan(9000);
  expect(pending.space.return.startMs).toBeGreaterThan(9000);
  expect(pending.waitingForAnswer).toBe(true);
  const ready = createRoutePlayback(route, { elapsedMs: 9000, answerReadyAtMs: 9000 });
  expect(ready.ground.return.startMs).toBeGreaterThanOrEqual(9000);
  expect(ready.space.return.startMs).toBeGreaterThanOrEqual(9000);
  expect(ready.waitingForAnswer).toBe(false);
  expect(ready.totalMs).toBe(Math.max(ready.ground.finishedMs, ready.space.finishedMs));
  expect(createRoutePlayback(route, { elapsedMs: 12000, answerReadyAtMs: 9000 })).toEqual(ready);
  expect(Math.sign(ready.ground.finishedMs - ready.space.finishedMs)).toBe(
    Math.sign(route.ground.rttMs - route.rttMs),
  );
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
