// Computes every number, table and data series the paper uses.
//   node paper/scripts/analysis.mjs
// Writes paper/data/analysis.json and paper/.cache/share-grid.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, catalog, comparison, network as N } from "./model.mjs";

const started = performance.now();
const { SITES, SITE_SOURCES, PRESETS, PROVIDERS, PROVIDER_IDS, nearestSite } = catalog;
const R = N.EARTH_KM;
const C = N.C_KM_PER_MS;
const MU = 398600.4418;
const rad = Math.PI / 180;
const deg = 180 / Math.PI;
const P = N.ORBIT_PERIOD_MS;
const T0 = N.ORBIT_EPOCH_MS;
const TAU = Math.PI * 2;
const SMF28_GROUP_INDEX = 1.4682;
const ALTITUDES = [N.SHELL_ALTITUDE_MIN_KM, N.SHELL_ALTITUDE_KM, N.SHELL_ALTITUDE_MAX_KM];
const MASK_DEG = 25;

const round = (v, d = 4) => (Number.isFinite(v) ? Number(v.toFixed(d)) : v);
const quantile = (values, q) => {
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const stats = (values, d = 2) => ({
  min: round(Math.min(...values), d),
  p10: round(quantile(values, 0.1), d),
  median: round(quantile(values, 0.5), d),
  p90: round(quantile(values, 0.9), d),
  max: round(Math.max(...values), d),
});

// Orbit plane basis, from the same inclination and RAAN the app uses.
const inc = N.RING_INCLINATION_DEG * rad;
const raan = N.RING_RAAN_DEG * rad;
const e1 = [Math.cos(raan), Math.sin(raan), 0];
const e2 = [-Math.sin(raan) * Math.cos(inc), Math.cos(raan) * Math.cos(inc), Math.sin(inc)];
const normal = [Math.sin(raan) * Math.sin(inc), -Math.cos(raan) * Math.sin(inc), Math.cos(inc)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (p) => [
  Math.cos(p.lat * rad) * Math.cos(p.lon * rad),
  Math.cos(p.lat * rad) * Math.sin(p.lon * rad),
  Math.sin(p.lat * rad),
];
const planeCoords = (p) => {
  const q = unit(p);
  const beta = Math.asin(Math.max(-1, Math.min(1, dot(q, normal))));
  let phi = Math.atan2(dot(q, e2), dot(q, e1));
  if (phi < 0) phi += TAU;
  return { beta, phi };
};
const turnsAt = (at) => {
  let t = ((at - T0) % P) / P;
  if (t < 0) t += 1;
  return t;
};

// Continuous-ring geometry for one altitude.
const elevationAt = (centralRad, altitudeKm) => {
  const r = R + altitudeKm;
  return Math.atan2(r * Math.cos(centralRad) - R, r * Math.sin(centralRad)) * deg;
};
const horizonOffDeg = (h) => Math.acos(R / (R + h)) * deg;
const maskOffDeg = (h, e) => (Math.acos((R * Math.cos(e * rad)) / (R + h)) - e * rad) * deg;
const periodMin = (h) => N.orbitalPeriodMs(h) / 60000;
const speedKmS = (h) => Math.sqrt(MU / (R + h));

const orbit = ALTITUDES.map((h) => ({
  altitudeKm: h,
  inclinationDeg: round(N.sunSyncInclination(h), 3),
  periodMin: round(periodMin(h), 2),
  speedKmS: round(speedKmS(h), 3),
  clearChordMaxSeparationDeg: round(2 * horizonOffDeg(h), 2),
  clearChordMaxKm: round(2 * (R + h) * Math.sin(horizonOffDeg(h) * rad), 0),
  halfCircumferenceKm: round(Math.PI * (R + h), 0),
  horizonOffDeg: round(horizonOffDeg(h), 2),
  mask25OffDeg: round(maskOffDeg(h, MASK_DEG), 2),
  horizonSurfaceShare: round(Math.sin(horizonOffDeg(h) * rad), 4),
  mask25SurfaceShare: round(Math.sin(maskOffDeg(h, MASK_DEG) * rad), 4),
  bestElevationDeg: Object.fromEntries(
    [0, 10, 20, 30, 40].map((b) => [b, round(elevationAt(b * rad, h), 1)]),
  ),
}));
const horizon850 = horizonOffDeg(N.SHELL_ALTITUDE_MAX_KM);
const mask850 = maskOffDeg(N.SHELL_ALTITUDE_MAX_KM, MASK_DEG);

// The app's shell at the epoch, re-expressed as angles along the ring.
const epochNodes = N.orbitalNodes(T0);
const shellFromNodes = (nodes) => {
  const items = nodes.map((n) => ({
    slot: n.slot,
    phi: planeCoords(n).phi,
    r: R + n.altitudeKm,
  }));
  return makeShell(items);
};
function makeShell(items) {
  const sc2 = items.find((n) => n.slot === N.STARCLOUD2_SLOT);
  const sorted = items.filter((n) => n.slot !== N.STARCLOUD2_SLOT).sort((a, b) => a.phi - b.phi);
  return {
    sc2,
    phi: Float64Array.from(sorted, (n) => n.phi),
    r: Float64Array.from(sorted, (n) => n.r),
    slot: Int32Array.from(sorted, (n) => n.slot),
    rMax: Math.max(...sorted.map((n) => n.r)),
    rMin: Math.min(...sorted.map((n) => n.r)),
    count: items.length,
  };
}

// Mirror of orbitalNodes with a configurable along-track count, used only for
// the density sensitivity. Checked against the app below at 110 bins.
function shellHash(i, salt) {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
function mirroredShell(alongCount) {
  const radialCount = N.SHELL_RADIAL_COUNT;
  const count = radialCount * N.SHELL_ACROSS_COUNT * alongCount;
  const span = N.SHELL_ALTITUDE_MAX_KM - N.SHELL_ALTITUDE_MIN_KM;
  const items = [];
  for (let i = 0; i < count; i++) {
    const along = i % alongCount;
    const rest = Math.floor(i / alongCount);
    const radial = rest % radialCount;
    const place = (bin, n, salt) => (bin + 0.22 + shellHash(i, salt) * 0.56) / n;
    const altT = i === 0 ? 0.5 : place(radial, radialCount, 1);
    const alongT = i === 0 ? 0.5 : place(along, alongCount, 3);
    items.push({
      slot: i,
      phi: (alongT * TAU) % TAU,
      r: R + N.SHELL_ALTITUDE_MIN_KM + altT * span,
    });
  }
  return makeShell(items);
}

// Highest-elevation craft for a user at (beta, phi) on a rigidly turning shell.
// The window walks outward along the ring and stops once no craft further out
// could beat the best elevation found, so the result equals a full scan.
function lowerBound(arr, x) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function bestCraft(shell, beta, phiUser, rule = "elevation") {
  const n = shell.phi.length;
  const cb = Math.cos(beta);
  const start = lowerBound(shell.phi, phiUser) % n;
  let best = -1;
  let bestScore = -Infinity;
  const score = (k) => {
    const d = shell.phi[k] - phiUser;
    const cosT = cb * Math.cos(d);
    const r = shell.r[k];
    if (rule === "elevation") {
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
      return Math.atan2(r * cosT - R, r * sinT);
    }
    return -Math.sqrt(R * R + r * r - 2 * R * r * cosT);
  };
  const bound = (d) => {
    const cosT = cb * Math.cos(Math.min(Math.PI, Math.abs(d)));
    if (rule === "elevation") {
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
      return Math.atan2(shell.rMax * cosT - R, shell.rMax * sinT);
    }
    const r = shell.rMin;
    return -Math.sqrt(R * R + r * r - 2 * R * r * cosT);
  };
  const consider = (k) => {
    const s = score(k);
    if (s > bestScore + 1e-15 || (Math.abs(s - bestScore) <= 1e-15 && shell.slot[k] < shell.slot[best])) {
      bestScore = s;
      best = k;
    }
  };
  for (const dir of [1, -1]) {
    for (let step = 0; step < n; step++) {
      const k = (((start + (dir === 1 ? step : -step - 1)) % n) + n) % n;
      let d = Math.abs(shell.phi[k] - phiUser);
      if (d > Math.PI) d = TAU - d;
      if (step > 0 && bound(d) < bestScore - 1e-12) break;
      consider(k);
    }
  }
  return best;
}
function laserKm(ra, rb, sep) {
  const dp = ra * rb * Math.cos(sep);
  const d2 = ra * ra + rb * rb - 2 * dp;
  const t = Math.max(0, Math.min(1, (ra * ra - dp) / (d2 || 1)));
  const clear = ra * ra + 2 * t * (dp - ra * ra) + t * t * d2 > R * R;
  return clear
    ? { km: Math.sqrt(Math.max(0, d2)), chord: true }
    : { km: sep * ((ra + rb) / 2), chord: false };
}
function fastRoute(shell, beta, phiUserAbs, turns, rule = "elevation") {
  let phiUser = (phiUserAbs - turns * TAU) % TAU;
  if (phiUser < 0) phiUser += TAU;
  const k = bestCraft(shell, beta, phiUser, rule);
  const r = shell.r[k];
  const cosT = Math.cos(beta) * Math.cos(shell.phi[k] - phiUser);
  const uplinkKm = Math.sqrt(Math.max(0, R * R + r * r - 2 * R * r * cosT));
  let sep = Math.abs(shell.phi[k] - shell.sc2.phi);
  if (sep > Math.PI) sep = TAU - sep;
  const laser = laserKm(r, shell.sc2.r, sep);
  return {
    slot: shell.slot[k],
    uplinkKm,
    laserKm: laser.km,
    chord: laser.chord,
    rttMs: (2 * (uplinkKm + laser.km)) / C,
  };
}

const appShell = shellFromNodes(epochNodes);
const mirror110 = mirroredShell(N.SHELL_ALONG_COUNT);
let mirrorMaxDiff = 0;
for (let k = 0; k < appShell.phi.length; k++) {
  const dphi = Math.abs(appShell.phi[k] - mirror110.phi[k]);
  mirrorMaxDiff = Math.max(mirrorMaxDiff, Math.min(dphi, TAU - dphi), Math.abs(appShell.r[k] - mirror110.r[k]) / R);
  if (appShell.slot[k] !== mirror110.slot[k]) mirrorMaxDiff = Infinity;
}
if (!(mirrorMaxDiff < 1e-9)) throw new Error(`Mirrored shell differs from the app: ${mirrorMaxDiff}`);

// Check the fast search against the app's routeAt on random users and times.
let seed = 12345;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
let fastMaxRttDiff = 0;
let fastSlotMismatch = 0;
const VALIDATION_SAMPLES = 600;
for (let s = 0; s < VALIDATION_SAMPLES; s++) {
  const user = { lat: Math.asin(2 * rand() - 1) * deg, lon: 360 * rand() - 180 };
  const at = T0 + rand() * P;
  const app = N.routeAt(user, at);
  const { beta, phi } = planeCoords(user);
  const fast = fastRoute(appShell, beta, phi, turnsAt(at));
  fastMaxRttDiff = Math.max(fastMaxRttDiff, Math.abs(app.rttMs - fast.rttMs));
  if (app.ingress !== fast.slot) fastSlotMismatch++;
}
if (fastMaxRttDiff > 1e-6) throw new Error(`Fast route differs from routeAt by ${fastMaxRttDiff} ms`);

// Shell statistics at the epoch.
const altitudes = epochNodes.map((n) => n.altitudeKm);
const phis = [...appShell.phi, appShell.sc2.phi].sort((a, b) => a - b);
const gaps = phis.map((p, i) => (i === 0 ? p + TAU - phis[phis.length - 1] : p - phis[i - 1]));
const refRadius = R + N.SHELL_ALTITUDE_KM;
const sc2At = (at) => N.orbitalNodes(at)[N.STARCLOUD2_SLOT];
const sc2Track = Array.from({ length: 12 }, (_, k) => {
  const at = T0 + (k * P) / 12;
  const s = sc2At(at);
  return { minutes: round((k * P) / 12 / 60000, 2), lat: round(s.lat, 2), lon: round(s.lon, 2) };
});
const sc2Start = sc2At(T0);
const sc2Next = sc2At(T0 + 60000);
const sunLatDeg = Math.asin(Math.cos(inc)) * deg;

// Ground catalog and nearest sites.
const sites = Object.fromEntries(
  PROVIDER_IDS.map((p) => [p, SITES[p].map((s) => ({ name: s.name, lat: s.lat, lon: s.lon, kind: s.kind }))]),
);
const providers = Object.fromEntries(
  PROVIDER_IDS.map((p) => [
    p,
    {
      name: PROVIDERS[p].name,
      company: PROVIDERS[p].company,
      model: PROVIDERS[p].model,
      input: PROVIDERS[p].input,
      output: PROVIDERS[p].output,
      cached: PROVIDERS[p].cached,
      pricingSource: PROVIDERS[p].source,
      siteSource: SITE_SOURCES[p],
      siteKind: SITES[p][0].kind,
      siteCount: SITES[p].length,
    },
  ]),
);
const groundFor = (origin, provider) => {
  const site = nearestSite(provider, origin);
  const g = N.groundRoute(origin, site);
  return {
    site: site.name,
    km: round(g.km, 1),
    rttMs: round(g.rttMs, 3),
    rttSmf28Ms: round((2 * g.km * SMF28_GROUP_INDEX) / C, 3),
    rttVacuumMs: round((2 * g.km) / C, 3),
  };
};

// Six preset cities over one orbit, using the app's routeAt directly.
const SAMPLE_MS = 10000;
const sampleTimes = [];
for (let t = 0; t < P; t += SAMPLE_MS) sampleTimes.push(T0 + t);
const cities = PRESETS.map((city) => {
  const { beta, phi } = planeCoords(city);
  const ground = Object.fromEntries(PROVIDER_IDS.map((p) => [p, groundFor(city, p)]));
  const rtt = [];
  const uplink = [];
  const laser = [];
  const elev = [];
  let chord = 0;
  let rulePenaltyKm = [];
  let rulePenaltyMs = [];
  for (const at of sampleTimes) {
    const route = N.routeAt(city, at);
    rtt.push(route.rttMs);
    uplink.push(route.uplinkKm);
    laser.push(route.laserKm);
    elev.push(N.elevationDeg(city, route.relay));
    if (N.laserClearsEarth(route.relay, route.computeCraft)) chord++;
    const near = fastRoute(appShell, beta, phi, turnsAt(at), "range");
    rulePenaltyKm.push(route.uplinkKm - near.uplinkKm);
    rulePenaltyMs.push(route.rttMs - near.rttMs);
  }
  const share = Object.fromEntries(
    PROVIDER_IDS.map((p) => [p, round(rtt.filter((v) => v < ground[p].rttMs).length / rtt.length, 4)]),
  );
  return {
    name: city.name,
    lat: city.lat,
    lon: city.lon,
    offPlaneDeg: round(beta * deg, 2),
    bestElevation850Deg: round(elevationAt(Math.abs(beta), N.SHELL_ALTITUDE_MAX_KM), 2),
    ingressElevationMedianDeg: round(quantile(elev, 0.5), 2),
    uplinkMedianKm: round(quantile(uplink, 0.5), 1),
    laserMedianKm: round(quantile(laser, 0.5), 0),
    chordShare: round(chord / rtt.length, 4),
    rttMs: stats(rtt),
    ground,
    share,
    rule: {
      uplinkPenaltyMedianKm: round(quantile(rulePenaltyKm, 0.5), 1),
      rttPenaltyMedianMs: round(quantile(rulePenaltyMs, 0.5), 3),
      rttPenaltyMinMs: round(Math.min(...rulePenaltyMs), 3),
      rttPenaltyMaxMs: round(Math.max(...rulePenaltyMs), 3),
    },
    series: rtt.map((v) => round(v, 2)),
  };
});

// Density sensitivity: the same drawing rule at a tenth and ten times the count.
const density = [11, N.SHELL_ALONG_COUNT, 1100].map((along) => {
  const shell = along === N.SHELL_ALONG_COUNT ? appShell : mirroredShell(along);
  return {
    count: shell.count,
    medianRttMs: Object.fromEntries(
      PRESETS.map((city) => {
        const { beta, phi } = planeCoords(city);
        const values = sampleTimes.map((at) => fastRoute(shell, beta, phi, turnsAt(at)).rttMs);
        return [city.name, round(quantile(values, 0.5), 2)];
      }),
    ),
  };
});

// Worked example: New York at the epoch, Google's nearest site.
const NY = PRESETS[0];
const nySite = nearestSite("gemini", NY);
const nyRoute = N.routeAt(NY, T0, nySite);
const nyIngress = nyRoute.nodes[nyRoute.ingress];
const nyElevations = epochNodes.map((n) => N.elevationDeg(NY, n));
const ANSWER_READY_MS = 2400;
const playback = N.createRoutePlayback(nyRoute, { answerReadyAtMs: ANSWER_READY_MS });
const win = (w) => ({ start: round(w.startMs, 1), end: round(w.endMs, 1) });
const sepDeg = N.shellArcKm(nyIngress, nyRoute.computeCraft) / ((nyIngress.altitudeKm + nyRoute.computeCraft.altitudeKm) / 2 + R) * deg;
const worked = {
  city: NY.name,
  provider: "gemini",
  epochIso: new Date(T0).toISOString(),
  ingress: {
    slot: nyRoute.ingress,
    lat: round(nyIngress.lat, 3),
    lon: round(nyIngress.lon, 3),
    altitudeKm: round(nyIngress.altitudeKm, 1),
    elevationDeg: round(N.elevationDeg(NY, nyIngress), 2),
  },
  starcloud2: { lat: round(sc2Start.lat, 3), lon: round(sc2Start.lon, 3), altitudeKm: sc2Start.altitudeKm },
  uplinkKm: round(nyRoute.uplinkKm, 1),
  laserKm: round(nyRoute.laserKm, 1),
  laserChord: N.laserClearsEarth(nyIngress, nyRoute.computeCraft),
  separationDeg: round(sepDeg, 2),
  uplinkOneWayMs: round(nyRoute.uplinkKm / C, 3),
  laserOneWayMs: round(nyRoute.laserKm / C, 3),
  rttMs: round(nyRoute.rttMs, 3),
  ground: { site: nySite.name, km: round(nyRoute.ground.km, 1), rttMs: round(nyRoute.ground.rttMs, 3), oneWayMs: round(nyRoute.ground.rttMs / 2, 3) },
  visible: {
    horizon: nyElevations.filter((e) => e > 0).length,
    mask25: nyElevations.filter((e) => e > MASK_DEG).length,
  },
  playback: {
    answerReadyMs: ANSWER_READY_MS,
    launchMs: playback.launchMs,
    holdMs: round(playback.ground.compute.endMs - playback.ground.compute.startMs, 1),
    ground: { outbound: win(playback.ground.outbound), compute: win(playback.ground.compute), return: win(playback.ground.return) },
    space: {
      uplink: win(playback.space.uplink),
      laser: win(playback.space.laser),
      outbound: win(playback.space.outbound),
      compute: win(playback.space.compute),
      return: win(playback.space.return),
    },
    totalMs: round(playback.totalMs, 1),
    firstFinished: playback.firstFinished,
  },
};

// Energy, water and cost from the app's compare(), for one 500-token exchange
// per path (200 prompt + 300 completion tokens) and per billion tokens.
const answer = (tokens, prompt) => ({
  text: "x",
  promptTokens: prompt,
  completionTokens: tokens - prompt,
  totalTokens: tokens,
  cachedTokens: 0,
  usageEstimated: false,
  latencyMs: 0,
});
const metricFor = (provider, tokens, prompt) => {
  const site = nearestSite(provider, NY);
  const body = { provider, model: PROVIDERS[provider].model, ground: answer(tokens, prompt), space: answer(tokens, prompt), latencyMs: 0, completedAt: "" };
  const c = comparison.compare(provider, NY, site, body, 256, 1.11, T0);
  const pick = (s) => ({ energyWh: s.energyWh, waterMl: s.waterMl, powerCostUsd: s.powerCostUsd, pue: s.pue, apiCostUsd: s.costUsd });
  return { ground: pick(c.ground), space: pick(c.space) };
};
const per500 = Object.fromEntries(PROVIDER_IDS.map((p) => [p, metricFor(p, 500, 200)]));
const perBillion = Object.fromEntries(
  ["gemini", "openai"].map((p) => {
    const m = metricFor(p, 1e9, 4e8);
    return [p, { groundKWh: m.ground.energyWh / 1000, groundWaterL: m.ground.waterMl / 1000, groundCostUsd: m.ground.powerCostUsd, spaceKWh: m.space.energyWh / 1000, spaceWaterL: m.space.waterMl / 1000, spaceCostUsd: m.space.powerCostUsd }];
  }),
);
const metrics = {
  joulesPerToken: 1.11,
  jouleRange: [0.1, 5],
  pue: { google: 1.09, other: 1.1, orbit: 1.04 },
  waterLPerKWh: { low: 0.2, mid: 1.1, high: 2.0, orbit: 0 },
  priceUsdPerKWh: { ground: 0.045, orbit: 0.002 },
  example: { tokens: 500, prompt: 200, completion: 300 },
  per500: Object.fromEntries(
    Object.entries(per500).map(([p, m]) => [
      p,
      {
        ground: { energyWh: round(m.ground.energyWh, 5), waterMl: round(m.ground.waterMl, 5), powerCostUsd: m.ground.powerCostUsd, pue: m.ground.pue, apiCostUsd: round(m.ground.apiCostUsd, 6) },
        space: { energyWh: round(m.space.energyWh, 5), waterMl: round(m.space.waterMl, 5), powerCostUsd: m.space.powerCostUsd, pue: m.space.pue, apiCostUsd: round(m.space.apiCostUsd, 6) },
      },
    ]),
  ),
  perBillion: Object.fromEntries(
    Object.entries(perBillion).map(([p, m]) => [p, Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round(v, 2)]))]),
  ),
  itKWhPerBillion: round((1e9 * 1.11) / 3600 / 1000, 2),
  energySavingVsGoogle: round(1 - 1.04 / 1.09, 4),
  energySavingVsOther: round(1 - 1.04 / 1.1, 4),
  costRatioVsGoogle: round((0.045 * 1.09) / (0.002 * 1.04), 2),
  googleWaterCheckMlPerWh: round(0.26 / 0.24, 3),
  modelWaterPerItKWh: round(1.1 * 1.09, 3),
};

// Global grid: share of one orbit in which the orbital round trip is shorter.
const GRID_STEP = 1;
const GRID_SAMPLES = 120;
const gridTurns = Array.from({ length: GRID_SAMPLES }, (_, k) => k / GRID_SAMPLES);
const rows = 180 / GRID_STEP;
const cols = 360 / GRID_STEP;
const counts = Object.fromEntries(PROVIDER_IDS.map((p) => [p, new Uint8Array(rows * cols)]));
const inSight = new Uint8Array(rows * cols);
const inMask = new Uint8Array(rows * cols);
const area = new Float64Array(rows * cols);
for (let row = 0; row < rows; row++) {
  const lat0 = -90 + row * GRID_STEP;
  const lat = lat0 + GRID_STEP / 2;
  const band = (Math.sin((lat0 + GRID_STEP) * rad) - Math.sin(lat0 * rad)) / 2 / cols;
  for (let col = 0; col < cols; col++) {
    const lon = -180 + col * GRID_STEP + GRID_STEP / 2;
    const i = row * cols + col;
    const user = { lat, lon };
    const { beta, phi } = planeCoords(user);
    area[i] = band;
    inSight[i] = Math.abs(beta * deg) <= horizon850 ? 1 : 0;
    inMask[i] = Math.abs(beta * deg) <= mask850 ? 1 : 0;
    const groundRtt = PROVIDER_IDS.map((p) => N.groundRoute(user, nearestSite(p, user)).rttMs);
    for (const turns of gridTurns) {
      const rtt = fastRoute(appShell, beta, phi, turns).rttMs;
      PROVIDER_IDS.forEach((p, j) => {
        if (rtt < groundRtt[j]) counts[p][i]++;
      });
    }
  }
}
const sum = (f) => {
  let s = 0;
  for (let i = 0; i < area.length; i++) s += f(i);
  return s;
};
const inSightArea = sum((i) => area[i] * inSight[i]);
const inMaskArea = sum((i) => area[i] * inMask[i]);
const grid = {
  stepDeg: GRID_STEP,
  samplesPerOrbit: GRID_SAMPLES,
  inSightArea: round(inSightArea, 4),
  lineOfSightOffDeg: round(horizon850, 2),
  summary: Object.fromEntries(
    PROVIDER_IDS.map((p) => {
      const share = (i) => counts[p][i] / GRID_SAMPLES;
      const overall = sum((i) => area[i] * share(i));
      const sight = sum((i) => area[i] * share(i) * inSight[i]);
      return [
        p,
        {
          overall: round(overall, 4),
          inSight: round(sight / inSightArea, 4),
          inMask: round(sum((i) => area[i] * share(i) * inMask[i]) / inMaskArea, 4),
          outOfSightAsZero: round(sight, 4),
          anyWinArea: round(sum((i) => (share(i) > 0 ? area[i] : 0)), 4),
          majorityArea: round(sum((i) => (share(i) > 0.5 ? area[i] : 0)), 4),
        },
      ];
    }),
  ),
};
mkdirSync(join(ROOT, "paper/.cache"), { recursive: true });
writeFileSync(
  join(ROOT, "paper/.cache/share-grid.json"),
  JSON.stringify({
    stepDeg: GRID_STEP,
    samples: GRID_SAMPLES,
    rows,
    cols,
    counts: Object.fromEntries(PROVIDER_IDS.map((p) => [p, Array.from(counts[p])])),
  }),
);

const result = {
  generatedBy: "paper/scripts/analysis.mjs",
  model: "lib/starcloud/{catalog,network,comparison}.ts",
  constants: {
    earthKm: R,
    cKmPerMs: C,
    vacuumOverFiber: N.VACUUM_OVER_FIBER,
    fiberKmPerMs: round(N.FIBER_KM_PER_MS, 3),
    shellAltitudeKm: N.SHELL_ALTITUDE_KM,
    shellAltitudeMinKm: N.SHELL_ALTITUDE_MIN_KM,
    shellAltitudeMaxKm: N.SHELL_ALTITUDE_MAX_KM,
    radialCount: N.SHELL_RADIAL_COUNT,
    acrossCount: N.SHELL_ACROSS_COUNT,
    alongCount: N.SHELL_ALONG_COUNT,
    nodeCount: N.NODE_COUNT,
    acrossHalfAngleDeg: round(N.SHELL_ACROSS_RAD * deg, 2),
    inclinationDeg: round(N.RING_INCLINATION_DEG, 3),
    raanDeg: round(N.RING_RAAN_DEG, 3),
    subsolarLonDeg: N.DAWN_DUSK_SUBSOLAR_LON_DEG,
    sunLatDeg: round(sunLatDeg, 2),
    periodMs: round(P, 1),
    periodMin: round(P / 60000, 2),
    epochIso: new Date(T0).toISOString(),
    smf28GroupIndex: SMF28_GROUP_INDEX,
    smf28KmPerMs: round(C / SMF28_GROUP_INDEX, 2),
    fiberUsPerKm: round(1000 / N.FIBER_KM_PER_MS, 4),
    vacuumUsPerKm: round(1000 / C, 4),
    smf28UsPerKm: round((1000 * SMF28_GROUP_INDEX) / C, 4),
    playback: { launchMs: 700, msPerPropagationMs: 48, computeProxyMs: 1200, releaseMarginMs: 100 },
  },
  orbit,
  shell: {
    realizedAltitudeMinKm: round(Math.min(...altitudes), 1),
    realizedAltitudeMaxKm: round(Math.max(...altitudes), 1),
    alongBinDeg: round(360 / N.SHELL_ALONG_COUNT, 4),
    radialLayerKm: (N.SHELL_ALTITUDE_MAX_KM - N.SHELL_ALTITUDE_MIN_KM) / N.SHELL_RADIAL_COUNT,
    gaps: {
      medianDeg: round(quantile(gaps, 0.5) * deg, 4),
      medianKm: round(quantile(gaps, 0.5) * refRadius, 2),
      meanDeg: round((360 / gaps.length), 4),
      maxDeg: round(Math.max(...gaps) * deg, 3),
      maxKm: round(Math.max(...gaps) * refRadius, 0),
    },
    starcloud2: {
      slot: N.STARCLOUD2_SLOT,
      lat: round(sc2Start.lat, 2),
      lon: round(sc2Start.lon, 2),
      altitudeKm: sc2Start.altitudeKm,
      heading: sc2Next.lat < sc2Start.lat ? "south" : "north",
    },
    sc2Track,
  },
  sites,
  providers,
  sampling: { stepMs: SAMPLE_MS, samples: sampleTimes.length },
  cities,
  density,
  worked,
  metrics,
  grid,
  validation: {
    mirroredShellMaxDiff: mirrorMaxDiff,
    fastRouteSamples: VALIDATION_SAMPLES,
    fastRouteMaxRttDiffMs: fastMaxRttDiff,
    fastRouteSlotMismatches: fastSlotMismatch,
  },
  runtimeSeconds: round((performance.now() - started) / 1000, 1),
};
mkdirSync(join(ROOT, "paper/data"), { recursive: true });
writeFileSync(join(ROOT, "paper/data/analysis.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`analysis.json written in ${result.runtimeSeconds} s`);
