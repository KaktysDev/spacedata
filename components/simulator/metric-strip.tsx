"use client";

import { useEffect, useState } from "react";

import {
  formatLatencyMs,
  formatLitersPerKwh,
  formatPercent,
  formatPue,
  formatUsdPerKwh,
} from "@/lib/starcloud/format";
import { sampleTelemetry, type TelemetrySample } from "@/lib/starcloud/telemetry";

type CardModel = {
  label: string;
  unit: string;
  space: string;
  ground: string;
  water?: boolean;
};

function cardsFrom(sample: TelemetrySample): CardModel[] {
  return [
    {
      label: "PUE",
      unit: "Ratio",
      space: formatPue(sample.pue.space),
      ground: formatPue(sample.pue.ground),
    },
    {
      label: "Energy",
      unit: "$/kWh",
      space: formatUsdPerKwh(sample.energyUsdPerKwh.space),
      ground: formatUsdPerKwh(sample.energyUsdPerKwh.ground),
    },
    {
      label: "Water",
      unit: "L/kWh",
      space: formatLitersPerKwh(sample.waterLitersPerKwh.space),
      ground: formatLitersPerKwh(sample.waterLitersPerKwh.ground),
      water: true,
    },
    {
      label: "Latency",
      unit: "ms",
      space: formatLatencyMs(sample.latencyMs.space),
      ground: formatLatencyMs(sample.latencyMs.ground),
    },
    {
      label: "Capacity",
      unit: "Factor",
      space: formatPercent(sample.capacityFactor.space),
      ground: formatPercent(sample.capacityFactor.ground),
    },
  ];
}

function MetricCard({ label, unit, space, ground, water }: CardModel) {
  const valueClass = water ? "text-water" : "text-white";

  return (
    <article className="border border-white bg-black px-3.5 py-3 sm:px-4">
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
        <span className={`font-mono text-2xl tabular-nums ${valueClass}`}>
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
    </article>
  );
}

export function MetricStrip() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const cards = cardsFrom(sampleTelemetry(tick));

  return (
    <section aria-label="Live metrics">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>
    </section>
  );
}
