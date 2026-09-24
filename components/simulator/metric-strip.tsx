"use client";

import { TEN_YEAR_CLUSTER_COST_USD } from "@/lib/starcloud/constants";
import {
  formatLiters,
  formatMillionsUsd,
  formatSessionUsd,
} from "@/lib/starcloud/format";
import { SourcesNote } from "@/components/simulator/sources-note";
import { useSimulator } from "@/components/simulator/simulator-provider";
import { WaterCup } from "@/components/simulator/water-cup";

export function MetricStrip() {
  const { space, ground } = useSimulator();
  const label = "text-[11px] tracking-[0.16em] text-white/45 uppercase";
  const value = "min-w-0 text-right font-mono text-base whitespace-nowrap tabular-nums sm:text-lg";

  return (
    <section aria-label="Live metrics" className="min-w-0 border border-white bg-black">
      <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-6 sm:px-5 sm:py-4">
        <span />
        <span className={`${label} text-right`}>Space</span>
        <span className={`${label} text-right`}>Ground</span>

        <span className={label}>Cost</span>
        <span className={`${value} text-white`}>
          {formatSessionUsd(space.energyCostUsd)}
        </span>
        <span className={`${value} text-white`}>
          {formatSessionUsd(ground.energyCostUsd)}
        </span>

        <span className={label}>Water</span>
        <span className={`${value} text-water`}>
          {formatLiters(space.waterLiters)} L
        </span>
        <span className="flex items-center justify-end gap-2">
          <WaterCup liters={ground.waterLiters} label="Ground water" />
          <span className={`${value} text-water`}>
            {formatLiters(ground.waterLiters)} L
          </span>
        </span>

        <span className={label}>Latency</span>
        <span className={`${value} text-white`}>{space.latencyMs.toFixed(1)} ms</span>
        <span className={`${value} text-white`}>{ground.latencyMs.toFixed(1)} ms</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/25 px-4 py-2 sm:px-5">
        <p className="text-[11px] text-white/40">
          10 years · {formatMillionsUsd(TEN_YEAR_CLUSTER_COST_USD.space)} ·{" "}
          {formatMillionsUsd(TEN_YEAR_CLUSTER_COST_USD.ground)}
        </p>
        <SourcesNote />
      </div>
    </section>
  );
}
