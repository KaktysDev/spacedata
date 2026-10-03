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
  STARCLOUD2_SLOT,
  createRoutePlayback,
  RING_INCLINATION_DEG,
  RING_RAAN_DEG,
  INCLINATION_SPREAD_DEG,
  RAAN_SPREAD_DEG,
  SHELL_RADIAL_COUNT,
  SHELL_ACROSS_COUNT,
  SHELL_ALONG_COUNT,
  SHELL_ACROSS_RAD,
  SHELL_ALTITUDE_MIN_KM,
  SHELL_ALTITUDE_MAX_KM,
  FIBER_KM_PER_MS,
  C_KM_PER_MS,
  dawnDuskSunEcef,
  sunSyncInclination,
} from "../lib/starcloud/network";

test("the shell is one dawn-dusk plane with a drawn cross-track thickness", () => {
  const nodes = orbitalNodes(ORBIT_EPOCH_MS);
  expect(RING_INCLINATION_DEG).toBeCloseTo(sunSyncInclination(725), 6);
  expect(RING_INCLINATION_DEG).toBeGreaterThan(98);
  expect(RING_INCLINATION_DEG).toBeLessThan(99);
  expect(RING_RAAN_DEG).toBeCloseTo(110, 3);
  expect(INCLINATION_SPREAD_DEG).toBe(0);
  expect(RAAN_SPREAD_DEG).toBe(0);
  expect(NODE_COUNT).toBe(8800);
  expect(NODE_COUNT).toBe(
    SHELL_RADIAL_COUNT * SHELL_ACROSS_COUNT * SHELL_ALONG_COUNT,
  );
  const sun = dawnDuskSunEcef();
  const incl = (RING_INCLINATION_DEG * Math.PI) / 180;
  const raan = (RING_RAAN_DEG * Math.PI) / 180;
  const hx = Math.sin(raan) * Math.sin(incl);
  const hy = -Math.cos(raan) * Math.sin(incl);
  const hz = Math.cos(incl);
  expect(hx * sun.x + hy * sun.y + hz * sun.z).toBeCloseTo(1, 6);
  const starcloud2 = nodes[STARCLOUD2_SLOT];
  expect(starcloud2.altitudeKm).toBeCloseTo(725, 3);
  expect(starcloud2.across).toBe(0);
  const abs = nodes.map((node) => Math.abs(planeOffsetDeg(node)));
  expect(Math.max(...abs)).toBeLessThan(0.05);
  const across = nodes.map((node) => node.across);
  expect(Math.max(...across)).toBeGreaterThan(SHELL_ACROSS_RAD * 0.75);
  expect(Math.min(...across)).toBeLessThan(-SHELL_ACROSS_RAD * 0.75);
  expect(SHELL_ACROSS_RAD).toBeCloseTo(0.7, 5);
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
test("the modeled fleet fills a 600–850 km volume with spaced craft", () => {
  const nodes = orbitalNodes(0);
  expect(nodes).toHaveLength(NODE_COUNT);
  const alts = nodes.map((p) => p.altitudeKm);
  const span = Math.max(...alts) - Math.min(...alts);
  expect(span).toBeGreaterThan(230);
  expect(span).toBeLessThan(260);
  expect(Math.min(...alts)).toBeGreaterThanOrEqual(SHELL_ALTITUDE_MIN_KM - 1);
  expect(Math.min(...alts)).toBeLessThan(SHELL_ALTITUDE_MIN_KM + 30);
  expect(Math.max(...alts)).toBeGreaterThan(SHELL_ALTITUDE_MAX_KM - 30);
  expect(Math.max(...alts)).toBeLessThanOrEqual(SHELL_ALTITUDE_MAX_KM + 1);
  for (const p of nodes) expect(p.band).toBe(0);
  const angles = nodes.map(trackAngleDeg).sort((a, b) => a - b);
  let maxGap = angles[0] + 360 - angles[angles.length - 1];
  for (let i = 1; i < angles.length; i++)
    maxGap = Math.max(maxGap, angles[i] - angles[i - 1]);
  expect(maxGap).toBeLessThan(12);
  expect(maxGap).toBeGreaterThan(0.2);
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
        expect(r.ground.stops).toEqual([]);
        expect(r.gatewayRoute.km).toBe(0);
        expect(r.uplinkAnchor).toEqual(origin);
        expect(r.computeRelay).toBe(STARCLOUD2_SLOT);
        expect(r.computeCraft).toBe(r.nodes[STARCLOUD2_SLOT]);
        expect(r.computeCraft.band).toBe(0);
        expect(r.carrierLinkKm).toBe(0);
        if (!r.inView) {
          expect(r.hops).toEqual([]);
          expect(r.uplinkKm).toBe(0);
          expect(r.laserKm).toBe(0);
          expect(Number.isNaN(r.rttMs)).toBe(true);
        } else {
          expect(r.ingress).not.toBe(STARCLOUD2_SLOT);
          expect(elevationDeg(origin, r.nodes[r.ingress])).toBeGreaterThan(0);
          expect(laserClearsEarth(r.nodes[r.ingress], r.computeCraft)).toBe(true);
          expect(r.uplinkKm).toBeGreaterThan(599);
          expect(r.uplinkKm).toBeLessThan(20000);
          expect(r.hops).toEqual([r.ingress, r.computeRelay]);
          expect(r.laserKm).toBeGreaterThan(0);
          const ingressNode = r.nodes[r.ingress];
          expect(r.opticalPoints[0].lat).toBeCloseTo(ingressNode.lat, 4);
          expect(r.opticalPoints[0].lon).toBeCloseTo(ingressNode.lon, 4);
          expect(r.opticalPoints.at(-1)!.lat).toBeCloseTo(r.computeCraft.lat, 4);
          expect(r.opticalPoints.at(-1)!.lon).toBeCloseTo(r.computeCraft.lon, 4);
          expect(r.laserKm).toBeCloseTo(
            opticalDistanceKm(r.nodes[r.ingress], r.computeCraft),
            6,
          );
          expect(r.opticalPoints).toHaveLength(2);
          expect(r.rttMs).toBeGreaterThan(0);
          expect(r.rttMs / 2).toBeCloseTo(
            r.uplinkKm / C_KM_PER_MS + r.laserKm / C_KM_PER_MS,
            6,
          );
        }
        const modeled = compare(provider, origin, site, null, 256, 1.11, at);
        if (r.inView) expect(modeled.space.rttMs).toBe(r.rttMs);
        else expect(Number.isNaN(modeled.space.rttMs)).toBe(true);
        expect(
          compare(provider, origin, site, null, 256, 1.11, at).ground.rttMs,
        ).toBe(r.ground.rttMs);
      }
});
test("the RF satellite is the highest craft in view and changes with time", () => {
  const origin = DEFAULT_LOCATION;
  const first = routeAt(origin, ORBIT_EPOCH_MS);
  const later = routeAt(origin, ORBIT_EPOCH_MS + 5 * 60 * 1000);
  expect(first.inView).toBe(true);
  expect(later.inView).toBe(true);
  expect(first.computeRelay).toBe(STARCLOUD2_SLOT);
  expect(later.computeRelay).toBe(STARCLOUD2_SLOT);
  expect(first.ingress).not.toBe(later.ingress);
  expect(routeAt({ lat: 0, lon: 0 }, ORBIT_EPOCH_MS).inView).toBe(false);
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
test("ground routing is the surface path at the published fiber speed", () => {
  const ny = DEFAULT_LOCATION,
    london = PRESETS[1];
  const transatlantic = groundRoute(ny, london);
  expect(transatlantic.stops).toEqual([]);
  expect(transatlantic.points).toEqual([ny, london]);
  expect(transatlantic.km).toBeCloseTo(distanceKm(ny, london), 6);
  expect(transatlantic.rttMs).toBeCloseTo(
    (2 * distanceKm(ny, london)) / FIBER_KM_PER_MS,
    6,
  );
  const local = groundRoute(ny, nearestSite("gemini", ny));
  expect(local.stops).toEqual([]);
  expect(local.km).toBeCloseTo(distanceKm(ny, nearestSite("gemini", ny)), 6);
  expect(groundRoute(ny, ny).rttMs).toBe(0);
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
