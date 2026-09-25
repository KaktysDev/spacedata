"use client";

import {
  CAPACITY_FACTOR,
  ENERGY_USD_PER_KWH,
  PAPER,
  TEN_YEAR_CLUSTER_COST_USD,
  WATER_LITERS_PER_KWH,
} from "@/lib/starcloud/constants";
import {
  formatMillionsUsd,
} from "@/lib/starcloud/format";

export function SourcesNote() {
  return (
    <details className="group">
      <summary className="cursor-pointer text-[11px] tracking-[0.16em] text-white/45 uppercase">
        Sources
      </summary>
      <div className="mt-3 space-y-2 text-[12px] leading-5 text-white/60">
        <p>
          Ten-year, 40 MW cluster:{" "}
          {formatMillionsUsd(TEN_YEAR_CLUSTER_COST_USD.space)} in orbit,{" "}
          {formatMillionsUsd(TEN_YEAR_CLUSTER_COST_USD.ground)} on the ground.
        </p>
        <p>
          Energy about ${ENERGY_USD_PER_KWH.space.toFixed(3)}/kWh versus $
          {ENERGY_USD_PER_KWH.terrestrialUs.toFixed(3)}/kWh. Water 0 versus
          about {WATER_LITERS_PER_KWH.terrestrial} L/kWh. Capacity factor above{" "}
          {Math.round(CAPACITY_FACTOR.spaceMinimum * 100)}% versus about{" "}
          {Math.round(CAPACITY_FACTOR.terrestrialSolarUs * 100)}%.
        </p>
        <p className="text-white/45">
          {PAPER.organization}, “{PAPER.title}”, white paper {PAPER.version},{" "}
          {PAPER.date}. Latency milliseconds and tokens per kilowatt-hour are
          stand-ins in constants.ts.
        </p>
      </div>
    </details>
  );
}
