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

/**
 * Energy: IT joules/token × PUE.
 * Water: terrestrial evaporative cooling ~0.2–2 L/kWh of facility energy
 * (mid ≈ 1.1 L/kWh); orbital radiative cooling ≈ 0 L.
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
  const spaceTokens = result?.space.totalTokens ?? Math.round(previewTokens * 0.78);
  if (![groundTokens, spaceTokens].every((n) => Number.isFinite(n) && n >= 0))
    throw new Error("Invalid workload");

  const km = distanceKm(origin, site),
    pueGround = provider === "gemini" ? 1.09 : 1.1,
    pueSpace = 1.04;
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
    // Mid water intensity 1.1 L/kWh → mL; orbital closed-loop radiators = 0.
    const waterMl = water ? energyWh * 1.1 : 0;
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
      0.045,
      network.ground.rttMs,
      result?.ground.latencyMs ?? 0,
      groundCost,
    ),
    space: scenario(
      spaceTokens,
      pueSpace,
      false,
      0.002,
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
