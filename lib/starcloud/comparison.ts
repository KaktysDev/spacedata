import {
  distanceKm,
  PROVIDERS,
  type Location,
  type ProviderId,
  type Site,
} from "./catalog";
import type { ChatSuccessBody } from "./chat-types";
import { routeAt } from "./network";

export type Scenario = {
  energyWh: number;
  energyRange: [number, number];
  /** Midpoint water volume in mL (0 for orbital radiative cooling). */
  waterMl: number;
  powerCostUsd: number;
  rttMs: number;
  pue: number;
  tokens: number;
  /** Provider-call wall time. Not a measured ground or orbital route. */
  timeMs: number;
  costUsd: number | null;
};

export type Comparison = {
  ground: Scenario;
  space: Scenario;
  apiCostUsd: number | null;
  tokens: number;
  estimated: boolean;
  distanceKm: number;
};

function apiCost(
  provider: ProviderId,
  promptTokens: number,
  cachedTokens: number,
  totalTokens: number,
) {
  const pricing = PROVIDERS[provider];
  return (
    ((promptTokens - cachedTokens) * pricing.input +
      cachedTokens * pricing.cached +
      (totalTokens - promptTokens) * pricing.output) /
    1e6
  );
}

// Google's published 2025 fleet-wide average. The whitepaper says orbital PUE
// is comparable to a hyperscale facility and does not give a number, so orbit
// uses this same figure. Other providers are not given a different PUE: this
// model does not have their fleet measurement.
const PUE = 1.09;
// Whitepaper Table 1, terrestrial column: 0.5 L/kWh. The space column is
// "Not required." This is the paper's assumption, not a metered site.
const PAPER_GROUND_WATER_L_PER_KWH = 0.5;
// Whitepaper: projected orbital energy ~$0.002/kWh, and a US wholesale
// reference of $0.045/kWh. The US figure is applied to every ground site.
const PAPER_GROUND_USD_PER_KWH = 0.045;
const PAPER_ORBIT_USD_PER_KWH = 0.002;

/**
 * Energy: IT joules/token × PUE. Both paths use the same PUE.
 * Water: the paper's 0.5 L/kWh on the ground path; 0 L in orbit.
 */
export function compare(
  provider: ProviderId,
  origin: Location,
  site: Site,
  result: ChatSuccessBody | null,
  previewTokens = 256,
  joulesPerToken = 1.11,
  snapshotAt = 0,
): Comparison {
  if (
    !Number.isFinite(previewTokens) ||
    previewTokens < 0 ||
    !Number.isFinite(joulesPerToken) ||
    joulesPerToken < 0.1 ||
    joulesPerToken > 10
  )
    throw new Error("Invalid workload");

  const groundTokens = result?.ground.totalTokens ?? previewTokens;
  // No measured reply yet: both previews use the same token count. A lower
  // orbital count would be an invented efficiency.
  const spaceTokens = result?.space.totalTokens ?? previewTokens;
  if (![groundTokens, spaceTokens].every((n) => Number.isFinite(n) && n >= 0))
    throw new Error("Invalid workload");

  const km = distanceKm(origin, site),
    pueGround = PUE,
    pueSpace = PUE;
  const network = routeAt(origin, snapshotAt, site);

  const scenario = (
    tokens: number,
    pue: number,
    water: boolean,
    rate: number,
    rttMs: number,
    timeMs: number,
    costUsd: number | null,
  ): Scenario => {
    const itWh = (tokens * joulesPerToken) / 3600;
    const energyWh = itWh * pue;
    const waterMl = water ? energyWh * PAPER_GROUND_WATER_L_PER_KWH : 0;
    return {
      energyWh,
      energyRange: [itWh * pue * 0.5, itWh * pue * 2],
      waterMl,
      powerCostUsd: (energyWh / 1000) * rate,
      rttMs,
      pue,
      tokens,
      timeMs,
      costUsd,
    };
  };

  const groundCost = result
    ? apiCost(
        provider,
        result.ground.promptTokens,
        result.ground.cachedTokens,
        result.ground.totalTokens,
      )
    : null;
  const spaceCost = result
    ? apiCost(
        provider,
        result.space.promptTokens,
        result.space.cachedTokens,
        result.space.totalTokens,
      )
    : null;

  return {
    ground: scenario(
      groundTokens,
      pueGround,
      true,
      PAPER_GROUND_USD_PER_KWH,
      network.ground.rttMs,
      result?.ground.latencyMs ?? 0,
      groundCost,
    ),
    space: scenario(
      spaceTokens,
      pueSpace,
      false,
      PAPER_ORBIT_USD_PER_KWH,
      network.rttMs,
      result?.space.latencyMs ?? 0,
      spaceCost,
    ),
    apiCostUsd:
      groundCost !== null && spaceCost !== null
        ? groundCost + spaceCost
        : null,
    tokens: groundTokens + spaceTokens,
    estimated: !result || result.ground.usageEstimated || result.space.usageEstimated,
    distanceKm: km,
  };
}
