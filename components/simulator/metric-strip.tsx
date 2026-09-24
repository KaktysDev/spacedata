"use client";

import { SIMULATION, VACUUM_VS_FIBER } from "@/lib/starcloud/constants";
import {
  formatCompactCount,
  formatKwh,
  formatLiters,
  formatPercent,
  formatPue,
  formatSessionUsd,
  formatUsdPerKwh,
} from "@/lib/starcloud/format";
import { useSimulator } from "@/components/simulator/simulator-provider";
import { WaterCup } from "@/components/simulator/water-cup";
import type { VenueSnapshot } from "@/lib/starcloud/engine";

function MetricCard({
  label,
  unit,
  space,
  ground,
  water,
  caption,
  captionShort,
}: {
  label: string;
  unit: string;
  space: string;
  ground: string;
  water?: boolean;
  caption?: string;
  captionShort?: string;
}) {
  const valueClass = water ? "text-water" : "text-white";

  return (
    <article className="min-w-0 border border-white bg-black px-3.5 py-3 sm:px-4">
      <div className="flex items-center justify-between gap-3">
        <h2
          className={`text-[10px] tracking-[0.22em] uppercase ${water ? "text-water" : "text-white/70"}`}
        >
          {label}
        </h2>
        <span className="text-[10px] tracking-[0.16em] text-white/45 uppercase">
          {unit}
        </span>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="text-[10px] tracking-[0.18em] text-white/55 uppercase">
          Space
        </span>
        <span className={`font-mono text-xl tabular-nums sm:text-2xl ${valueClass}`}>
          {space}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[10px] tracking-[0.18em] text-white/55 uppercase">
          Ground
        </span>
        <span className={`font-mono text-sm tabular-nums ${valueClass}`}>
          {ground}
        </span>
      </div>
      {caption ? (
        <p className="mt-2.5 text-[10px] leading-4 tracking-tight text-white/45">
          <span className="sm:hidden">{captionShort ?? caption}</span>
          <span className="hidden sm:inline">{caption}</span>
        </p>
      ) : null}
    </article>
  );
}

function rateCaption(sample: VenueSnapshot): string {
  return `${formatCompactCount(sample.tokensPerSecond)}/s`;
}

export function MetricStrip() {
  const { space, ground } = useSimulator();
  const vacuumFasterPct = Math.round(VACUUM_VS_FIBER.fasterBy * 100);
  const dutyPct = Math.round(space.utilization * 100);

  return (
    <section aria-label="Live metrics">
      <p className="mb-2 text-[10px] tracking-[0.16em] text-white/45 uppercase">
        {SIMULATION.clusterMegawatts} MW cluster · shell duty {dutyPct}% · H100
        token stand-in
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Tokens"
          unit="Count"
          space={formatCompactCount(space.tokens)}
          ground={formatCompactCount(ground.tokens)}
          caption={`${rateCaption(space)} at this duty cycle`}
          captionShort={rateCaption(space)}
        />
        <MetricCard
          label="Energy"
          unit="IT kWh"
          space={formatKwh(space.itKwh)}
          ground={formatKwh(ground.itKwh)}
          caption={`${formatUsdPerKwh(space.rates.energyUsdPerKwh)} · ${formatUsdPerKwh(ground.rates.energyUsdPerKwh)} /kWh`}
          captionShort={`${formatUsdPerKwh(space.rates.energyUsdPerKwh)} · ${formatUsdPerKwh(ground.rates.energyUsdPerKwh)}`}
        />
        <article className="min-w-0 border border-white bg-black px-3.5 py-3 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[10px] tracking-[0.22em] text-water uppercase">
              Water
            </h2>
            <span className="text-[10px] tracking-[0.16em] text-white/45 uppercase">
              Liters
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[10px] tracking-[0.18em] text-white/55 uppercase">
              Space
            </span>
            <span className="flex items-center gap-2">
              <WaterCup liters={space.waterLiters} label="Space water cup, empty" />
              <span className="font-mono text-xl text-water tabular-nums sm:text-2xl">
                {formatLiters(space.waterLiters)}
              </span>
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <span className="text-[10px] tracking-[0.18em] text-white/55 uppercase">
              Ground
            </span>
            <span className="flex items-center gap-2">
              <WaterCup liters={ground.waterLiters} label="Ground water cup" />
              <span className="font-mono text-sm text-water tabular-nums">
                {formatLiters(ground.waterLiters)}
              </span>
            </span>
          </div>
          <p className="mt-2.5 text-[10px] leading-4 text-white/45">
            {SIMULATION.waterCupLiters} L cup · space stays 0
          </p>
        </article>
        <MetricCard
          label="Cost"
          unit="USD"
          space={formatSessionUsd(space.energyCostUsd)}
          ground={formatSessionUsd(ground.energyCostUsd)}
          caption="Ground adds the 5% chiller share"
          captionShort="Ground +5% chillers"
        />
        <MetricCard
          label="Latency"
          unit="ms"
          space={space.latencyMs.toFixed(1)}
          ground={ground.latencyMs.toFixed(1)}
          caption={`Vacuum ~${vacuumFasterPct}% faster than fiber · shell ms`}
          captionShort={`Vacuum ~${vacuumFasterPct}% · shell ms`}
        />
        <MetricCard
          label="Efficiency"
          unit="PUE · CF"
          space={`${formatPue(space.rates.pue)} · ${formatPercent(space.rates.capacityFactor)}`}
          ground={`${formatPue(ground.rates.pue)} · ${formatPercent(ground.rates.capacityFactor)}`}
          caption="PUE is a shell stand-in · space CF is inside >95%"
          captionShort="PUE shell · CF >95% / ~24%"
        />
      </div>
    </section>
  );
}
