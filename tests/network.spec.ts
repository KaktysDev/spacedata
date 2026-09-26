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
  expect(Math.max(...bins)).toBeLessThan(NODE_COUNT * 0.2);
  expect(Math.min(...bins)).toBeGreaterThan(NODE_COUNT * 0.04);
});
test("loose orbital bands stay within the proposed altitude envelope and display cap", () => {
  const nodes = orbitalNodes(0);
  expect(nodes).toHaveLength(NODE_COUNT);
  expect(NODE_COUNT).toBeLessThanOrEqual(40000);
  expect(NODE_COUNT).toBe(8800);
  expect(Math.max(...nodes.map((p) => Math.abs(p.lat)))).toBeLessThan(16);
  expect(Math.max(...nodes.map((p) => p.lat))).toBeGreaterThan(2);
  expect(Math.min(...nodes.map((p) => p.altitudeKm))).toBeGreaterThanOrEqual(
    600,
  );
  expect(Math.max(...nodes.map((p) => p.altitudeKm))).toBeLessThanOrEqual(850);
  expect(new Set(nodes.map((p) => p.altitudeKm)).size).toBe(NODE_COUNT);
  for (const p of nodes) {
    expect(sunSyncInclination(p.altitudeKm)).toBeGreaterThan(97);
    expect(sunSyncInclination(p.altitudeKm)).toBeLessThan(100);
  }
  expect(
    new Set(nodes.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`)).size,
  ).toBe(NODE_COUNT);
});
test("provider entry precedes a visible land-gateway uplink at every tested location", () => {
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
        expect(r.gatewayRoute.points[0]).toEqual(site);
        expect(r.gatewayRoute.points.at(-1)).toEqual(r.gateway);
        expect(elevationDeg(r.gateway, r.nodes[r.ingress])).toBeGreaterThan(20);
        expect(r.uplinkKm).toBeGreaterThanOrEqual(549.999);
        expect(r.uplinkKm).toBeLessThan(1400);
        expect(r.hops[0]).toBe(r.ingress);
        expect(laserClearsEarth(r.relay, r.nodes[r.ingress])).toBe(true);
        expect(r.carrierLinkKm).toBeLessThanOrEqual(4000);
        expect(r.carrierLinkKm).toBeCloseTo(
          opticalDistanceKm(r.relay, r.nodes[r.ingress]),
          5,
        );
        expect(r.hops.at(-1)).toBe(r.compute);
        expect(new Set(r.hops).size).toBe(5);
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
