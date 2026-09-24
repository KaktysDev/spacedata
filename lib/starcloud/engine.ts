import {
  CAPACITY_FACTOR,
  ENERGY_USD_PER_KWH,
  INFERENCE_GROUND_BASELINE,
  JOULES_PER_TOKEN,
  LATENCY_STUB_MS,
  PUE,
  SIMULATION,
  TOKENS_PER_IT_KWH,
  WATER_LITERS_PER_KWH,
} from "@/lib/starcloud/constants";

export type VenueId = "space" | "ground";

/**
 * Integrated session for one venue.
 * Utilization is a shell duty cycle on the paper's 40 MW compute cluster.
 * It is not multiplied by capacity factor. Ground solar's ~24% is a power
 * plant figure; the terrestrial cluster is billed on the grid.
 */
export type EngineState = {
  itKwh: number;
  energyCostUsd: number;
  waterLiters: number;
  tokens: number;
  utilization: number;
};

export type VenueRates = {
  energyUsdPerKwh: number;
  /** Dollars charged per IT-kWh. Space is the paper's offer. Ground adds the 5% chiller share. */
  costUsdPerItKwh: number;
  waterLitersPerKwh: number;
  pue: number;
  capacityFactor: number;
};

export type VenueSnapshot = EngineState & {
  venue: VenueId;
  itKw: number;
  tokensPerSecond: number;
  latencyMs: number;
  rates: VenueRates;
};

export type ReplyCost = {
  tokens: number;
  itKwh: number;
  energyCostUsd: number;
  waterLiters: number;
  latencyMs: number;
  usageEstimated: boolean;
};

export function createEngineState(
  utilization: number = SIMULATION.idleUtilization,
): EngineState {
  return {
    itKwh: 0,
    energyCostUsd: 0,
    waterLiters: 0,
    tokens: 0,
    utilization: clamp01(utilization),
  };
}

export function venueRates(venue: VenueId): VenueRates {
  const space = venue === "space";
  const energyUsdPerKwh = space
    ? ENERGY_USD_PER_KWH.space
    : ENERGY_USD_PER_KWH.terrestrialUs;
  return {
    energyUsdPerKwh,
    costUsdPerItKwh: space
      ? energyUsdPerKwh
      : energyUsdPerKwh * (1 + PUE.terrestrialChillerShareOfEnergy),
    waterLitersPerKwh: space
      ? WATER_LITERS_PER_KWH.space
      : WATER_LITERS_PER_KWH.terrestrial,
    pue: space ? PUE.space : PUE.ground,
    capacityFactor: space
      ? CAPACITY_FACTOR.spaceDisplay
      : CAPACITY_FACTOR.terrestrialSolarUs,
  };
}

/**
 * Shell milliseconds. The paper gives the vacuum/fiber ratio, not a round trip.
 * Queueing scales both venues by the same utilization term.
 */
export function latencyMs(venue: VenueId, utilization: number): number {
  const base = venue === "space" ? LATENCY_STUB_MS.space : LATENCY_STUB_MS.ground;
  return base * (1 + SIMULATION.queueingAtFullUtilization * clamp01(utilization));
}

export function stepEngine(
  venue: VenueId,
  state: EngineState,
  dtSeconds: number,
): EngineState {
  if (dtSeconds <= 0) return state;
  const rates = venueRates(venue);
  const itKw = itKilowatts(state.utilization);
  const itKwhDelta = itKw * (dtSeconds / 3_600);
  return {
    utilization: state.utilization,
    itKwh: state.itKwh + itKwhDelta,
    energyCostUsd: state.energyCostUsd + itKwhDelta * rates.costUsdPerItKwh,
    waterLiters: state.waterLiters + itKwhDelta * rates.waterLitersPerKwh,
    tokens: state.tokens + itKwhDelta * TOKENS_PER_IT_KWH,
  };
}

export function withUtilization(
  state: EngineState,
  utilization: number,
): EngineState {
  return { ...state, utilization: clamp01(utilization) };
}

export function snapshot(venue: VenueId, state: EngineState): VenueSnapshot {
  const itKw = itKilowatts(state.utilization);
  const megawatts = itKw / 1_000;
  return {
    ...state,
    venue,
    itKw,
    tokensPerSecond:
      megawatts * INFERENCE_GROUND_BASELINE.tokensPerSecondPerProvisionedMegawatt,
    latencyMs: latencyMs(venue, state.utilization),
    rates: venueRates(venue),
  };
}

/**
 * Marginal cost of one reply's tokens at the stand-in joules per token.
 * This is not added on top of the duty-cycle integral. The session counters
 * already speed up while a prompt is in flight. The reply figures are the
 * per-prompt payoff, priced at each venue's rates.
 */
export function priceTokens(
  venue: VenueId,
  tokens: number,
  usageEstimated: boolean,
): ReplyCost {
  const safeTokens = Number.isFinite(tokens) && tokens > 0 ? tokens : 0;
  const rates = venueRates(venue);
  const itKwh = safeTokens / TOKENS_PER_IT_KWH;
  return {
    tokens: safeTokens,
    itKwh,
    energyCostUsd: itKwh * rates.costUsdPerItKwh,
    waterLiters: itKwh * rates.waterLitersPerKwh,
    latencyMs: latencyMs(venue, SIMULATION.inferenceUtilization),
    usageEstimated,
  };
}

/** Facility-free check used by the stand-in comment: joules should match the baseline. */
export function joulesPerToken(): number {
  return JOULES_PER_TOKEN;
}

function itKilowatts(utilization: number): number {
  return SIMULATION.clusterMegawatts * 1_000 * clamp01(utilization);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
