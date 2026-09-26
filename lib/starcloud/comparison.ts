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
  waterMl: [number, number];
  powerCostUsd: number;
  rttMs: number;
  pue: number;
};
export type Comparison = {
  ground: Scenario;
  space: Scenario;
  apiCostUsd: number | null;
  tokens: number;
  estimated: boolean;
  distanceKm: number;
};
export function compare(
  provider: ProviderId,
  origin: Location,
  site: Site,
  result: ChatSuccessBody | null,
  previewTokens = 256,
  joulesPerToken = 1.11,
  snapshotAt = 0,
): Comparison {
  const tokens = result?.answer.totalTokens ?? previewTokens;
  if (
    !Number.isFinite(tokens) ||
    tokens < 0 ||
    !Number.isFinite(joulesPerToken) ||
    joulesPerToken < 0.1 ||
    joulesPerToken > 10
  )
    throw new Error("Invalid workload");
  const km = distanceKm(origin, site),
    pue = provider === "gemini" ? 1.09 : 1.1;
  const network = routeAt(origin, snapshotAt, site);
  const itWh = (tokens * joulesPerToken) / 3600;
  const scenario = (
    p: number,
    water: boolean,
    rate: number,
    rttMs: number,
  ): Scenario => ({
    energyWh: itWh * p,
    energyRange: [itWh * p * 0.5, itWh * p * 2],
    waterMl: water ? [itWh * p * 0.5 * 0.2, itWh * p * 2 * 2] : [0, 0],
    powerCostUsd: ((itWh * p) / 1000) * rate,
    rttMs,
    pue: p,
  });
  const pricing = PROVIDERS[provider],
    a = result?.answer;
  return {
    ground: scenario(pue, true, 0.045, network.ground.rttMs),
    space: scenario(1.04, false, 0.002, network.rttMs),
    apiCostUsd: a
      ? ((a.promptTokens - a.cachedTokens) * pricing.input +
          a.cachedTokens * pricing.cached +
          (a.totalTokens - a.promptTokens) * pricing.output) /
        1e6
      : null,
    tokens,
    estimated: !a || a.usageEstimated,
    distanceKm: km,
  };
}
