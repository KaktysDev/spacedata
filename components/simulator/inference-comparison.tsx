"use client";

import { useEffect, useRef } from "react";

import type { ChatAnswer } from "@/lib/starcloud/chat-types";
import { PAPER } from "@/lib/starcloud/constants";
import {
  priceTokens,
  venueRates,
  type ReplyCost,
} from "@/lib/starcloud/engine";
import {
  formatCompactCount,
  formatMilliliters,
  formatUsdPlain,
  formatWattHours,
} from "@/lib/starcloud/format";
import { useSimulator } from "@/components/simulator/simulator-provider";

const BILLION = 1_000_000_000;

function formatMultiple(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}×`;
}

function DeltaTile({
  value,
  detail,
  label,
  water,
}: {
  value: string;
  detail?: string;
  label: string;
  water?: boolean;
}) {
  return (
    <div className="border border-white bg-black px-3 py-3">
      <p
        className={`font-mono text-[1.35rem] leading-none tracking-tight tabular-nums sm:text-2xl ${water ? "text-water" : "text-white"}`}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-2 font-mono text-[11px] text-white/55 tabular-nums">
          {detail}
        </p>
      ) : null}
      <p className="mt-2 text-[10px] tracking-[0.16em] text-white/55 uppercase">
        {label}
      </p>
    </div>
  );
}

function AnswerColumn({
  kicker,
  title,
  answer,
  cost,
}: {
  kicker: string;
  title: string;
  answer: ChatAnswer;
  cost: ReplyCost;
}) {
  return (
    <article className="flex min-w-0 flex-col border border-white bg-black px-4 py-4 sm:px-5">
      <p className="text-[10px] tracking-[0.22em] text-white/55 uppercase">
        {kicker}
      </p>
      <h3 className="mt-1 text-lg leading-tight font-medium tracking-tight">
        {title}
      </h3>
      <p className="mt-4 max-h-48 overflow-y-auto text-[15px] leading-7 whitespace-pre-wrap text-white">
        {answer.text}
      </p>
      <p className="mt-4 border-t border-white/40 pt-3 font-mono text-[12px] leading-5 text-white/80 tabular-nums">
        {formatCompactCount(cost.tokens)} tok · {formatWattHours(cost.itKwh)} ·{" "}
        <span className="text-water">{formatMilliliters(cost.waterLiters)}</span>
        {" · "}
        {cost.latencyMs.toFixed(1)} ms
      </p>
    </article>
  );
}

export function InferenceComparison() {
  const { prompt, result, error, showBaseline, reducedMotion } = useSimulator();
  const panelRef = useRef<HTMLElement>(null);
  const quoted =
    prompt && prompt.length > 180 ? `${prompt.slice(0, 177)}…` : prompt;

  useEffect(() => {
    panelRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }, [reducedMotion]);

  if (!result) {
    return (
      <section
        ref={panelRef}
        aria-label="Inference result"
        className="border border-white bg-black px-4 py-4 sm:px-5"
      >
        <p className="text-[10px] tracking-[0.22em] text-white/55 uppercase">
          Inference
        </p>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-white">
          {error ?? "The model response was incomplete."}
        </p>
        {quoted ? (
          <p className="mt-3 text-sm leading-6 text-white/50">“{quoted}”</p>
        ) : null}
        <button
          type="button"
          onClick={showBaseline}
          className="mt-4 min-h-11 border border-white px-4 text-[11px] tracking-[0.18em] uppercase hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          40 MW baseline
        </button>
      </section>
    );
  }

  const spaceCost = priceTokens(
    "space",
    result.space.totalTokens,
    result.space.usageEstimated,
  );
  const groundCost = priceTokens(
    "ground",
    result.ground.totalTokens,
    result.ground.usageEstimated,
  );
  const priceMultiple =
    venueRates("ground").costUsdPerItKwh / venueRates("space").costUsdPerItKwh;
  const perBillionSpace = priceTokens("space", BILLION, false);
  const perBillionGround = priceTokens("ground", BILLION, false);
  const usageEstimated =
    result.space.usageEstimated || result.ground.usageEstimated;

  return (
    <section
      ref={panelRef}
      aria-label="Prompt comparison"
      className="grid gap-3"
    >
      <div className="border border-white bg-black px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[10px] tracking-[0.22em] text-white/55 uppercase">
            This prompt
          </p>
          <p className="font-mono text-[10px] tracking-[0.12em] text-white/40 uppercase">
            {result.provider === "xai" ? "Grok" : "OpenAI"} · {result.model}
          </p>
        </div>
        <h2 className="mt-3 text-[1.65rem] leading-none font-medium tracking-tight sm:text-3xl">
          Ground costs {formatMultiple(priceMultiple)} more
        </h2>
        {quoted ? (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">
            “{quoted}”
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <DeltaTile
            value={formatUsdPlain(perBillionGround.energyCostUsd)}
            detail={`${formatUsdPlain(perBillionSpace.energyCostUsd)} in orbit`}
            label="Per 1B tokens"
          />
          <DeltaTile
            value={`+${formatMilliliters(groundCost.waterLiters)}`}
            detail="Space stays 0"
            label="Ground water"
            water
          />
          <DeltaTile
            value={`+${(groundCost.latencyMs - spaceCost.latencyMs).toFixed(1)} ms`}
            detail={`${spaceCost.latencyMs.toFixed(1)} → ${groundCost.latencyMs.toFixed(1)}`}
            label="Shell latency"
          />
          <DeltaTile
            value={formatCompactCount(spaceCost.tokens)}
            detail={`${formatCompactCount(groundCost.tokens)} on ground`}
            label="Space tokens"
          />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <AnswerColumn
          kicker="Space"
          title="Starcloud"
          answer={result.space}
          cost={spaceCost}
        />
        <AnswerColumn
          kicker="Ground"
          title="Terrestrial"
          answer={result.ground}
          cost={groundCost}
        />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-3xl text-[11px] leading-5 text-white/45">
          One billion tokens at the H100 stand-in also uses{" "}
          <span className="text-water">
            {perBillionGround.waterLiters.toFixed(0)} L
          </span>{" "}
          on the ground and none in orbit. Throughput is mapped from
          provisioned megawatts onto the paper’s compute load. Latency is the
          shell stub. {usageEstimated ? "Token totals were estimated from length. " : ""}
          {PAPER.organization}, “{PAPER.title}”, {PAPER.version}.
        </p>
        <button
          type="button"
          onClick={showBaseline}
          className="min-h-11 shrink-0 border border-white px-4 text-[11px] tracking-[0.18em] uppercase hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          40 MW baseline
        </button>
      </div>
    </section>
  );
}
