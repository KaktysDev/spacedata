import {
  CAPACITY_FACTOR,
  ENERGY_USD_PER_KWH,
  LATENCY_STUB_MS,
  PUE,
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
};

/** Zero on the first paint, then a slow wander so each second visibly ticks. */
function drift(tick: number, phase: number): number {
  return Math.sin(tick * 0.9 + phase) - Math.sin(phase);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sampleTelemetry(tick: number): TelemetrySample {
  return {
    pue: {
      space: PUE.space + drift(tick, 0.4) * 0.004,
      ground: PUE.ground + drift(tick, 1.7) * 0.006,
    },
    energyUsdPerKwh: {
      space: ENERGY_USD_PER_KWH.space + drift(tick, 0.9) * 0.00008,
      ground: ENERGY_USD_PER_KWH.terrestrialUs + drift(tick, 2.2) * 0.0009,
    },
    waterLitersPerKwh: {
      space: WATER_LITERS_PER_KWH.space,
      ground: clamp(
        WATER_LITERS_PER_KWH.terrestrial + drift(tick, 1.3) * 0.01,
        0.46,
        0.54,
      ),
    },
    latencyMs: {
      space: LATENCY_STUB_MS.space + drift(tick, 0.6) * 0.55,
      ground: LATENCY_STUB_MS.ground + drift(tick, 2.4) * 0.7,
    },
    capacityFactor: {
      space: clamp(
        CAPACITY_FACTOR.spaceDisplay + drift(tick, 0.25) * 0.007,
        CAPACITY_FACTOR.spaceMinimum + 0.001,
        0.985,
      ),
      ground: clamp(
        CAPACITY_FACTOR.terrestrialSolarUs + drift(tick, 1.6) * 0.006,
        0.2,
        0.3,
      ),
    },
  };
}
