import {
  CAPACITY_FACTOR,
  ENERGY_USD_PER_KWH,
  LATENCY_STUB_MS,
  PUE,
  SOLAR_ARRAY,
  TEN_YEAR_CLUSTER_COST_USD,
  TERRESTRIAL_WATER_TEN_YEAR_TONS,
  WATER_LITERS_PER_KWH,
} from "@/lib/starcloud/constants";

export type VenueReading = {
  space: number;
  ground: number;
};

export type TelemetrySample = {
  pue: VenueReading;
  energyUsdPerKwh: VenueReading;
  waterLitersPerKwh: VenueReading;
  latencyMs: VenueReading;
  capacityFactor: VenueReading;
  /**
   * Ground energy sample divided by the space energy sample.
   * Space is the reference index 1, not a paper measurement.
   * Tick 0 is 0.045 / 0.002 = 22.5. The paper states this comparison as 22×.
   */
  energyCostMultiple: VenueReading;
  /**
   * Yield of the same solar array versus a US terrestrial farm.
   * Ground is the reference index 1. Space applies the paper's ~40% peak
   * uplift to the live capacity factors. Tick 0 uses the shell display
   * point 0.964, so it sits above the paper's "over 5 times" lower bound
   * (1.40 × 0.95 / 0.24), which lives on SOLAR_ARRAY.
   */
  arrayYieldMultiple: VenueReading;
  /** Table 1 water over 10 years, tons. Space stays exactly 0. No wander. */
  waterTenYearTons: VenueReading;
  /** Table 1 cost balance, US dollars. No wander. */
  tenYearClusterCostUsd: VenueReading;
};

/**
 * Display wander for the five live cards. Zero at tick 0, so the first
 * sample matches the baselines and server HTML matches the client.
 * Amplitudes are shell animation. They are not white-paper measurements.
 */
function drift(tick: number, phase: number): number {
  return Math.sin(tick * 0.9 + phase) - Math.sin(phase);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Shell clamps. They keep the wandering cards inside the paper's stated
 * bands. They are not extra measurements.
 * Space capacity stays strictly above 95% (floor is 95% + 0.1 percentage points).
 * Ground capacity stays near the US ~24% median, under the 50% Earth ceiling.
 * Ground water stays near ~0.5 L/kWh.
 */
const SHELL_CLAMP = {
  capacitySpaceFloor: CAPACITY_FACTOR.spaceMinimum + 0.001,
  capacitySpaceCeiling: 0.985,
  capacityGroundFloor: 0.2,
  capacityGroundCeiling: 0.3,
  waterGroundFloor: 0.46,
  waterGroundCeiling: 0.54,
} as const;

export function sampleTelemetry(tick: number): TelemetrySample {
  const pue = {
    space: PUE.space + drift(tick, 0.4) * 0.004,
    ground: PUE.ground + drift(tick, 1.7) * 0.006,
  };
  const energyUsdPerKwh = {
    space: ENERGY_USD_PER_KWH.space + drift(tick, 0.9) * 0.00008,
    ground: ENERGY_USD_PER_KWH.terrestrialUs + drift(tick, 2.2) * 0.0009,
  };
  const waterLitersPerKwh = {
    space: WATER_LITERS_PER_KWH.space,
    ground: clamp(
      WATER_LITERS_PER_KWH.terrestrial + drift(tick, 1.3) * 0.01,
      SHELL_CLAMP.waterGroundFloor,
      SHELL_CLAMP.waterGroundCeiling,
    ),
  };
  const latencyMs = {
    space: LATENCY_STUB_MS.space + drift(tick, 0.6) * 0.55,
    ground: LATENCY_STUB_MS.ground + drift(tick, 2.4) * 0.7,
  };
  const capacityFactor = {
    space: clamp(
      CAPACITY_FACTOR.spaceDisplay + drift(tick, 0.25) * 0.007,
      SHELL_CLAMP.capacitySpaceFloor,
      SHELL_CLAMP.capacitySpaceCeiling,
    ),
    ground: clamp(
      CAPACITY_FACTOR.terrestrialSolarUs + drift(tick, 1.6) * 0.006,
      SHELL_CLAMP.capacityGroundFloor,
      SHELL_CLAMP.capacityGroundCeiling,
    ),
  };

  return {
    pue,
    energyUsdPerKwh,
    waterLitersPerKwh,
    latencyMs,
    capacityFactor,
    energyCostMultiple: {
      space: 1,
      ground: energyUsdPerKwh.ground / energyUsdPerKwh.space,
    },
    arrayYieldMultiple: {
      space:
        SOLAR_ARRAY.peakRatioVersusTerrestrial *
        (capacityFactor.space / capacityFactor.ground),
      ground: 1,
    },
    waterTenYearTons: {
      space: 0,
      ground: TERRESTRIAL_WATER_TEN_YEAR_TONS,
    },
    tenYearClusterCostUsd: {
      space: TEN_YEAR_CLUSTER_COST_USD.space,
      ground: TEN_YEAR_CLUSTER_COST_USD.ground,
    },
  };
}

/** First-paint sample. drift(0) is 0, so this equals the shell baselines. */
export const TELEMETRY_BASELINE: TelemetrySample = sampleTelemetry(0);
